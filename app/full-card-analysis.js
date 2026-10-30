import { validate, cardName } from "./engine.js";
import { childPath, actionKey } from "./full-model.js";
import { nodeReach, analyzeNode } from "./full-node-analysis.js";

// One public chance decision, conditional on the exact preceding history.
// Do not average equally over cards: private-card removal changes their mass.
export function compareNextCards(
  result,
  path,
  profile = "model",
  cache = new Map(),
) {
  const context = nodeReach(result, path, profile),
    { node, game } = context;
  if (node.type !== "chance" || ![3, 4].includes(node.board.length))
    throw Error("Choose a turn or river deal in the saved tree");
  const original = validate(result.scenario);
  const legalPairs = original.pairs.filter(
    (p) =>
      ![...original.hero[p.i].cards, ...original.villain[p.j].cards].some((c) =>
        node.board.includes(c),
      ),
  );
  const cards = Array.from({ length: 52 }, (_, c) => c).filter(
    (c) =>
      !node.board.includes(c) &&
      legalPairs.some(
        (p) =>
          !original.hero[p.i].cards.includes(c) &&
          !original.villain[p.j].cards.includes(c),
      ),
  );
  if (
    !cards.length ||
    Object.keys(node.children).length !== cards.length ||
    cards.some((c) => {
      const child = node.children[c];
      return (
        !child ||
        child.board.length !== node.board.length + 1 ||
        child.board.at(-1) !== c ||
        node.board.some((v, i) => child.board[i] !== v)
      );
    })
  )
    throw Error("Incomplete or invalid next-card coverage");
  const empty = () => ({
    equity: 0,
    categories: Array(9).fill(0),
    flushDraw: 0,
    straightDraw: 0,
  });
  const weighted = context.reachable
    ? { hero: empty(), villain: empty(), actions: [] }
    : null;
  const actions = new Map();
  let actor;
  const rows = cards.map((card) => {
    const nextPath = childPath(path, node, card),
      child = node.children[card];
    const probability = context.reachable
      ? game.pairs.reduce(
          (sum, p) =>
            sum +
            (!game.hero[p.i].cards.includes(card) &&
            !game.villain[p.j].cards.includes(card)
              ? p.weight / (52 - node.board.length - 4)
              : 0),
          0,
        )
      : null;
    const row = {
      card,
      name: cardName(card),
      path: nextPath,
      probability,
      hero: null,
      villain: null,
      player: child.type === "action" ? child.player : null,
      actions: child.actions || [],
      frequencies: null,
    };
    if (!probability) return row;
    if (child.type !== "action")
      throw Error("Expected a street-opening decision after this card");
    if (actor !== undefined && actor !== child.player)
      throw Error("Cannot combine different acting players");
    actor = child.player;
    const report = analyzeNode(result, nextPath, profile, cache);
    if (
      !report.reachable ||
      !report.frequencies ||
      report.frequencies.some((p) => !Number.isFinite(p) || p < 0) ||
      Math.abs(report.frequencies.reduce((a, b) => a + b, 0) - 1) > 1e-8
    )
      throw Error("Missing strategy coverage for a reachable next card");
    for (const side of ["hero", "villain"]) {
      const summary = report[side];
      row[side] = {
        equity: summary.equity,
        categories: summary.categories,
        flushDraw: summary.flushDraw,
        straightDraw: summary.straightDraw,
      };
      for (const key of ["equity", "flushDraw", "straightDraw"])
        weighted[side][key] += probability * summary[key];
      summary.categories.forEach(
        (p, i) => (weighted[side].categories[i] += probability * p),
      );
    }
    row.frequencies = report.frequencies;
    child.actions.forEach((action, a) => {
      const key = actionKey(action);
      const entry = actions.get(key) || { ...action, frequency: 0 };
      entry.frequency += probability * report.frequencies[a];
      actions.set(key, entry);
    });
    return row;
  });
  const probabilityMass = context.reachable
    ? rows.reduce((sum, row) => sum + row.probability, 0)
    : null;
  if (context.reachable && Math.abs(probabilityMass - 1) > 1e-8)
    throw Error("Next-card probabilities do not cover the complete deal");
  if (weighted) weighted.actions = [...actions.values()];
  return {
    path,
    profile,
    board: node.board,
    reachable: context.reachable,
    reach: context.reach,
    logReach: context.logReach,
    rows,
    weighted,
    player: actor ?? null,
    probabilityMass,
    positiveCards: rows.filter((row) => row.probability > 0).length,
  };
}
