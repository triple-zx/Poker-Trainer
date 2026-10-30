import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards, equity } from "../app/engine.js";
import {
  initialState,
  transition,
  nextStreet,
  evaluateFull,
} from "../app/full-game.js";
import { editFullModel } from "../app/full-model.js";
import {
  flopGroupSettings,
  summarizeSavedFlop,
  aggregateFlops,
  compareSavedFlops,
} from "../app/flop-report.js";

const base = {
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
function fixture(flop, opening, name) {
  const scenario = { ...base, flop, name },
    privateCards = cards(scenario.hero + scenario.villain);
  let nodes = 0;
  function make(state) {
    nodes++;
    if (state.type === "terminal") return state;
    if (state.type === "chance")
      return {
        ...state,
        children: Object.fromEntries(
          Array.from({ length: 52 }, (_, c) => c)
            .filter(
              (c) => !state.board.includes(c) && !privateCards.includes(c),
            )
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
  const root = make(initialState(scenario));
  root.policy = [opening];
  return evaluateFull({ root, nodes }, scenario);
}
const first = fixture("As7d2c", [0.8, 0.2], "Ace-high"),
  second = fixture("Js7d2c", [0.25, 0.75], "Jack-high");
const summary = (r, profile = "baseline") =>
  summarizeSavedFlop(r, r.scenario, profile);
const entries = () => [
  { name: "Ace-high", weight: 1, summary: summary(first) },
  { name: "Jack-high", weight: 3, summary: summary(second) },
];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("multi-flop reports use explicit equal/custom weights and preserve quality evidence", () => {
  const equal = aggregateFlops(entries());
  assert.equal(equal.groups.length, 1);
  const group = equal.groups[0];
  assert.equal(group.flops, 2);
  close(group.rows[0].share, 0.5);
  close(group.actions.find((a) => a.kind === "BET").frequency, 0.475);
  const a = equity(
    cards(base.hero),
    cards(base.villain),
    cards(first.scenario.flop),
  );
  const b = equity(
    cards(base.hero),
    cards(base.villain),
    cards(second.scenario.flop),
  );
  close(group.hero.equity, (a + b) / 2);
  const custom = aggregateFlops(entries(), "custom").groups[0];
  close(custom.hero.equity, (a + 3 * b) / 4);
  close(custom.hero.equity + custom.villain.equity, 1);
  close(custom.actions.find((a) => a.kind === "BET").frequency, 0.6125);
  close(custom.modelEV, (first.modelEV + 3 * second.modelEV) / 4);
  close(custom.maxGap, Math.max(first.gap, second.gap));
  assert.equal(
    custom.unconverged,
    [first, second].filter((r) => r.gap > 0.001).length,
  );
  close(
    custom.hero.categories.reduce((a, b) => a + b, 0),
    1,
  );
  assert.ok(!Object.hasOwn(custom.rows[0], "root"));
  assert.ok(!Object.hasOwn(custom.rows[0], "records"));
});

test("group identity separates game, model and sizing differences but ignores flop and solve budget", () => {
  assert.deepEqual(
    flopGroupSettings(first.scenario),
    flopGroupSettings({ ...second.scenario, iterations: 100 }),
  );
  for (const change of [
    { heroPosition: "ip" },
    { stack: 2 },
    { pot: 5 },
    { hero: "AhKh:0.5,9h8h" },
    { tendency: 0.5 },
    { overrides: { QcQd: 0.3 } },
    { deviation: 0.5 },
    { fullTendencies: { bluff: -0.5 } },
    {
      fullSizing: { mode: "fast", maxBets: 1, maxRaises: 1, lossTarget: 0.01 },
    },
    { betting: { ...base.betting, turn: { bet: [50], raise: [100] } } },
  ])
    assert.notDeepEqual(
      flopGroupSettings(base),
      flopGroupSettings({ ...base, ...change }),
    );
  const a = { ...base, hero: "AhKh:0.5,9h8h:0.5" },
    b = { ...base, hero: "8h9h,KhAh" };
  assert.deepEqual(flopGroupSettings(a), flopGroupSettings(b));
  const editedA = editFullModel(first.scenario, "root/a:CHECK", "QcQd", {
    CHECK: 1,
    "BET:1": 0,
  });
  const editedB = editFullModel(second.scenario, "root/a:CHECK", "QcQd", {
    CHECK: 1,
    "BET:1": 0,
  });
  assert.notDeepEqual(flopGroupSettings(editedA), flopGroupSettings(editedB));
  const different = entries();
  different[1].summary = summary(second, "model");
  assert.equal(aggregateFlops(different).groups.length, 2);
  const changed = structuredClone(second);
  changed.scenario.tendency = 0.25;
  const separate = aggregateFlops([
    entries()[0],
    { name: "Different opponent", summary: summary(changed) },
  ]);
  assert.equal(separate.groups.length, 2);
  assert.ok(separate.groups.every((g) => g.rows[0].share === 1));
});

test("duplicate flops, stale or incomplete solutions and invalid weights are rejected", () => {
  const duplicate = entries();
  duplicate[1].summary = summary(first);
  duplicate[1].summary.board = [...duplicate[1].summary.board].reverse();
  assert.throws(() => aggregateFlops(duplicate), /Duplicate flop/);
  assert.throws(
    () => summarizeSavedFlop(null, base),
    /complete saved solution/,
  );
  assert.throws(
    () => summarizeSavedFlop(first, { ...first.scenario, tendency: 0.5 }),
    /does not match/,
  );
  assert.throws(
    () => summarizeSavedFlop({ ...first, ready: false }, first.scenario),
    /complete/,
  );
  assert.throws(
    () => summarizeSavedFlop({ ...first, gap: NaN }, first.scenario),
    /metrics/,
  );
  const missing = { ...first, root: { ...first.root, adjusted: [null] } };
  assert.throws(() => summary(missing, "model"), /opening strategy/);
  for (const weight of [0, -1, NaN, Infinity, 1000001]) {
    const items = entries();
    items[0].weight = weight;
    assert.throws(() => aggregateFlops(items, "custom"), /weight/);
  }
  assert.throws(() => aggregateFlops(entries(), "physical"), /weighting/);
});

test("saved report loading is sequential, reports progress and never skips a failed entry", async () => {
  const request = {
    entries: [first, second].map((r) => ({
      name: r.scenario.name,
      scenario: r.scenario,
      weight: 1,
    })),
    profile: "baseline",
    weightMode: "equal",
  };
  let busy = false;
  const reads = [],
    progress = [];
  const load = async (name) => {
    assert.equal(busy, false);
    busy = true;
    reads.push(name);
    await Promise.resolve();
    busy = false;
    return name === "Ace-high" ? first : second;
  };
  const report = await compareSavedFlops(request, load, (p) =>
    progress.push(p.completed),
  );
  assert.deepEqual(reads, ["Ace-high", "Jack-high"]);
  assert.deepEqual(progress, [0, 1, 2]);
  assert.equal(report.groups.length, 1);
  await assert.rejects(
    compareSavedFlops(request, async (name) =>
      name === "Ace-high" ? first : null,
    ),
    /Jack-high: No complete/,
  );
  await assert.rejects(
    compareSavedFlops(
      { ...request, entries: [...request.entries, request.entries[0]] },
      () => {
        throw Error("must not load");
      },
    ),
    /selected twice/,
  );
  await assert.rejects(
    compareSavedFlops({ ...request, weightMode: "invalid" }, () => {
      throw Error("must not load");
    }),
    /weighting/,
  );
});
