import test from "node:test";
import assert from "node:assert/strict";
import { fullActionLabel } from "../app/full-game.js";
import { trainingAction, trainingEvent } from "../app/training-text.js";

test("saved training labels agree with live action labels without changing canonical records", () => {
  const zh = (_en, chinese) => chinese;
  const scenario = { stack: 15 };
  for (const player of [0, 1]) {
    const state = { player, spent: [2, 5], street: [0, 3] };
    if (player) {
      state.spent.reverse();
      state.street.reverse();
    }
    for (const action of [
      { kind: "CHECK" },
      { kind: "FOLD" },
      { kind: "CALL" },
      { kind: "BET", amount: 1.375 },
      { kind: "RAISE", amount: 6 },
      { kind: "BET", amount: 13 },
      { kind: "RAISE", amount: 13 },
    ]) {
      const canonical = fullActionLabel(action, state, scenario);
      const expected = fullActionLabel(action, state, scenario, zh);
      assert.equal(trainingAction(canonical), canonical);
      assert.equal(trainingAction(canonical, zh), expected);
      assert.equal(trainingEvent("You · " + canonical, zh), "你 · " + expected);
      assert.equal(
        trainingEvent("Opponent · " + canonical, zh),
        "对手 · " + expected,
      );
    }
  }
  for (const text of [
    "Flop · action begins",
    "Turn",
    "River · all-in runout",
    "Split pot",
    "You win",
    "Opponent wins",
  ])
    assert.equal(trainingEvent(text), text);
  assert.equal(trainingEvent("River · all-in runout", zh), "河牌 · 全下发牌");
  for (const text of [
    "My Turn study",
    "__proto__",
    "constructor",
    "Opponent · custom note",
    "Bet 5 bb annotation",
  ])
    assert.equal(trainingEvent(text, zh), text);
});
