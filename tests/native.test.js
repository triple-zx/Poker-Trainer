import test from "node:test";
import assert from "node:assert/strict";
import { commands, extract } from "../native/adapter.mjs";
import { DEFAULT, solve } from "../app/engine.js";
test("native commands preserve exact weighted ranges and disable suit abstraction", () => {
  const script = commands(DEFAULT);
  assert.match(script, /set_range_oop AhKh:1,QhQd:1,9h8h:0.5/);
  assert.match(script, /set_use_isomorphism 0/);
  assert.match(script, /set_dump_rounds 1/);
  assert.match(script, /set_allin_threshold 2.666/);
  assert.match(
    commands({ ...DEFAULT, stack: 15.125 }),
    /set_effective_stack 15125/,
  );
  assert.throws(() => commands({ ...DEFAULT, stack: 15.1234 }));
  assert.throws(() => commands({ ...DEFAULT, rake: 5, cap: 1 }));
  assert.throws(() => commands({ ...DEFAULT, flop: "As 7d 2c\nstart_solve" }));
});
test("native profile parser rejects malformed/missing combinations or changed action tree", () => {
  const s = { ...DEFAULT, hero: "AhKh", villain: "AcQc" };
  const d = {
    actions: ["CHECK", "BET 15000.000000"],
    strategy: { strategy: { AhKh: [0.2, 0.8] } },
    childrens: {
      "BET 15000.000000": {
        actions: ["CALL", "FOLD"],
        strategy: { strategy: { AcQc: [0.7, 0.3] } },
      },
    },
  };
  const p = extract(d, s);
  assert.deepEqual(p.baseline, [0.8]);
  assert.deepEqual(p.calls, [0.7]);
  assert.equal(solve(s, [0.5], p).engine, p.engine);
  assert.throws(() => extract(d, { ...s, stack: 20 }));
  d.strategy.strategy.AhKh = [NaN, 1];
  assert.throws(() => extract(d, s));
  assert.throws(() => solve(s, [0.5], { baseline: [2], calls: [0] }));
});
test("sized native commands preserve fractional bets and exact-action extraction", () => {
  const s = {
    ...DEFAULT,
    hero: "AhKh",
    villain: "AcQc",
    sizing: { mode: "fast", candidates: [33], maxSizes: 2, lossTarget: 0 },
  };
  assert.match(commands(s), /set_pot 10000/);
  assert.match(commands(s), /set_effective_stack 15000/);
  assert.match(commands(s), /set_bet_sizes oop,flop,bet,33/);
  const d = {
    actions: ["CHECK", "BET 3300.000000", "BET 15000.000000"],
    strategy: { strategy: { AhKh: [0.2, 0.3, 0.5] } },
    childrens: Object.fromEntries(
      ["BET 3300.000000", "BET 15000.000000"].map((k) => [
        k,
        {
          actions: ["CALL", "FOLD"],
          strategy: { strategy: { AcQc: [0.7, 0.3] } },
        },
      ]),
    ),
  };
  const r = extract(d, s);
  assert.equal(r.sized, true);
  assert.deepEqual(r.baseline, [[0.2, 0.3, 0.5]]);
  assert.deepEqual(r.calls, [[0.7, 0.7]]);
  d.actions[1] = "BET 3000.000000";
  assert.throws(() => extract(d, s));
});
