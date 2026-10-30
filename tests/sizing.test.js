import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, validate, importPackage } from "../app/engine.js";
import { betAmounts, solveSized, selectSizes } from "../app/sizing.js";
const s = {
  ...DEFAULT,
  hero: "AhKh",
  villain: "QcQd",
  sizing: { mode: "fast", candidates: [33, 75], maxSizes: 2, lossTarget: 0.01 },
};
test("candidate amounts are explicit, capped and deep search expands the finite grid", () => {
  assert.deepEqual(betAmounts(s), [3.3, 7.5, 15]);
  assert.deepEqual(
    betAmounts({ ...s, sizing: { ...s.sizing, mode: "deep" } }),
    [3.3, 5.4, 7.5, 11.25, 15],
  );
  assert.throws(() =>
    betAmounts({ ...s, sizing: { ...s.sizing, candidates: [0] } }),
  );
});
test("node edits validate before solving or importing and affect only their specified node", () => {
  const configured = {
    ...s,
    sizing: { ...s.sizing, nodeOverrides: { "QcQd@3.3": 0 } },
  };
  const profile = {
    sized: true,
    baseline: [[0.25, 0.25, 0.25, 0.25]],
    calls: [[1, 1, 1]],
  };
  const r = solveSized(configured, [0.25], profile);
  assert.deepEqual(r.model, [[0, 1, 1]]);
  assert.equal(r.ev[0][1], 10);
  assert.equal(r.ev[0][2], -1.25);
  for (const nodeOverrides of [[], 5, { "QcQd@4": 0 }, { "QcQd@3.3": 2 }]) {
    const invalid = { ...s, sizing: { ...s.sizing, nodeOverrides } };
    assert.throws(() => validate(invalid));
    assert.throws(() => importPackage({ schema: 1, scenario: invalid }));
  }
});
test("subset selection finds the least-loss action set and reports unmet targets", () => {
  const ev = [
      [0, 10, 3, 2],
      [0, 0, 10, 2],
    ],
    m = [0.5, 0.5];
  const one = selectSizes(ev, m, 1, 0);
  assert.equal(one.loss, 3.5);
  assert.equal(one.targetReached, false);
  const two = selectSizes(ev, m, 2, 0);
  assert.deepEqual(two.actions, [0, 1, 2]);
  assert.equal(two.loss, 0);
  const tolerant = selectSizes(ev, m, 2, 4);
  assert.equal(tolerant.actions.length, 2);
});
test("sized game computes exact fixed-opponent EVs and preserves equivalent action mixing", () => {
  const r = solveSized({ ...s, tendency: 1 }, [1]);
  assert.deepEqual(r.ev[0], [10, 13.3, 17.5, 25]);
  assert.equal(r.activeActions.includes(3), true);
  assert.equal(r.adjusted[0][3], 1);
  assert.ok(r.gap < 0.01);
  const tie = solveSized({ ...s, tendency: -1 }, [1]);
  assert.deepEqual(tie.ev[0], [10, 10, 10, 10]);
  assert.equal(tie.selection.loss, 0);
  assert.ok(Math.abs(tie.adjusted[0].reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
