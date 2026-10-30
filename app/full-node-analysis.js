import { validate, cardName, RANKS } from "./engine.js";
import { actionKey } from "./full-model.js";
import { boardEquity } from "./full-game.js";
import { summarizeRange } from "./analytics.js";

export function nodePolicy(node, profile) {
  if (profile === "baseline") return node.policy;
  if (profile !== "model") throw Error("Unknown analysis profile");
  return node.player === 0 ? node.adjusted : node.model;
}
// Actual profile reach includes BOTH players' earlier actions. This is distinct
// from the counterfactual opponent reach used to grade a hero decision's EV.
export function nodeReach(result, path = "root", profile = "model") {
  if (!["baseline", "model"].includes(profile))
    throw Error("Unknown analysis profile");
  if (path !== "root" && !path.startsWith("root/"))
    throw Error("Invalid analysis path");
  const original = validate(result.scenario),
    ranges = [original.hero, original.villain];
  let node = result.root,
    logReach = 0;
  const history = [];
  let joint = original.pairs.map((p) => p.weight);
  const factors = ranges.map((range) => range.map((h) => h.weight));
  function normalize() {
    const mass = joint.reduce((a, b) => a + b, 0);
    if (!mass) {
      logReach = -Infinity;
      return;
    }
    logReach += Math.log(mass);
    joint = joint.map((w) => w / mass);
  }
  for (const step of path.split("/").slice(1)) {
    if (node.type === "action") {
      const a = node.actions.findIndex(
        (action) => "a:" + actionKey(action) === step,
      );
      if (a < 0) throw Error("Unknown analysis action");
      const policy = nodePolicy(node, profile);
      if (!policy)
        throw Error("Evaluate this solution before inspecting its model");
      joint = joint.map(
        (w, k) =>
          w *
          (policy[node.player ? original.pairs[k].j : original.pairs[k].i]?.[
            a
          ] || 0),
      );
      const own = factors[node.player];
      for (let i = 0; i < own.length; i++) own[i] *= policy[i]?.[a] || 0;
      const max = Math.max(...own);
      if (max) for (let i = 0; i < own.length; i++) own[i] /= max;
      history.push({ node, choice: a });
      node = node.children[a];
    } else if (node.type === "chance") {
      const key = Object.keys(node.children).find(
        (c) => "c:" + cardName(Number(c)) === step,
      );
      if (key === undefined) throw Error("Unknown analysis board card");
      const card = Number(key),
        denominator = 52 - node.board.length - 4;
      joint = joint.map((w, k) => {
        const p = original.pairs[k];
        return ranges[0][p.i].cards.includes(card) ||
          ranges[1][p.j].cards.includes(card)
          ? 0
          : w / denominator;
      });
      ranges.forEach((range, player) =>
        range.forEach((h, i) => {
          if (h.cards.includes(card)) factors[player][i] = 0;
        }),
      );
      history.push({ node, choice: key });
      node = node.children[key];
    } else throw Error("Analysis path continues after the hand ends");
    normalize();
  }
  return {
    node,
    history,
    profile,
    logReach,
    reach: Math.exp(logReach),
    reachable: logReach !== -Infinity,
    game: {
      board: node.board,
      hero: original.hero.map((h, i) => ({ ...h, weight: factors[0][i] })),
      villain: original.villain.map((h, i) => ({
        ...h,
        weight: factors[1][i],
      })),
      pairs: original.pairs.flatMap((p, i) =>
        joint[i] > 0 ? [{ ...p, weight: joint[i] }] : [],
      ),
    },
  };
}

export function analyzeNode(
  result,
  path = "root",
  profile = "model",
  cache = new Map(),
) {
  const context = nodeReach(result, path, profile);
  if (!context.reachable)
    return { ...context, hero: null, villain: null, frequencies: null };
  const g = context.game;
  const equities = g.pairs.map((p) =>
    boardEquity(g.hero[p.i].cards, g.villain[p.j].cards, g.board, cache),
  );
  const hero = summarizeRange(g, equities),
    villain = summarizeRange(g, equities, "villain");
  const node = context.node,
    policy = node.type === "action" ? nodePolicy(node, profile) : null;
  const frequencies = policy
    ? node.actions.map((_, a) =>
        (node.player === 0 ? hero : villain).hands.reduce(
          (sum, h, i) => sum + h.mass * (policy[i]?.[a] || 0),
          0,
        ),
      )
    : null;
  return { ...context, hero, villain, frequencies };
}

export function weightedMatrix(hands) {
  const groups = new Map();
  for (const h of hands) {
    if (!h.mass) continue;
    const ranks = h.cards.map((c) => Math.floor(c / 4)).sort((a, b) => b - a);
    const label =
      RANKS[ranks[0]] +
      RANKS[ranks[1]] +
      (ranks[0] === ranks[1]
        ? ""
        : h.cards[0] % 4 === h.cards[1] % 4
          ? "s"
          : "o");
    const group = groups.get(label) || { mass: 0, combos: [] };
    group.mass += h.mass;
    group.combos.push({ label: h.label, mass: h.mass });
    groups.set(label, group);
  }
  const ranks = [...RANKS].reverse();
  return ranks.flatMap((r, i) =>
    ranks.map((c, j) => {
      const label = i === j ? r + c : i < j ? r + c + "s" : c + r + "o";
      return { label, ...(groups.get(label) || { mass: 0, combos: [] }) };
    }),
  );
}
