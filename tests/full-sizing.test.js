import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, validate } from "../app/engine.js";
import {
  initialState,
  transition,
  nextStreet,
  boardEquity,
  evaluateFull,
  validateFull,
} from "../app/full-game.js";
import {
  selectNodeMenu,
  chooseMenuLimits,
  fullCandidates,
} from "../app/full-sizing.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { commands } from "../native/adapter.mjs";

test("one public sizing menu serves the whole range and keeps passive actions", () => {
  const actions = [
    { kind: "CHECK" },
    { kind: "BET", amount: 1 },
    { kind: "BET", amount: 2 },
  ];
  const rows = [
    [0, 0],
    [3, 0],
    [0, 4],
  ];
  assert.deepEqual(selectNodeMenu(actions, rows, 1, 1), [0, 2]);
  assert.deepEqual(selectNodeMenu(actions, rows, 2, 1), [0, 1, 2]);
  assert.deepEqual(
    selectNodeMenu(
      actions,
      [
        [2, 2],
        [1, 0],
        [0, 1],
      ],
      1,
      1,
    ),
    [0],
  );
  const raises = [
    { kind: "FOLD" },
    { kind: "CALL" },
    { kind: "RAISE", amount: 2 },
    { kind: "RAISE", amount: 3 },
  ];
  assert.deepEqual(
    selectNodeMenu(
      raises,
      [
        [0, 0],
        [1, 1],
        [3, 0],
        [0, 4],
      ],
      3,
      1,
    ),
    [0, 1, 3],
  );
});
test("size limits use measured whole-tree loss and explicitly report an unmet target", () => {
  const options = [
    { maxBets: 1, maxRaises: 1, value: 4 },
    { maxBets: 2, maxRaises: 1, value: 7 },
  ];
  assert.equal(chooseMenuLimits(options, 7, 0).maxBets, 2);
  assert.equal(chooseMenuLimits(options, 7, 3).maxBets, 1);
  assert.equal(
    chooseMenuLimits(options.slice(0, 1), 7, 0.1).targetReached,
    false,
  );
});

const s = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh,9h8h",
  villain: "QcQd,KsKd",
  pot: 4,
  stack: 2,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((street) => [
      street,
      { bet: [25, 50], raise: [100] },
    ]),
  ),
  fullSizing: { mode: "fast", maxBets: 1, maxRaises: 1, lossTarget: 0 },
};
test("deep candidates extend configured sizes and native commands use exactly that set", () => {
  const deep = {
    ...s,
    pot: 10,
    stack: 15,
    fullSizing: { ...s.fullSizing, mode: "deep" },
  };
  const candidates = fullCandidates(deep);
  assert.deepEqual(candidates.flop.bet, [25, 29.4, 37.5, 50]);
  assert.deepEqual(candidates.river.raise, [75, 100]);
  assert.match(commands(deep), /set_bet_sizes oop,turn,bet,25,29.4,37.5,50/);
  assert.deepEqual(s.betting.flop.bet, [25, 50]);
  assert.throws(() =>
    validateFull({ ...s, fullSizing: { ...s.fullSizing, maxBets: 0 } }),
  );
  assert.throws(() =>
    validateFull({ ...s, fullSizing: { ...s.fullSizing, lossTarget: -1 } }),
  );
});

function fixture() {
  const g = validate(s),
    ranges = [g.hero, g.villain];
  let nodes = 0;
  function build(state) {
    nodes++;
    if (state.type === "terminal") return state;
    const compatible = (board) =>
      g.pairs.filter(
        (p) =>
          ![...g.hero[p.i].cards, ...g.villain[p.j].cards].some((c) =>
            board.includes(c),
          ),
      );
    if (state.type === "chance")
      return {
        ...state,
        children: Object.fromEntries(
          Array.from({ length: 52 }, (_, c) => c)
            .filter(
              (c) =>
                !state.board.includes(c) &&
                compatible([...state.board, c]).length,
            )
            .map((c) => [c, build(nextStreet(state, c))]),
        ),
      };
    const gap = state.spent[1 - state.player] - state.spent[state.player],
      remaining = s.stack - state.spent[state.player];
    const actions =
      gap > 0 ? [{ kind: "CALL" }, { kind: "FOLD" }] : [{ kind: "CHECK" }];
    const pot = s.pot + 2 * Math.max(...state.spent);
    const amounts = [
      ...new Set([
        ...(gap > 0 ? [100] : [25, 50]).map((p) =>
          Math.min(remaining, (pot * p) / 100 + (gap > 0 ? gap : 0)),
        ),
        remaining,
      ]),
    ].filter((a) => a > gap);
    for (const amount of amounts)
      actions.push({ kind: gap > 0 ? "RAISE" : "BET", amount });
    const pairs = compatible(state.board);
    const policy = ranges[state.player].map((_, i) =>
      pairs.some((p) => (state.player ? p.j : p.i) === i)
        ? actions.map(() => 1 / actions.length)
        : null,
    );
    return {
      ...state,
      actions,
      policy,
      children: actions.map((a) => build(transition(s, state, a))),
    };
  }
  const root = build(initialState(s));
  return { root, nodes };
}
// Separate per-hero-hand traversal checks the value of the stored, fixed menus.
// Hidden opponent probabilities are summed before each hero maximization.
function frozenValue(result) {
  const g = validate(s),
    cache = new Map();
  return g.hero.reduce((total, h, i) => {
    function walk(node, weights) {
      if (node.type === "terminal")
        return weights.reduce(
          (sum, w, j) =>
            sum +
            w *
              ((node.winner < 0
                ? boardEquity(h.cards, g.villain[j].cards, node.board, cache)
                : +(node.winner === 0)) *
                (s.pot + node.spent[0] + node.spent[1]) -
                node.spent[0]),
          0,
        );
      if (node.type === "chance")
        return Object.entries(node.children).reduce(
          (sum, [card, child]) =>
            sum +
            walk(
              child,
              weights.map((w, j) =>
                h.cards.includes(+card) || g.villain[j].cards.includes(+card)
                  ? 0
                  : w / (52 - node.board.length - 4),
              ),
            ),
          0,
        );
      if (node.player === 0)
        return Math.max(
          ...node.activeActions.map((a) => walk(node.children[a], weights)),
        );
      return node.children.reduce(
        (sum, child, a) =>
          sum +
          walk(
            child,
            weights.map((w, j) => w * (node.model[j]?.[a] || 0)),
          ),
        0,
      );
    }
    const weights = g.villain.map(
      (_, j) => g.pairs.find((p) => p.i === i && p.j === j)?.weight || 0,
    );
    return total + walk(result.root, weights);
  }, 0);
}
test("full-tree sizing is independently valued, keeps all practice branches and survives sharing", () => {
  const tree = fixture(),
    r = evaluateFull(tree, s),
    selection = r.selection;
  assert.ok(Math.abs(frozenValue(r) - selection.value) < 1e-9);
  assert.ok(
    Math.abs(selection.loss - (selection.fullValue - selection.value)) < 1e-9,
  );
  assert.equal(selection.targetReached, selection.loss <= 1e-10);
  const streets = new Set();
  let alternate = 0;
  function inspect(n) {
    if (n.type === "terminal") return;
    if (n.type === "chance") {
      Object.values(n.children).forEach(inspect);
      return;
    }
    if (n.player === 0) {
      streets.add(n.board.length);
      assert.ok(
        n.activeActions.filter((a) => n.actions[a].kind === "BET").length <= 1,
      );
      assert.ok(
        n.activeActions.filter((a) => n.actions[a].kind === "RAISE").length <=
          1,
      );
      for (const [i, row] of n.adjusted.entries())
        if (row) {
          assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-10);
          assert.equal(n.ev[i].length, n.actions.length);
          row.forEach((p, a) => {
            if (!n.activeActions.includes(a)) assert.equal(p, 0);
          });
        }
      alternate += n.actions.length - n.activeActions.length;
    }
    assert.equal(n.children.length, n.actions.length);
    n.children.forEach(inspect);
  }
  inspect(r.root);
  assert.deepEqual([...streets].sort(), [3, 4, 5]);
  assert.ok(alternate > 0);
  const imported = restorePackage(
    JSON.parse(JSON.stringify(solutionPackage(r))),
  ).result;
  assert.deepEqual(imported.scenario.fullSizing, s.fullSizing);
  assert.deepEqual(imported.selection, r.selection);
  assert.deepEqual(imported.root.activeActions, r.root.activeActions);
  assert.deepEqual(imported.root.adjusted, r.root.adjusted);
  const loose = evaluateFull(tree, {
    ...s,
    fullSizing: {
      ...s.fullSizing,
      maxBets: 3,
      maxRaises: 3,
      lossTarget: s.pot,
    },
  });
  assert.equal(loose.selection.targetReached, true);
  assert.equal(
    loose.selection.testedLimits,
    1,
    "Stop searching larger limits once the smallest pair meets the target",
  );
});
