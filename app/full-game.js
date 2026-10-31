import { validate, cards, cardName, rank7 } from "./engine.js";
import { validateFullModel, modelLocks } from "./full-model.js";
import { firstPlayer } from "./positions.js";
import { validateTendencies, opponentPolicy } from "./opponent-tendencies.js";
import { fullCardContext } from "./full-cards.js";
import { fullReachContext } from "./full-reach.js";
import {
  packMatrix,
  mapMatrix,
  matrixRow,
  createMatrixArena,
} from "./full-matrix.js";
import { FULL_POLICY_VALUE_LIMIT } from "./limits.js";
import {
  validateFullSizing,
  fullCandidates,
  selectNodeMenu,
  chooseMenuLimits,
} from "./full-sizing.js";

const EPS = 0.00001;
const round = (n) => Math.round(n * 1000) / 1000;
export const FULL_NODE_LIMIT = 600000;
export function validateFull(s) {
  const g = validate(s);
  if (s.game !== "full") throw Error("Choose full-hand training");
  if (s.rake && s.cap)
    throw Error("Full-hand native training currently requires zero rake");
  if (s.pot < 4 || s.stack < 1 || s.stack / s.pot > 3)
    throw Error(
      "Full-hand trees support a pot of at least 4 bb and stacks from 1 bb to 3 times the pot",
    );
  if (s.sizing) throw Error("Use full-hand sizing settings");
  validateFullSizing(s);
  for (const street of ["flop", "turn", "river"]) {
    const cfg = s.betting?.[street];
    if (!cfg) throw Error("Missing " + street + " sizes");
    for (const kind of ["bet", "raise"]) {
      const a = cfg[kind];
      if (
        !Array.isArray(a) ||
        !a.length ||
        a.length > 2 ||
        new Set(a).size !== a.length ||
        a.some(
          (v) =>
            !Number.isFinite(v) || v < (kind === "raise" ? 50 : 25) || v > 200,
        )
      )
        throw Error(
          "Choose one or two distinct " +
            street +
            " " +
            kind +
            " percentages between " +
            (kind === "raise" ? 50 : 25) +
            " and 200",
        );
    }
  }
  validateFullModel(s);
  validateTendencies(s);
  return g;
}
export function initialState(s) {
  return {
    board: cards(s.flop),
    spent: [0, 0],
    street: [0, 0],
    player: firstPlayer(s),
    firstPlayer: firstPlayer(s),
    checks: 0,
    lastRaise: 1,
    raises: 0,
    type: "action",
  };
}
export function transition(s, state, action) {
  if (state.type !== "action") throw Error("Action at a non-decision");
  const p = state.player,
    other = 1 - p,
    gap = round(state.spent[other] - state.spent[p]);
  const n = {
    ...state,
    spent: [...state.spent],
    street: [...state.street],
    player: other,
  };
  const finish = () => {
    n.type =
      n.board.length === 5 || n.spent.every((x) => Math.abs(x - s.stack) < EPS)
        ? "terminal"
        : "chance";
    n.winner = -1;
    return n;
  };
  if (action.kind === "FOLD") {
    if (gap <= EPS) throw Error("Cannot fold without a bet");
    return { ...n, type: "terminal", winner: other };
  }
  if (action.kind === "CHECK") {
    if (gap > EPS) throw Error("Cannot check facing a bet");
    n.checks++;
    return n.checks === 2 ? finish() : n;
  }
  if (action.kind === "CALL") {
    if (gap <= EPS) throw Error("Cannot call without a bet");
    n.spent[p] = state.spent[other];
    n.street[p] = round(n.street[p] + gap);
    return finish();
  }
  if (
    !["BET", "RAISE"].includes(action.kind) ||
    (action.kind === "BET") !== gap <= EPS
  )
    throw Error("Invalid bet or raise");
  const amount = action.amount,
    remaining = round(s.stack - state.spent[p]),
    increment = round(amount - gap);
  if (
    !Number.isFinite(amount) ||
    amount > remaining + EPS ||
    increment <= EPS ||
    (increment < (gap > EPS ? state.lastRaise : 1) - EPS &&
      amount < remaining - EPS)
  )
    throw Error("Illegal bet or raise amount");
  n.spent[p] = round(n.spent[p] + amount);
  n.street[p] = round(n.street[p] + amount);
  n.lastRaise = increment;
  n.checks = 0;
  n.raises = (state.raises || 0) + 1;
  return n;
}
export function nextStreet(state, card) {
  if (
    state.type !== "chance" ||
    state.board.includes(card) ||
    !Number.isInteger(card) ||
    card < 0 ||
    card > 51
  )
    throw Error("Invalid street transition");
  return {
    ...state,
    type: "action",
    board: [...state.board, card],
    street: [0, 0],
    player: state.firstPlayer ?? 0,
    checks: 0,
    lastRaise: 1,
    raises: 0,
  };
}
export const streetName = (board) =>
  ["Flop", "Turn", "River"][board.length - 3];
export function fullActionLabel(action, state, s, t = (en) => en) {
  const p = state.player;
  if (action.kind === "CALL")
    return (
      t("Call ", "跟注 ") +
      round(state.spent[1 - p] - state.spent[p]) +
      t(" bb", " 大盲")
    );
  if (action.kind === "CHECK") return t("Check", "过牌");
  if (action.kind === "FOLD") return t("Fold", "弃牌");
  const allin = Math.abs(state.spent[p] + action.amount - s.stack) < EPS;
  return (
    (action.kind === "RAISE"
      ? t("Raise to ", "加注至 ") + round(state.street[p] + action.amount)
      : t("Bet ", "下注 ") + action.amount) +
    t(" bb", " 大盲") +
    (allin ? t(" · all-in", " · 全下") : "")
  );
}

// The same finite public action contract is used by import validation and
// preflight counting. It depends on betting state, never on private cards.
export function configuredFullActions(s, state, betting = fullCandidates(s)) {
  if (state.type !== "action") return [];
  const gap = state.spent[1 - state.player] - state.spent[state.player],
    kind = gap > EPS ? "RAISE" : "BET",
    remaining = round(s.stack - state.spent[state.player]),
    cfg = betting[streetName(state.board).toLowerCase()];
  const amounts =
    gap > EPS && state.raises >= 4
      ? []
      : [
          ...cfg[kind.toLowerCase()].map((percent) =>
            Math.min(
              remaining,
              round(((s.pot + 2 * Math.max(...state.spent)) * percent) / 100) +
                (gap > EPS ? gap : 0),
            ),
          ),
          remaining,
        ];
  return [
    ...(gap > EPS ? ["CALL", "FOLD"] : ["CHECK"]).map((kind) => ({ kind })),
    ...[
      ...new Set(amounts.map(round).filter((amount) => amount > gap + EPS)),
    ].map((amount) => ({ kind, amount })),
  ];
}

// The native export omits terminal children. Infer them only from legal game
// transitions; a missing nonterminal branch is an error, never a check-down.
export function convertFull(raw, s, { portable = false } = {}) {
  const g = validateFull(s),
    ranges = [g.hero, g.villain],
    betting = fullCandidates(s),
    cardContext = fullCardContext(g),
    policyArena = createMatrixArena();
  let count = 0,
    policyValues = 0;
  function visit(data, state) {
    if (++count > FULL_NODE_LIMIT)
      throw Error(
        "Tree exceeds the 600,000-node budget. Reduce sizes or stacks.",
      );
    if (state.type === "terminal")
      return {
        type: "terminal",
        board: state.board,
        spent: state.spent,
        winner: state.winner,
      };
    if (state.type === "chance") {
      if (
        portable ? data?.type !== "chance" : data?.node_type !== "chance_node"
      )
        throw Error("Missing chance continuation");
      const children = {};
      for (let c = 0; c < 52; c++) {
        if (
          state.board.includes(c) ||
          !cardContext.coverage([...state.board, c]).pairCount
        )
          continue;
        children[c] = visit(
          portable ? data.children?.[c] : data.dealcards?.[cardName(c)],
          nextStreet(state, c),
        );
      }
      return {
        type: "chance",
        board: state.board,
        spent: state.spent,
        children,
      };
    }
    if (
      (portable
        ? data?.type !== "action"
        : data?.node_type !== "action_node" ||
          data.player !== (state.player === firstPlayer(s) ? 1 : 0)) ||
      !Array.isArray(data.actions) ||
      !data.actions.length ||
      data.actions.length > 8
    )
      throw Error("Missing or unexpected decision node");
    const actions = data.actions.map((a) => {
      if (portable) {
        if (!a || !["CHECK", "CALL", "FOLD", "BET", "RAISE"].includes(a.kind))
          throw Error("Invalid saved action");
        return ["BET", "RAISE"].includes(a.kind)
          ? { kind: a.kind, amount: a.amount }
          : { kind: a.kind };
      }
      if (["CHECK", "CALL", "FOLD"].includes(a)) return { kind: a };
      const m = /^(BET|RAISE) ([0-9]+(?:\.[0-9]+)?)$/.exec(a);
      if (!m) throw Error("Invalid native action");
      return { kind: m[1], amount: Number(m[2]) / 1000 };
    });
    const gap = state.spent[1 - state.player] - state.spent[state.player];
    for (const required of gap > EPS ? ["CALL", "FOLD"] : ["CHECK"])
      if (!actions.some((a) => a.kind === required))
        throw Error("Missing legal passive action");
    if (new Set(actions.map((a) => JSON.stringify(a))).size !== actions.length)
      throw Error("Duplicate action");
    const kind = gap > EPS ? "RAISE" : "BET";
    const expected = configuredFullActions(s, state, betting)
      .filter((a) => a.kind === kind)
      .map((a) => a.amount);
    if (
      expected.some(
        (amount) =>
          !actions.some(
            (a) => a.kind === kind && Math.abs(a.amount - amount) < 0.0011,
          ),
      ) ||
      actions.filter((a) => a.kind === kind).length !== expected.length
    )
      throw Error("Native tree omitted or changed a configured size");
    if (
      !portable &&
      data.strategy?.actions &&
      JSON.stringify(data.strategy.actions) !== JSON.stringify(data.actions)
    )
      throw Error("Native strategy action order differs");
    const indices = cardContext.coverage(state.board).actors[state.player];
    policyValues += indices.size * actions.length;
    if (policyValues > FULL_POLICY_VALUE_LIMIT)
      throw Error(
        "Tree exceeds the 2,400,000-probability capacity. Reduce ranges, sizes or stacks.",
      );
    const policy = ranges[state.player].map((h, i) => {
      if (!indices.has(i)) return null;
      const v = portable
        ? data.policy?.[i]
        : data.strategy?.strategy?.[h.label] ||
          data.strategy?.strategy?.[h.label.slice(2) + h.label.slice(0, 2)];
      if (
        !Array.isArray(v) ||
        v.length !== actions.length ||
        v.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
        Math.abs(v.reduce((a, b) => a + b, 0) - 1) > 0.0001
      )
        throw Error("Missing or invalid legal-combination strategy");
      const mass = v.reduce((a, b) => a + b, 0);
      return v.map((x) => x / mass);
    });
    const children = actions.map((a, i) =>
      visit(
        portable ? data.children?.[i] : data.childrens?.[data.actions[i]],
        transition(s, state, a),
      ),
    );
    return {
      type: "action",
      board: state.board,
      spent: state.spent,
      street: state.street,
      player: state.player,
      actions,
      policy: packMatrix(policy, actions.length, policyArena),
      children,
    };
  }
  const root = visit(raw, initialState(s));
  return { root, nodes: count };
}

export function boardEquity(h, v, board, cache = new Map()) {
  const key =
    h.join(",") +
    "/" +
    v.join(",") +
    "/" +
    [...board].sort((a, b) => a - b).join(",");
  if (cache.has(key)) return cache.get(key);
  if (board.length === 5) {
    const a = rank7([...h, ...board]),
      b = rank7([...v, ...board]);
    const value = a === b ? 0.5 : +(a > b);
    cache.set(key, value);
    return value;
  }
  const used = [...h, ...v, ...board];
  let total = 0,
    count = 0;
  for (let c = 0; c < 52; c++)
    if (!used.includes(c)) {
      total += boardEquity(h, v, [...board, c], cache);
      count++;
    }
  const value = total / count;
  cache.set(key, value);
  return value;
}

// Counterfactual reach excludes the responding player's own choices. Maximize
// AFTER summing over the hidden opponent range, never once per private pair.
export function evaluateFull(tree, s, { store = true } = {}) {
  const g = validateFull(s),
    ranges = [g.hero, g.villain],
    cardContext = fullCardContext(g),
    reachContext = fullReachContext(g, cardContext);
  const modeled = new WeakSet(),
    modelArena = createMatrixArena();
  const locks = modelLocks(tree.root, s);
  const policies = (node, model) => {
    if (!model || node.player !== 1) return node.policy;
    if (modeled.has(node)) return node.model;
    node.model = mapMatrix(
      node.policy,
      node.actions.length,
      (v, i) => {
        if (!v) return null;
        if (locks.get(node)?.has(i)) return locks.get(node).get(i);
        return opponentPolicy(s, node, g.villain[i], v);
      },
      modelArena,
    );
    modeled.add(node);
    return node.model;
  };
  function response(player, model, record, limits = null) {
    const feedbackArena = createMatrixArena(),
      adjustedArena = createMatrixArena();
    function walk(node, reach) {
      const values = Array(ranges[player].length).fill(0);
      if (node.type === "terminal") {
        const pot = s.pot + node.spent[0] + node.spent[1];
        return reachContext.terminal(player, reach, node, pot);
      }
      if (node.type === "chance") {
        for (const [card, child] of Object.entries(node.children)) {
          const next = reachContext.chance(
            player,
            reach,
            Number(card),
            node.board.length,
          );
          const v = walk(child, next);
          v.forEach((x, i) => (values[i] += x));
        }
        return values;
      }
      const policy = policies(node, model);
      if (node.player !== player) {
        node.children.forEach((child, a) => {
          const v = walk(child, reachContext.action(reach, policy, a));
          v.forEach((x, i) => (values[i] += x));
        });
        return values;
      }
      const rows = node.children.map((child) => walk(child, reach));
      const masses = reachContext.masses(player, reach);
      const ev = values.map((_, i) =>
        masses[i] ? rows.map((row) => row[i] / masses[i]) : null,
      );
      const active = limits
        ? limits.frozen
          ? node.activeActions
          : selectNodeMenu(node.actions, rows, limits.maxBets, limits.maxRaises)
        : node.actions.map((_, i) => i);
      values.forEach(
        (_, i) => (values[i] = Math.max(...active.map((a) => rows[a][i]))),
      );
      if (record) {
        if (limits) {
          node.activeActions = active;
          node.sizingEV = packMatrix(ev, node.actions.length, feedbackArena);
        } else {
          node.ev = packMatrix(ev, node.actions.length, feedbackArena);
          delete node.activeActions;
          delete node.sizingEV;
        }
        node.adjusted = mapMatrix(
          ev,
          node.actions.length,
          (v, i) => {
            if (!v) return null;
            const policyRow = matrixRow(node.policy, i);
            const best = Math.max(...active.map((a) => v[a])),
              winners = active.filter((a) => Math.abs(v[a] - best) < 1e-8),
              mass = active.reduce((sum, a) => sum + policyRow[a], 0),
              baseline = policyRow.map((x, a) =>
                active.includes(a) ? (mass ? x / mass : 1 / active.length) : 0,
              ),
              winnerMass = winners.reduce((sum, a) => sum + baseline[a], 0);
            return v.map(
              (_, a) =>
                (1 - s.deviation) * baseline[a] +
                s.deviation *
                  (winners.includes(a)
                    ? winnerMass
                      ? baseline[a] / winnerMass
                      : 1 / winners.length
                    : 0),
            );
          },
          adjustedArena,
        );
      }
      return values;
    }
    return walk(tree.root, reachContext.initial(player)).reduce(
      (a, b) => a + b,
      0,
    );
  }
  const h = response(0, false, false),
    v = response(1, false, false);
  const modelEV = response(0, true, store);
  let selection = null;
  if (s.fullSizing) {
    const candidates = [],
      limits = [];
    for (let maxBets = 1; maxBets <= s.fullSizing.maxBets; maxBets++)
      for (let maxRaises = 1; maxRaises <= s.fullSizing.maxRaises; maxRaises++)
        limits.push({ maxBets, maxRaises });
    limits.sort(
      (a, b) =>
        a.maxBets + a.maxRaises - b.maxBets - b.maxRaises ||
        a.maxBets - b.maxBets,
    );
    let satisfiedComplexity = Infinity;
    for (const limit of limits) {
      const complexity = limit.maxBets + limit.maxRaises;
      if (complexity > satisfiedComplexity) break;
      const value = response(0, true, false, limit);
      candidates.push({ ...limit, value });
      if (modelEV - value <= s.fullSizing.lossTarget + 1e-10)
        satisfiedComplexity = complexity;
    }
    selection = {
      mode: s.fullSizing.mode,
      ...chooseMenuLimits(candidates, modelEV, s.fullSizing.lossTarget),
      testedLimits: candidates.length,
    };
    if (store) {
      response(0, true, true, selection);
      const measured = response(0, true, false, { frozen: true });
      if (Math.abs(measured - selection.value) > 1e-8)
        throw Error("Retained-menu EV verification failed");
      selection.value = measured;
      selection.loss = Math.max(0, modelEV - measured);
    }
  }
  return {
    full: true,
    schema: 2,
    scenario: structuredClone(s),
    ...tree,
    gap: Math.max(0, h + v - s.pot),
    modelEV,
    selection,
    ready: true,
    engine: "TexasSolver · independently evaluated full streets",
    coverage: g.pairs.length * 45 * 44,
    eq: g.pairs.map((_, k) => cardContext.equity(k, g.board)),
  };
}
