import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, validate } from "../app/engine.js";
import { initialState, transition, nextStreet } from "../app/full-game.js";
import {
  fullBoardCoverage,
  estimateFullResources,
  assertFullCapacity,
} from "../app/full-resources.js";
import { run } from "../native/adapter.mjs";
const sizes = (bet = [50], raise = [100]) =>
  Object.fromEntries(["flop", "turn", "river"].map((k) => [k, { bet, raise }]));
const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh",
  villain: "QcQd",
  pot: 10,
  stack: 15,
  betting: sizes(),
};

test("public coverage unions compatible deals and counts actor rows after card removal", () => {
  assert.deepEqual(fullBoardCoverage(validate(scenario)), {
    boards: [1, 45, 1980],
    rows: [
      [1, 45, 1980],
      [1, 45, 1980],
    ],
  });
  const wider = fullBoardCoverage(validate({ ...scenario, hero: "AhKh,9h8h" }));
  assert.deepEqual(wider, {
    boards: [1, 47, 2154],
    rows: [
      [2, 90, 3960],
      [1, 47, 2154],
    ],
  });
});

test("preflight matches independently expanded check/all-in trees in both positions", () => {
  for (const heroPosition of ["oop", "ip"]) {
    const s = {
      ...scenario,
      heroPosition,
      pot: 4,
      stack: 1,
      hero: "AhKh,9h8h",
      betting: sizes([25]),
    };
    const g = validate(s),
      byStreet = [0, 0, 0];
    let policyValues = 0;
    function visit(state) {
      byStreet[state.board.length - 3]++;
      if (state.type === "terminal") return;
      const pairs = g.pairs.filter(
        (p) =>
          ![...g.hero[p.i].cards, ...g.villain[p.j].cards].some((c) =>
            state.board.includes(c),
          ),
      );
      if (state.type === "chance") {
        for (let c = 0; c < 52; c++)
          if (
            !state.board.includes(c) &&
            pairs.some(
              (p) =>
                ![...g.hero[p.i].cards, ...g.villain[p.j].cards].includes(c),
            )
          )
            visit(nextStreet(state, c));
        return;
      }
      // Independently known action set for a one-blind stack, avoiding the
      // estimator/import action generator as an oracle.
      const actions =
        state.spent[1 - state.player] > state.spent[state.player]
          ? [{ kind: "CALL" }, { kind: "FOLD" }]
          : [{ kind: "CHECK" }, { kind: "BET", amount: 1 }];
      policyValues +=
        new Set(pairs.map((p) => (state.player ? p.j : p.i))).size *
        actions.length;
      for (const action of actions) visit(transition(s, state, action));
    }
    visit(initialState(s));
    const estimate = estimateFullResources(s);
    assert.deepEqual(estimate.byStreet, byStreet);
    assert.equal(
      estimate.nodes,
      byStreet.reduce((a, b) => a + b, 0),
    );
    assert.equal(estimate.policyValues, policyValues);
    assert.equal(estimate.compactPolicyBytes, policyValues * 8);
    assert.equal(estimate.withinNodeBudget, true);
  }
});

test("preflight reproduces recorded native fixture counts and retained caps do not hide cost", () => {
  const ip = estimateFullResources({ ...scenario, heroPosition: "ip" });
  assert.equal(ip.nodes, 114636);
  const deep = {
    ...scenario,
    hero: "AhKh,9h8h",
    pot: 4,
    stack: 3,
    fullSizing: { mode: "deep", maxBets: 1, maxRaises: 1, lossTarget: 0.01 },
  };
  const estimate = estimateFullResources(deep);
  assert.equal(estimate.nodes, 229446);
  assert.equal(estimate.pairRunouts, 3960);
  assert.deepEqual(
    estimate,
    estimateFullResources({
      ...deep,
      iterations: 10000,
      deviation: 0,
      tendency: 1,
      fullSizing: { ...deep.fullSizing, maxBets: 3, maxRaises: 3 },
    }),
  );
  assert.equal(assertFullCapacity(deep).nodes, estimate.nodes);
});

test("oversized trees are rejected by the native entry point before solver work", async () => {
  const oversized = {
    ...scenario,
    stack: 30,
    betting: sizes([25, 50], [50, 100]),
  };
  const estimate = estimateFullResources(oversized);
  assert.equal(estimate.nodes, 3652248);
  assert.equal(estimate.withinNodeBudget, false);
  assert.throws(() => assertFullCapacity(oversized), /3,652,248.*600,000/);
  await assert.rejects(
    run(oversized),
    /Preflight counts.*No solver run was started/,
  );
  const deeper = estimateFullResources({
    ...oversized,
    fullSizing: { mode: "deep", maxBets: 1, maxRaises: 1, lossTarget: 0.01 },
  });
  assert.ok(deeper.nodes > estimate.nodes);
  assert.equal(
    estimateFullResources({ ...oversized, stack: 1 }).withinNodeBudget,
    true,
  );
});
