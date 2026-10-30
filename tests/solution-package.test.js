import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards } from "../app/engine.js";
import {
  initialState,
  transition,
  nextStreet,
  evaluateFull,
} from "../app/full-game.js";
import {
  solutionPackage,
  restorePackage,
  sameScenario,
} from "../app/solution-package.js";
import { FullSession } from "../app/full-session.js";

const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh",
  villain: "QcQd",
  pot: 4,
  stack: 1,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((street) => [
      street,
      { bet: [25], raise: [100] },
    ]),
  ),
};
const privateCards = cards(scenario.hero + scenario.villain);
let nodes = 0;
function make(state) {
  nodes++;
  if (state.type === "terminal") return state;
  if (state.type === "chance")
    return {
      ...state,
      children: Object.fromEntries(
        Array.from({ length: 52 }, (_, c) => c)
          .filter((c) => !state.board.includes(c) && !privateCards.includes(c))
          .map((c) => [c, make(nextStreet(state, c))]),
      ),
    };
  const actions =
    state.spent[1 - state.player] > state.spent[state.player]
      ? [{ kind: "CALL" }, { kind: "FOLD" }]
      : [{ kind: "CHECK" }, { kind: "BET", amount: 1 }];
  return {
    ...state,
    actions,
    policy: [[0.5, 0.5]],
    children: actions.map((a) => make(transition(scenario, state, a))),
  };
}
const original = evaluateFull(
  {
    root: make(initialState(scenario)),
    get nodes() {
      return nodes;
    },
  },
  scenario,
);
const exported = JSON.stringify(
  solutionPackage({ ...original, records: [{ secret: "personal journal" }] }),
);

test("solved packages round-trip full coverage, EVs and independent gap without a solver", () => {
  const { result } = restorePackage(JSON.parse(exported));
  assert.equal(result.nodes, original.nodes);
  assert.equal(result.gap, original.gap);
  assert.equal(result.modelEV, original.modelEV);
  assert.deepEqual(result.root.ev, original.root.ev);
  assert.ok(sameScenario(result.scenario, scenario));
  assert.ok(!exported.includes("personal journal"));
  for (const key of [
    '"ev":',
    '"adjusted":',
    '"model":',
    '"gap":',
    '"spent":',
    '"board":',
    '"ready":',
  ])
    assert.ok(!exported.includes(key), key + " must be reconstructed");
  let seed = 42;
  const rng = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const streets = new Set();
  for (let i = 0; i < 50; i++) {
    const hand = new FullSession(result, null, rng);
    for (let steps = 0; !hand.finished; steps++) {
      assert.ok(steps < 40);
      if (hand.node.type === "action" && hand.node.player === 0)
        hand.choose(i % 2 ? 0 : Math.floor(rng() * hand.node.actions.length));
      else hand.advance();
    }
    for (const d of hand.decisions) {
      streets.add(d.street);
      assert.ok(Number.isFinite(d.loss) && d.loss >= 0);
    }
  }
  assert.deepEqual([...streets].sort(), ["Flop", "River", "Turn"]);
});

test("import rejects missing later-street branches, invalid strategies and changed size settings", () => {
  const missing = JSON.parse(exported);
  const turn = Object.values(missing.tree.children[0].children[0].children)[0];
  const riverChance = turn.children[0].children[0];
  delete riverChance.children[Object.keys(riverChance.children)[0]];
  assert.throws(() => restorePackage(missing), /Missing/);
  const bad = JSON.parse(exported);
  bad.tree.policy[0] = [0.8, 0.8];
  assert.throws(() => restorePackage(bad), /strategy/);
  const wrongGame = JSON.parse(exported);
  wrongGame.scenario.stack = 2;
  assert.throws(() => restorePackage(wrongGame), /configured size/);
  const wrongAction = JSON.parse(exported);
  wrongAction.tree.actions[1].amount = -1;
  assert.throws(() => restorePackage(wrongAction), /configured size|Illegal/);
});

test("claimed readiness, EVs, winner and gap cannot override revalidated results", () => {
  const tampered = JSON.parse(exported);
  tampered.ready = true;
  tampered.gap = 0;
  tampered.tree.ev = [[999, 999]];
  tampered.tree.children[1].children[0] = {
    type: "terminal",
    winner: 0,
    spent: [0, 100],
  };
  const restored = restorePackage(tampered).result;
  assert.equal(restored.gap, original.gap);
  assert.deepEqual(restored.root.ev, original.root.ev);
  assert.deepEqual(restored.root.children[1].children[0].spent, [1, 1]);
});

test("scenario-only imports remain unready and unknown package versions fail", () => {
  assert.equal(restorePackage({ schema: 1, scenario }).result, null);
  assert.throws(() => restorePackage({ schema: 77, scenario }), /Unsupported/);
  assert.throws(
    () => solutionPackage({ ...original, ready: false }),
    /Precompute/,
  );
  const reordered = Object.fromEntries(Object.entries(scenario).reverse());
  assert.ok(sameScenario(scenario, reordered));
  assert.ok(!sameScenario(scenario, { ...scenario, tendency: 0.5 }));
});
