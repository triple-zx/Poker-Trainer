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
  remodelSolution,
  scenarioPackage,
} from "../app/solution-package.js";
import {
  editFullModel,
  modelBasis,
  modelLocks,
  childPath,
} from "../app/full-model.js";
import { FullSession } from "../app/full-session.js";
import { rangeDocument } from "../app/preflop-ranges.js";

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

test("full solution schema 5 preserves range provenance without changing policies or EVs", () => {
  const source = rangeDocument({
    type: "poker-trainer-range",
    schema: 1,
    name: "Source-tagged study subset",
    range: "AhKh",
    originalRange: "AKs",
    context: { tableFormat: "6max", position: "BTN", stackBB: 100 },
    source: { label: "Original study model", notes: "No equilibrium claim" },
  });
  const updated = remodelSolution(original, {
    ...scenario,
    rangeOrigins: { hero: source },
  }).result;
  const pkg = solutionPackage(updated);
  assert.equal(pkg.schema, 5);
  const restored = restorePackage(JSON.parse(JSON.stringify(pkg))).result;
  assert.deepEqual(restored.scenario.rangeOrigins.hero, source);
  assert.equal(restored.gap, original.gap);
  assert.equal(restored.modelEV, original.modelEV);
  assert.deepEqual(restored.root.ev, original.root.ev);
  assert.equal(restored.nodes, original.nodes);
  const bad = structuredClone(pkg);
  bad.scenario.rangeOrigins.hero.range = "AdKd:1";
  assert.throws(() => restorePackage(bad), /provenance/);
});

test("in-position packages keep actor/range identity, root opponent edits and all-street training", () => {
  // Same physical game: swap logical hero/opponent, leave the physical policies intact.
  const data = JSON.parse(exported);
  data.scenario = {
    ...scenario,
    heroPosition: "ip",
    hero: scenario.villain,
    villain: scenario.hero,
  };
  const ip = restorePackage(data).result;
  assert.equal(ip.root.player, 1);
  assert.equal(ip.root.children[0].player, 0);
  assert.ok(Math.abs(ip.gap - original.gap) < 1e-12);
  assert.ok(sameScenario(scenario, { ...scenario, heroPosition: "oop" }));
  assert.equal(
    sameScenario(scenario, { ...scenario, heroPosition: "ip" }),
    false,
  );
  assert.throws(
    () => remodelSolution(original, { ...scenario, heroPosition: "ip" }),
    /new baseline/,
  );
  const edited = editFullModel(ip.scenario, "root", "AhKh", {
    CHECK: 1,
    "BET:1": 0,
  });
  const updated = remodelSolution(ip, edited).result;
  assert.deepEqual(updated.root.model, [[1, 0]]);
  const restored = restorePackage(solutionPackage(updated)).result;
  assert.deepEqual(restored.root.model, [[1, 0]]);
  assert.equal(restored.scenario.heroPosition, "ip");
  assert.equal(solutionPackage(restored).schema, 3);
  const scenarioOnly = scenarioPackage(restored.scenario);
  assert.equal(scenarioOnly.schema, 3);
  assert.equal(restorePackage(scenarioOnly).result, null);
  assert.ok(
    sameScenario(restorePackage(scenarioOnly).scenario, restored.scenario),
  );
  assert.equal(solutionPackage(original).schema, 2);
  assert.equal(scenarioPackage(scenario).schema, 1);
  const session = new FullSession(restored, null, () => 0);
  for (const street of ["Flop", "Turn", "River"]) {
    assert.equal(session.node.player, 1);
    assert.match(session.advance().text, /Opponent · Check/);
    assert.equal(session.advance(), null);
    session.choose(0);
    assert.equal(session.decisions.at(-1).street, street);
    assert.ok(session.decisions.at(-1).ev.every(Number.isFinite));
    session.advance();
  }
  assert.equal(session.finished, true);
  assert.equal(session.decisions.length, 3);
});

test("opponent edits reuse baseline, preserve unrelated decisions and survive sharing", () => {
  const path = "root/a:CHECK";
  const edited = editFullModel(scenario, path, "QcQd", {
    CHECK: 0,
    "BET:1": 1,
  });
  edited.tendency = -1;
  const { result } = remodelSolution(original, edited);
  assert.equal(result.gap, original.gap);
  assert.deepEqual(result.root.children[0].model[0], [0, 1]);
  assert.deepEqual(result.root.children[1].model[0], [0, 1]); // Unlocked: tendency folds to hero's bet.
  assert.deepEqual(original.root.children[0].model[0], [0.5, 0.5]);
  assert.equal(sameScenario(scenario, edited), false);
  const restored = restorePackage(solutionPackage(result)).result;
  assert.equal(solutionPackage(result).schema, 3);
  assert.equal(restored.modelEV, result.modelEV);
  assert.deepEqual(restored.scenario.fullModel, edited.fullModel);
  const cleared = editFullModel(edited, path, "QcQd", null);
  assert.equal(cleared.fullModel, undefined);
  assert.deepEqual(
    remodelSolution(original, cleared).result.root.children[0].model[0],
    [0.5, 0.5],
  );
});

test("hand-class tendencies reuse the baseline, yield to node locks and share as schema 4", () => {
  const modeled = {
    ...scenario,
    fullTendencies: {
      bluff: -0.5,
      raise: -1,
      classes: { 1: { bet: 1, call: -1 } },
    },
  };
  const result = remodelSolution(original, modeled).result;
  assert.equal(result.gap, original.gap);
  assert.deepEqual(result.root.children[0].model[0], [0, 1]);
  assert.deepEqual(result.root.children[1].model[0], [0, 1]);
  const pack = solutionPackage(result);
  assert.equal(pack.schema, 4);
  const restored = restorePackage(pack).result;
  assert.deepEqual(restored.scenario.fullTendencies, modeled.fullTendencies);
  assert.equal(restored.modelEV, result.modelEV);
  assert.equal(sameScenario(modeled, scenario), false);
  const only = scenarioPackage(modeled);
  assert.equal(only.schema, 4);
  assert.deepEqual(
    restorePackage(only).scenario.fullTendencies,
    modeled.fullTendencies,
  );
  const locked = editFullModel(modeled, "root/a:CHECK", "QcQd", {
    CHECK: 1,
    "BET:1": 0,
  });
  assert.deepEqual(
    remodelSolution(result, locked).result.root.children[0].model[0],
    [1, 0],
  );
  const corrupt = structuredClone(pack);
  corrupt.scenario.fullTendencies.classes[1].bet = 9;
  assert.throws(() => restorePackage(corrupt), /tendencies/);
});

test("turn and river opponent bets resolve by public history and leave other runouts unchanged", () => {
  let node = original.root,
    path = "root";
  for (let street = 0; street < 3; street++) {
    path = childPath(path, node, 0);
    node = node.children[0];
    const edited = editFullModel(scenario, path, "QcQd", {
      CHECK: 0.2,
      "BET:1": 0.8,
    });
    const locks = modelLocks(original.root, edited);
    assert.deepEqual(locks.get(node).get(0), [0.2, 0.8]);
    assert.equal(locks.has(original.root.children[1]), false);
    if (street < 2) {
      path = childPath(path, node, 0);
      node = node.children[0];
      const card = Object.keys(node.children)[0];
      path = childPath(path, node, card);
      node = node.children[card];
    }
  }
});

test("opponent edits reject incomplete, stale and impossible distributions", () => {
  const edit = (path, combo, row) => editFullModel(scenario, path, combo, row);
  assert.throws(
    () => edit("root/a:CHECK", "QcQd", { CHECK: 0.6, "BET:1": 0.5 }),
    /100%/,
  );
  assert.throws(
    () => edit("root/a:CHECK", "QcQd", { CHECK: NaN, "BET:1": 1 }),
    /100%/,
  );
  assert.throws(
    () => modelLocks(original.root, edit("root/a:CHECK", "QcQd", { CHECK: 1 })),
    /every legal action/,
  );
  assert.throws(
    () =>
      modelLocks(
        original.root,
        edit("root/a:CHECK", "AcAd", { CHECK: 0, "BET:1": 1 }),
      ),
    /unavailable/,
  );
  assert.throws(
    () =>
      modelLocks(original.root, edit("root/a:RAISE:99", "QcQd", { CHECK: 1 })),
    /unknown/,
  );
  const edited = edit("root/a:CHECK", "QcQd", { CHECK: 0, "BET:1": 1 });
  assert.throws(
    () => modelLocks(original.root, { ...edited, stack: 2 }),
    /different tree/,
  );
  assert.throws(
    () =>
      remodelSolution(original, {
        ...scenario,
        iterations: scenario.iterations + 1,
      }),
    /new baseline/,
  );
  assert.throws(
    () => remodelSolution(original, { ...scenario, flop: "As7d3c" }),
    /new baseline/,
  );
  assert.equal(
    modelBasis(scenario),
    modelBasis({ ...scenario, tendency: 0.7, deviation: 0.1, name: "changed" }),
  );
});

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
