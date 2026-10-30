import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards, validate } from "../app/engine.js";
import { boardEquity } from "../app/full-game.js";
import { compareNextCards } from "../app/full-card-analysis.js";

const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh:0.25,9h8h:0.75",
  villain: "QcQd",
};
const game = validate(scenario),
  flop = game.board;
const terminal = (board) => ({
  type: "terminal",
  board,
  spent: [0, 0],
  winner: -1,
});
const action = (board, children, player = 0) => {
  const own = player === 0 ? game.hero : game.villain;
  const policy = own.map((h, i) =>
    h.cards.some((c) => board.includes(c))
      ? null
      : i
        ? [0.75, 0.25]
        : [0.25, 0.75],
  );
  const adjusted = own.map((h, i) =>
    h.cards.some((c) => board.includes(c)) ? null : i ? [0.1, 0.9] : [0.6, 0.4],
  );
  return {
    type: "action",
    board,
    spent: [0, 0],
    player,
    actions: [{ kind: "CHECK" }, { kind: "BET", amount: 2 }],
    policy,
    adjusted,
    model: adjusted,
    children,
  };
};
function chance(board, player = 0) {
  const children = {};
  for (let c = 0; c < 52; c++) {
    if (
      board.includes(c) ||
      !game.pairs.some((p) => {
        const used = [
          ...board,
          ...game.hero[p.i].cards,
          ...game.villain[p.j].cards,
        ];
        return new Set(used).size === used.length && !used.includes(c);
      })
    )
      continue;
    const nextBoard = [...board, c];
    children[c] = action(
      nextBoard,
      [terminal(nextBoard), terminal(nextBoard)],
      player,
    );
  }
  return { type: "chance", board, spent: [0, 0], children };
}
function fixture() {
  const deal = chance(flop);
  const root = action(flop, [deal, terminal(flop)]);
  root.policy = [
    [0.4, 0.6],
    [0.6, 0.4],
  ];
  root.adjusted = [
    [0.8, 0.2],
    [0.2, 0.8],
  ];
  return { scenario, root };
}
const path = "root/a:CHECK";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const byCard = (report, name) => report.rows.find((r) => r.name === name);

test("turn comparisons use action-conditioned card probabilities and weighted strategy", () => {
  const result = fixture(),
    report = compareNextCards(result, path);
  assert.equal(report.rows.length, 47);
  assert.equal(report.positiveCards, 47);
  close(report.reach, 0.35);
  close(report.probabilityMass, 1);
  // After checking, AhKh has 4/7 of joint reach and 9h8h has 3/7.
  close(byCard(report, "Kh").probability, 3 / 7 / 45);
  close(byCard(report, "9h").probability, 4 / 7 / 45);
  close(byCard(report, "3s").probability, 1 / 45);
  assert.equal(byCard(report, "Qc"), undefined);
  close(byCard(report, "Kh").frequencies[1], 0.9);
  close(byCard(report, "9h").frequencies[1], 0.4);
  close(
    report.weighted.actions.find((a) => a.kind === "BET").frequency,
    (4 * 0.4 + 3 * 0.9) / 7,
  );
  const equity = game.pairs.map((p) =>
    boardEquity(game.hero[p.i].cards, game.villain[p.j].cards, flop),
  );
  close(report.weighted.hero.equity, (4 * equity[0] + 3 * equity[1]) / 7);
  close(report.weighted.hero.equity + report.weighted.villain.equity, 1);
  for (const side of ["hero", "villain"])
    close(
      report.weighted[side].categories.reduce((a, b) => a + b, 0),
      1,
    );
  const baseline = compareNextCards(result, path, "baseline");
  close(baseline.reach, 0.55);
  close(byCard(baseline, "Kh").probability, 9 / 11 / 45);
  close(
    baseline.weighted.actions.find((a) => a.kind === "BET").frequency,
    (2 * 0.75 + 9 * 0.25) / 11,
  );
});

test("river comparison conditions on the turn and earlier actions and has no unfinished draws", () => {
  const result = fixture(),
    turnCard = cards("3s")[0];
  const turn = result.root.children[0].children[turnCard];
  turn.children[0] = chance(turn.board, 1);
  const report = compareNextCards(result, path + "/c:3s/a:CHECK");
  assert.equal(report.player, 1);
  assert.equal(report.rows.length, 46);
  // Turn checking reweights 4/7 vs 3/7 by .6 and .1 => 8/9 vs 1/9.
  close(byCard(report, "Kh").probability, 1 / 9 / 44);
  close(byCard(report, "9h").probability, 8 / 9 / 44);
  close(report.probabilityMass, 1);
  for (const row of report.rows) {
    assert.equal(row.hero.flushDraw, 0);
    assert.equal(row.hero.straightDraw, 0);
    close(row.hero.equity + row.villain.equity, 1);
  }
  close(report.weighted.actions.find((a) => a.kind === "BET").frequency, 0.4);
});

test("zero-weight cards and impossible histories are not assigned invented averages", () => {
  const result = fixture();
  result.root.adjusted = [
    [1, 0],
    [0, 1],
  ];
  const report = compareNextCards(result, path);
  assert.equal(report.rows.length, 47);
  assert.equal(report.positiveCards, 45);
  const blocked = byCard(report, "Kh");
  assert.equal(blocked.probability, 0);
  assert.equal(blocked.hero, null);
  assert.equal(blocked.frequencies, null);
  close(report.probabilityMass, 1);
  result.root.adjusted[0] = [0, 1];
  const empty = compareNextCards(result, path);
  assert.equal(empty.reachable, false);
  assert.equal(empty.weighted, null);
  assert.equal(empty.probabilityMass, null);
  assert.ok(empty.rows.every((r) => r.probability === null && r.hero === null));
  assert.equal(compareNextCards(result, path, "baseline").reachable, true);
});

test("comparison rejects missing card or strategy coverage and retains rare conditional histories", () => {
  const missing = fixture();
  delete missing.root.children[0].children[cards("3s")[0]];
  assert.throws(() => compareNextCards(missing, path), /coverage/);
  const badBoard = fixture();
  badBoard.root.children[0].children[cards("3s")[0]].board = [
    ...flop,
    ...cards("4s"),
  ];
  assert.throws(() => compareNextCards(badBoard, path), /coverage/);
  const missingPolicy = fixture();
  missingPolicy.root.children[0].children[cards("3s")[0]].adjusted = [
    null,
    null,
  ];
  assert.throws(
    () => compareNextCards(missingPolicy, path),
    /strategy coverage/,
  );
  assert.throws(
    () => compareNextCards(fixture(), "root"),
    /turn or river deal/,
  );
  let root = chance(flop);
  for (let i = 0; i < 20; i++) {
    const next = action(flop, [root, terminal(flop)]);
    next.adjusted = [
      [1e-30, 1],
      [1e-30, 1],
    ];
    root = next;
  }
  const report = compareNextCards(
    { scenario, root },
    "root" + "/a:CHECK".repeat(20),
  );
  assert.equal(report.reach, 0);
  assert.equal(report.reachable, true);
  close(report.probabilityMass, 1);
  close(byCard(report, "Kh").probability, 0.75 / 45);
});
