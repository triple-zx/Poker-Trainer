import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards } from "../app/engine.js";
import {
  analyzeNode,
  nodeReach,
  weightedMatrix,
} from "../app/full-node-analysis.js";

const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh:0.5,9h8h",
  villain: "QcQd,9h9d:0.25",
};
const flop = cards(scenario.flop),
  turn = [...flop, ...cards("9d")],
  river = [...turn, ...cards("Kh")];
const terminal = (board) => ({
  type: "terminal",
  board,
  spent: [1, 1],
  winner: -1,
});
const action = (
  player,
  board,
  policy,
  children,
  actions = [{ kind: "CHECK" }],
) => ({
  type: "action",
  player,
  board,
  spent: [1, 1],
  policy,
  adjusted: policy,
  model: policy,
  children,
  actions,
});
const riverNode = action(0, river, [null, [1]], [terminal(river)]);
const riverChance = {
  type: "chance",
  board: turn,
  spent: [1, 1],
  children: { [cards("Kh")[0]]: riverNode },
};
const turnOpponent = action(1, turn, [[1], null], [riverChance]);
const turnHero = action(0, turn, [[1], [1]], [turnOpponent]);
const chance = {
  type: "chance",
  board: flop,
  spent: [1, 1],
  children: { [cards("9d")[0]]: turnHero },
};
const opponent = action(
  1,
  flop,
  [
    [0.5, 0.5],
    [0.25, 0.75],
  ],
  [chance, terminal(flop)],
  [{ kind: "CALL" }, { kind: "FOLD" }],
);
opponent.model = [
  [0.2, 0.8],
  [0.8, 0.2],
];
const root = action(
  0,
  flop,
  [
    [0.75, 0.25],
    [0.25, 0.75],
  ],
  [terminal(flop), opponent],
  [{ kind: "CHECK" }, { kind: "BET", amount: 1 }],
);
root.adjusted = [
  [0.2, 0.8],
  [0.8, 0.2],
];
const result = { scenario, root };
const called = "root/a:BET:1/a:CALL";
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("node ranges condition on both strategies and joint card removal", () => {
  const model = analyzeNode(result, called, "model");
  close(model.reach, 1.6 / 13);
  [0.4, 0.4, 0.2].forEach((p, i) => close(model.game.pairs[i].weight, p));
  close(model.hero.hands[0].mass, 0.8);
  close(model.villain.hands[1].mass, 0.4);
  close(model.hero.hands[1].blockedWeight, 0.5);
  assert.deepEqual(model.hero.hands[1].blockedCombos, ["9h9d"]);
  close(model.hero.equity + model.villain.equity, 1);
  const baseline = nodeReach(result, called, "baseline");
  close(baseline.reach, 57 / 208);
  [8 / 57, 1 / 57, 48 / 57].forEach((p, i) =>
    close(baseline.game.pairs[i].weight, p),
  );
  const opening = analyzeNode(result, "root/a:BET:1", "model");
  close(opening.frequencies[0], 2 / 7);
  close(
    opening.frequencies.reduce((a, b) => a + b, 0),
    1,
  );
});

test("turn and river blockers remove impossible hands and equity uses the current board", () => {
  const turnReport = analyzeNode(result, called + "/c:9d");
  close(turnReport.reach, (1.6 / 13) * (0.6 / 45));
  close(turnReport.hero.hands[0].mass, 2 / 3);
  assert.equal(turnReport.villain.hands[1].boardBlocked, true);
  assert.equal(turnReport.villain.hands[1].category, null);
  assert.equal(turnReport.villain.hands[1].equity, null);
  assert.equal(turnReport.hero.hands[1].blockedWeight, 0);
  const end = analyzeNode(result, called + "/c:9d/a:CHECK/a:CHECK/c:Kh");
  close(end.reach, turnReport.reach / 3 / 44);
  assert.equal(end.hero.hands[0].mass, 0);
  assert.equal(end.hero.hands[0].boardBlocked, true);
  assert.equal(end.hero.equity, 0);
  assert.equal(end.villain.equity, 1);
  assert.equal(end.hero.flushDraw, 0);
  assert.equal(end.hero.straightDraw, 0);
});

test("zero-probability histories stay undefined instead of falling back to starting ranges", () => {
  const copy = structuredClone(result);
  copy.root.adjusted = [
    [1, 0],
    [1, 0],
  ];
  const empty = analyzeNode(copy, called);
  assert.equal(empty.reachable, false);
  assert.equal(empty.hero, null);
  assert.equal(empty.frequencies, null);
  assert.equal(empty.game.pairs.length, 0);
  assert.equal(nodeReach(copy, called, "baseline").reachable, true);
  assert.throws(() => nodeReach(result, "root/a:RAISE:88"), /Unknown/);
  assert.throws(() => nodeReach(result, called + "/c:Ac"), /Unknown/);
});

test("very rare nonzero histories retain normalized conditional ranges", () => {
  let node = terminal(flop);
  for (let i = 0; i < 20; i++)
    node = action(
      0,
      flop,
      [
        [1e-30, 1 - 1e-30],
        [1e-30, 1 - 1e-30],
      ],
      [node, terminal(flop)],
      [{ kind: "CHECK" }, { kind: "BET", amount: 1 }],
    );
  const context = nodeReach(
    { scenario, root: node },
    "root" + "/a:CHECK".repeat(20),
  );
  assert.equal(context.reachable, true);
  assert.equal(context.reach, 0); // Absolute probability underflows; posterior does not.
  close(context.game.pairs[0].weight, 4 / 13);
  assert.ok(Math.abs(context.logReach - 20 * Math.log(1e-30)) < 1e-10);
});

test("weighted matrices distinguish pairs, suited and offsuit classes", () => {
  const matrix = weightedMatrix([
    { label: "AhKh", cards: cards("AhKh"), mass: 0.25 },
    { label: "AsKs", cards: cards("AsKs"), mass: 0.1 },
    { label: "AdKc", cards: cards("AdKc"), mass: 0.15 },
    { label: "QhQd", cards: cards("QhQd"), mass: 0.5 },
  ]);
  assert.equal(matrix.length, 169);
  close(matrix.find((c) => c.label === "AKs").mass, 0.35);
  close(matrix.find((c) => c.label === "AKo").mass, 0.15);
  close(
    matrix.reduce((sum, c) => sum + c.mass, 0),
    1,
  );
  assert.equal(matrix.find((c) => c.label === "AKs").combos.length, 2);
});
