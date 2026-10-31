import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards, validate, equity } from "../app/engine.js";
import { fullCardContext, rangeBoardCoverage } from "../app/full-cards.js";
import { boardEquity } from "../app/full-game.js";
import { validateFull } from "../app/full-game.js";
import {
  rangeDocument,
  rangeForFlop,
  parsePreflopRange,
  RANGE_TEMPLATES,
} from "../app/preflop-ranges.js";
import { fullBoardCoverage } from "../app/full-resources.js";
import { commands } from "../native/adapter.mjs";

test("compact card tables match independent exact equity on every turn and river", () => {
  const g = validate({
    ...DEFAULT,
    hero: "AhKh:.7,QhQd:.3",
    villain: "QcQs:.4,JhTh:.6",
  });
  const context = fullCardContext(g);
  const before = context.coverage(g.board);
  assert.equal(
    context.numericBytes,
    0,
    "Coverage does not allocate equity tables",
  );
  assert.deepEqual(before.pairCount, g.pairs.length);
  for (let k = 0; k < g.pairs.length; k++) {
    const pair = g.pairs[k],
      h = g.hero[pair.i].cards,
      v = g.villain[pair.j].cards;
    assert.ok(
      Math.abs(context.equity(k, g.board) - equity(h, v, g.board)) < 1e-12,
    );
    const cache = new Map();
    for (let turn = 0; turn < 52; turn++) {
      if ([...h, ...v, ...g.board].includes(turn)) continue;
      const board = [...g.board, turn];
      assert.equal(context.equity(k, board), boardEquity(h, v, board, cache));
      for (let river = 0; river < 52; river++) {
        if ([...h, ...v, ...board].includes(river)) continue;
        const runout = [...board, river];
        const expected = boardEquity(h, v, runout, cache);
        assert.equal(context.equity(k, runout), expected);
        assert.equal(context.equity(k, [...g.board, river, turn]), expected);
      }
    }
  }
  assert.ok(context.numericBytes < 100000);
  const royal = validate({
    ...DEFAULT,
    flop: "QhJhTh",
    hero: "AhKh",
    villain: "AsAd",
  });
  assert.equal(fullCardContext(royal).equity(0, cards("QhJhTh2c3d")), 1);
});

test("full-hand range application accepts complete twelve-combination study families and rejects thirteen", () => {
  const source = rangeDocument({
    type: "poker-trainer-range",
    schema: 1,
    name: "Study",
    range: "AKs:.75,AQs:.5,KQs:.25",
  });
  const applied = rangeForFlop(source, "7c6d2h", 12);
  assert.equal(applied.count, 12);
  const opponent = rangeDocument({ ...source, range: "QQ:.6,JJ:.4" });
  const s = {
    ...DEFAULT,
    game: "full",
    flop: "7c6d2h",
    pot: 4,
    stack: 3,
    hero: applied.text,
    villain: rangeForFlop(opponent, "7c6d2h", 12).text,
    rangeOrigins: { hero: source, villain: opponent },
    betting: Object.fromEntries(
      ["flop", "turn", "river"].map((street) => [
        street,
        { bet: [50], raise: [100] },
      ]),
    ),
  };
  const game = validateFull(s);
  assert.equal(game.pairs.length, 120);
  assert.match(commands(s), /set_range_oop AsKs:0.75/);
  assert.throws(
    () => validateFull({ ...s, hero: s.hero + ",AsJs" }),
    /at most 12/,
  );
  assert.throws(
    () =>
      rangeForFlop(
        rangeDocument({ ...source, range: source.range + ",AsJs" }),
        s.flop,
        12,
      ),
    /No combinations/,
  );
});

test("coverage reuses board sets across histories without losing private-card removal", () => {
  const g = validate({ ...DEFAULT, hero: "AhKh,9h8h", villain: "QcQd,JhTh" });
  const context = fullCardContext(g);
  for (let a = 0; a < 52; a++) {
    if (g.board.includes(a)) continue;
    for (let b = 0; b < 52; b++) {
      if (g.board.includes(b) || a === b) continue;
      const board = [...g.board, a, b];
      const expected = g.pairs.flatMap((pair, k) =>
        [...g.hero[pair.i].cards, ...g.villain[pair.j].cards].some((c) =>
          board.includes(c),
        )
          ? []
          : [k],
      );
      const covered = context.coverage(board);
      assert.equal(covered.pairCount, expected.length);
      assert.strictEqual(covered, context.coverage([...g.board, b, a]));
      for (let player = 0; player < 2; player++)
        assert.deepEqual(
          covered.actors[player],
          new Set(expected.map((k) => (player ? g.pairs[k].j : g.pairs[k].i))),
        );
    }
  }
});

test("blocker counts match exhaustive pairs with identical, dead and board-blocked hands", () => {
  const ranges = [
    parsePreflopRange("AA,AKs,AQs,KK,QJs,76s"),
    parsePreflopRange("AA,AKs,QQ,QJs,77"),
  ];
  const flop = cards("7c6d2h");
  for (let turn = 0; turn < 52; turn++) {
    if (flop.includes(turn)) continue;
    for (let river = turn + 1; river < 52; river++) {
      if (flop.includes(river)) continue;
      const board = [...flop, turn, river],
        actors = [new Set(), new Set()];
      let pairCount = 0;
      ranges[0].forEach((h, i) =>
        ranges[1].forEach((v, j) => {
          if (new Set([...board, ...h.cards, ...v.cards]).size !== 9) return;
          pairCount++;
          actors[0].add(i);
          actors[1].add(j);
        }),
      );
      assert.deepEqual(rangeBoardCoverage(ranges, board), {
        pairCount,
        actors,
      });
    }
  }
  const dead = rangeBoardCoverage(
    [parsePreflopRange("AhKh,AcKc"), parsePreflopRange("AhKh")],
    flop,
  );
  assert.equal(dead.pairCount, 1);
  assert.deepEqual(dead.actors, [new Set([1]), new Set([0])]);
  assert.equal(
    rangeBoardCoverage(
      [parsePreflopRange("AhKh"), parsePreflopRange("KhAh")],
      flop,
    ).pairCount,
    0,
  );
});

test("complete starting ranges obey closed-form deal counts without constructing pair lists", () => {
  const all = parsePreflopRange(RANGE_TEMPLATES[0].range),
    flop = cards("7c6d2h");
  const choose2 = (n) => (n * (n - 1)) / 2;
  for (const board of [flop, [...flop, 0], [...flop, 0, 1]]) {
    const remaining = 52 - board.length;
    const covered = rangeBoardCoverage([all, all], board);
    assert.equal(
      covered.pairCount,
      choose2(remaining) * choose2(remaining - 2),
    );
    assert.deepEqual(
      covered.actors.map((s) => s.size),
      [choose2(remaining), choose2(remaining)],
    );
  }
  const expected = [choose2(49), 49 * choose2(48), 49 * 48 * choose2(47)];
  assert.deepEqual(
    fullBoardCoverage({ hero: all, villain: all, board: flop }),
    { boards: [1, 49, 49 * 48], rows: [expected, expected] },
  );
});
