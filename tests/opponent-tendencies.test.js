import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards } from "../app/engine.js";
import {
  opponentPolicy,
  validateTendencies,
  setGroupProbability,
} from "../app/opponent-tendencies.js";
const s = { ...DEFAULT, game: "full" };
const hand = (label) => ({ label, cards: cards(label) });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const equal = (row, wanted) => row.forEach((p, i) => close(p, wanted[i]));
const open = {
  board: cards("As7d2c"),
  actions: [
    { kind: "CHECK" },
    { kind: "BET", amount: 1 },
    { kind: "BET", amount: 2 },
  ],
};
const facing = {
  ...open,
  actions: [
    { kind: "CALL" },
    { kind: "FOLD" },
    { kind: "RAISE", amount: 2 },
    { kind: "RAISE", amount: 3 },
  ],
};

test("bluff proxy shifts high-card aggression on every street and preserves size ratios", () => {
  const row = [0.2, 0.3, 0.5];
  for (const board of ["As7d2c", "As7d2c3d", "As7d2c3d4s"]) {
    const node = { ...open, board: cards(board) };
    equal(
      opponentPolicy(
        { ...s, fullTendencies: { bluff: -0.5 } },
        node,
        hand("9h8h"),
        row,
      ),
      [0.6, 0.15, 0.25],
    );
    equal(
      opponentPolicy(
        { ...s, fullTendencies: { bluff: 0.5 } },
        node,
        hand("9h8h"),
        row,
      ),
      [0.1, 0.3375, 0.5625],
    );
    equal(
      opponentPolicy(
        { ...s, fullTendencies: { bluff: -1 } },
        node,
        hand("9h8h"),
        row,
      ),
      [1, 0, 0],
    );
    equal(
      opponentPolicy(
        { ...s, fullTendencies: { bluff: 1 } },
        node,
        hand("9h8h"),
        [1, 0, 0],
      ),
      [0, 0.5, 0.5],
    );
    assert.deepEqual(
      opponentPolicy(
        { ...s, fullTendencies: { bluff: -1 } },
        node,
        hand("QcQd"),
        row,
      ),
      row,
    );
  }
  // Board pairing is explicitly included in the made-hand proxy.
  assert.deepEqual(
    opponentPolicy(
      { ...s, fullTendencies: { bluff: -1 } },
      { ...open, board: cards("As7d7c") },
      hand("9h8h"),
      row,
    ),
    row,
  );
});

test("made-hand raising, class overrides and call overrides have defined precedence", () => {
  const row = [0.3, 0.2, 0.2, 0.3];
  const cfg = { ...s, fullTendencies: { raise: -0.5 } };
  equal(opponentPolicy(cfg, facing, hand("QcQd"), row), [0.45, 0.3, 0.1, 0.15]);
  assert.deepEqual(opponentPolicy(cfg, facing, hand("9h8h"), row), row);
  const byClass = {
    ...s,
    fullTendencies: {
      bluff: -1,
      raise: -1,
      classes: { 0: { raise: 0 }, 1: { raise: 0.5, call: -1 } },
    },
  };
  equal(opponentPolicy(byClass, facing, hand("9h8h"), row), row);
  const pair = opponentPolicy(byClass, facing, hand("QcQd"), row);
  close(pair[0], 0);
  close(pair[2] / pair[3], 2 / 3);
  close(
    pair.reduce((a, b) => a + b, 0),
    1,
  );
  const combo = opponentPolicy(
    { ...byClass, overrides: { QcQd: 0.7 } },
    facing,
    hand("QcQd"),
    row,
  );
  close(combo[0], 0.7);
  close(
    combo.reduce((a, b) => a + b, 0),
    1,
  );
  assert.deepEqual(
    opponentPolicy(
      { ...s, fullTendencies: { bluff: -1, classes: { 0: { bet: 0 } } } },
      open,
      hand("9h8h"),
      [0.2, 0.3, 0.5],
    ),
    [0.2, 0.3, 0.5],
  );
  equal(
    opponentPolicy(
      { ...s, tendency: 1, fullTendencies: { bluff: 1 } },
      facing,
      hand("9h8h"),
      row,
    ),
    [1, 0, 0, 0],
  );
});

test("group adjustment preserves tiny complement weights and rejects malformed settings", () => {
  assert.deepEqual(setGroupProbability([1e-20, 0, 1], [2], 0), [1, 0, 0]);
  for (const fullTendencies of [
    null,
    [],
    { bluff: NaN },
    { raise: 1.1 },
    { foo: 0 },
    { classes: [] },
    { classes: { 9: { bet: 0 } } },
    { classes: { 1: { shove: 0 } } },
    { classes: { 1: { call: -2 } } },
  ])
    assert.throws(() => validateTendencies({ ...s, fullTendencies }));
  assert.throws(() =>
    validateTendencies({ ...s, game: "bounded", fullTendencies: { bluff: 1 } }),
  );
  assert.doesNotThrow(() =>
    validateTendencies({
      ...s,
      fullTendencies: {
        bluff: 0,
        raise: 0,
        classes: { 1: { call: 0, bet: 0, raise: 0 } },
      },
    }),
  );
});
