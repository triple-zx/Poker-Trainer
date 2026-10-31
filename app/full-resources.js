import {
  validateFull,
  initialState,
  transition,
  nextStreet,
  configuredFullActions,
  FULL_NODE_LIMIT,
} from "./full-game.js";
import { fullCandidates } from "./full-sizing.js";
import { FULL_POLICY_VALUE_LIMIT } from "./limits.js";
import { rangeBoardCoverage } from "./full-cards.js";

// Count public board coverage as a UNION of compatible deals, not pair count
// times 45/44. A board may support some private hands and block others.
export function fullBoardCoverage(g) {
  const boards = [0, 0, 0],
    rows = [
      [0, 0, 0],
      [0, 0, 0],
    ];
  function count(extra, multiplicity = 1) {
    const coverage = rangeBoardCoverage(
      [g.hero, g.villain],
      [...g.board, ...extra],
    );
    if (!coverage.pairCount) return;
    const street = extra.length;
    boards[street] += multiplicity;
    rows[0][street] += multiplicity * coverage.actors[0].size;
    rows[1][street] += multiplicity * coverage.actors[1].size;
  }
  count([]);
  for (let turn = 0; turn < 52; turn++) {
    if (g.board.includes(turn)) continue;
    count([turn]);
    // Coverage is invariant to turn/river order; retain both ordered boards
    // in the totals while computing their private-card blockers only once.
    for (let river = turn + 1; river < 52; river++)
      if (!g.board.includes(river)) count([turn, river], 2);
  }
  return { boards, rows };
}

export function estimateFullResources(s) {
  const g = validateFull(s),
    coverage = fullBoardCoverage(g),
    betting = fullCandidates(s),
    memo = new Map();
  // Nine coefficients: node totals by street, then per-actor action slots by
  // street. All public boards share the same betting-state structure.
  function count(state) {
    const depth = state.board.length - 3;
    const key = JSON.stringify([
      depth,
      state.type,
      state.spent,
      state.street,
      state.player,
      state.checks,
      state.lastRaise,
      state.raises,
    ]);
    if (memo.has(key)) return memo.get(key);
    if (memo.size >= 100000)
      throw Error(
        "Resource preflight exceeds its state budget. Reduce candidate sizes or stacks.",
      );
    const values = Array(9).fill(0);
    values[depth] = 1;
    const add = (next) => count(next).forEach((n, i) => (values[i] += n));
    if (state.type === "action") {
      const actions = configuredFullActions(s, state, betting);
      values[3 + state.player * 3 + depth] = actions.length;
      for (const action of actions) add(transition(s, state, action));
    } else if (state.type === "chance") {
      const card = Array.from({ length: 52 }, (_, i) => i).find(
        (c) => !state.board.includes(c),
      );
      add(nextStreet(state, card));
    }
    if (values.some((n) => !Number.isSafeInteger(n)))
      throw Error(
        "Resource estimate exceeds safe numeric limits. Reduce sizes or stacks.",
      );
    memo.set(key, values);
    return values;
  }
  const counts = count(initialState(s));
  const byStreet = coverage.boards.map((n, i) => n * counts[i]);
  const nodes = byStreet.reduce((a, b) => a + b, 0);
  const policyValues = coverage.rows.reduce(
    (sum, row, player) =>
      sum +
      row.reduce((total, n, i) => total + n * counts[3 + player * 3 + i], 0),
    0,
  );
  return {
    nodes,
    byStreet,
    publicBoards: coverage.boards,
    policyValues,
    // This is ONLY a compact baseline-probability payload, not total RAM.
    compactPolicyBytes: policyValues * 8,
    pairRunouts: g.pairs.length * 45 * 44,
    withinNodeBudget: nodes <= FULL_NODE_LIMIT,
    withinPolicyBudget: policyValues <= FULL_POLICY_VALUE_LIMIT,
    policyValueLimit: FULL_POLICY_VALUE_LIMIT,
    nodeLimit: FULL_NODE_LIMIT,
    bettingStates: memo.size,
  };
}

export function assertFullCapacity(s) {
  const estimate = estimateFullResources(s);
  if (!estimate.withinNodeBudget)
    throw Error(
      `Preflight counts ${estimate.nodes.toLocaleString("en-US")} nodes, above the ${FULL_NODE_LIMIT.toLocaleString("en-US")}-node capacity. Reduce candidate sizes or stacks, use Fast instead of Deep, or import a smaller solved scenario. No solver run was started.`,
    );
  if (!estimate.withinPolicyBudget)
    throw Error(
      `Preflight counts ${estimate.policyValues.toLocaleString("en-US")} probabilities, above the ${FULL_POLICY_VALUE_LIMIT.toLocaleString("en-US")}-probability capacity. Reduce ranges, candidate sizes or stacks. No solver run was started.`,
    );
  return estimate;
}
