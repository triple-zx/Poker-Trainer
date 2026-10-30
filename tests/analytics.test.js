import test from "node:test";
import assert from "node:assert/strict";
import { cards, validate, DEFAULT } from "../app/engine.js";
import {
  handFeatures,
  summarizeRange,
  practiceGroups,
  calibration,
} from "../app/analytics.js";
test("made hands and draw patterns distinguish current straights, wheel draws and backdoors", () => {
  const f = (h, b) => handFeatures(cards(h), cards(b));
  assert.equal(f("AhKh", "As 7d 2c").category, 1);
  assert.equal(f("AhKh", "Qh 2h 7c").flushDraw, true);
  assert.equal(f("AhKh", "Qh 2c 7c").backdoorFlush, true);
  assert.equal(f("9h8h", "Th 7c 2d").straightOuts, 8);
  assert.equal(f("Ah2h", "3c 4d 9s").straightOuts, 4);
  assert.equal(f("Ah2h", "3c 4d 5s").straightOuts, 0);
  assert.equal(f("Ah2h", "3c 4d 5s").category, 4);
  assert.equal(f("AhAd", "Ac Kd Kh").category, 6);
});
test("range summaries use collision-adjusted joint mass and complementary equity", () => {
  const g = validate({
      ...DEFAULT,
      hero: "AhKh,QhQd",
      villain: "AhQc:1,KsKd:0.5",
    }),
    eq = [0.8, 0.4, 0.6],
    hero = summarizeRange(g, eq),
    opponent = summarizeRange(g, eq, "villain");
  assert.equal(hero.hands[0].mass, 0.25);
  assert.equal(hero.hands[0].equity, 0.8);
  assert.equal(hero.hands[0].blockedWeight, 2 / 3);
  assert.deepEqual(hero.hands[0].blockedCombos, ["AhQc"]);
  assert.ok(Math.abs(hero.equity - 0.55) < 1e-12);
  assert.ok(Math.abs(hero.equity + opponent.equity - 1) < 1e-12);
  assert.equal(
    hero.categories.reduce((a, b) => a + b, 0),
    1,
  );
});
test("hands with no compatible deals have no equity and zero deal share", () => {
  const g = validate({ ...DEFAULT, hero: "AhKh,QhQd", villain: "AhQc" }),
    r = summarizeRange(g, [0.5]);
  assert.equal(r.hands[0].mass, 0);
  assert.equal(r.hands[0].equity, null);
  assert.equal(r.hands[0].blockedWeight, 1);
});
test("target groups select qualifying combinations without changing weights", () => {
  const g = validate({
    ...DEFAULT,
    flop: "Th 7c 2d",
    hero: "9h8h,AcAd",
    villain: "KhKd",
  });
  assert.deepEqual(
    practiceGroups(g).find((x) => x.key === "draw:straight").indices,
    [0],
  );
  assert.deepEqual(
    practiceGroups(g).find((x) => x.key === "category:1").indices,
    [1],
  );
});
test("frequency calibration separates configuration, hand and sampling, without penalizing single mixed actions", () => {
  const record = {
    config: DEFAULT,
    scenario: DEFAULT.name,
    hero: "AhKh",
    target: 0.5,
    action: 0,
    loss: 0,
  };
  const rows = calibration([
    record,
    { ...record, action: 1 },
    { ...record, targeted: true },
    { ...record, hero: "QhQd" },
    { ...record, config: { ...DEFAULT, tendency: 0.2 } },
    { ...record, target: NaN },
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].count, 2);
  assert.deepEqual(rows[0].observed, [0.5, 0.5]);
  assert.deepEqual(rows[0].expected, [0.5, 0.5]);
  assert.equal(rows[0].meanLoss, 0);
  const sized = calibration([
    { ...record, target: [0.2, 0.3, 0.5], actions: [0, 3.3, 15], action: 2 },
  ]);
  assert.deepEqual(sized[0].observed, [0, 0, 1]);
  assert.deepEqual(sized[0].expected, [0.2, 0.3, 0.5]);
});
