import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards, validate, equity } from "../app/engine.js";
import { fullCardContext } from "../app/full-cards.js";
import { boardEquity } from "../app/full-game.js";
import { validateFull } from "../app/full-game.js";
import { rangeDocument, rangeForFlop } from "../app/preflop-ranges.js";
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
  assert.deepEqual(
    before.pairIndices,
    g.pairs.map((_, k) => k),
  );
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
      assert.deepEqual(covered.pairIndices, expected);
      assert.strictEqual(covered, context.coverage([...g.board, b, a]));
      for (let player = 0; player < 2; player++)
        assert.deepEqual(
          [...covered.actors[player]],
          [
            ...new Set(
              expected.map((k) => (player ? g.pairs[k].j : g.pairs[k].i)),
            ),
          ],
        );
    }
  }
});
