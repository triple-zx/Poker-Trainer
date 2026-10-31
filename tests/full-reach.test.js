import test from "node:test";
import assert from "node:assert/strict";
import { cards, rank7 } from "../app/engine.js";
import { parsePreflopRange, RANGE_TEMPLATES } from "../app/preflop-ranges.js";
import { fullCardContext } from "../app/full-cards.js";
import { fullReachContext } from "../app/full-reach.js";

function game(count) {
  const board = cards("7c6d2h"),
    all = parsePreflopRange(RANGE_TEMPLATES[0].range).filter(
      (h) => !h.cards.some((c) => board.includes(c)),
    );
  const hero = Array.from({ length: count }, (_, i) => ({
    ...all[Math.floor((i * all.length) / count)],
    weight: ((i % 7) + 1) / 7,
  }));
  const villain = hero.map((h, i) => ({ ...h, weight: ((i % 5) + 1) / 5 }));
  const pairs = [];
  hero.forEach((h, i) =>
    villain.forEach((v, j) => {
      if (new Set([...h.cards, ...v.cards]).size === 4)
        pairs.push({ i, j, weight: h.weight * v.weight });
    }),
  );
  const total = pairs.reduce((s, p) => s + p.weight, 0);
  pairs.forEach((p) => (p.weight /= total));
  return { board, hero, villain, pairs };
}
const near = (a, b) =>
  assert.ok(
    Math.abs(a - b) <= 2e-12 * Math.max(1, Math.abs(b)),
    `${a} differs from ${b}`,
  );

test("factored counterfactual reach matches joint enumeration after actions and both cards", () => {
  for (const count of [3, 12, 48]) {
    const g = game(count),
      context = fullReachContext(g, fullCardContext(g));
    const ranges = [g.hero, g.villain];
    for (const player of [0, 1]) {
      let reach = context.initial(player),
        joint = g.pairs.map((p) => p.weight);
      function compare(board) {
        const expected = Array(count).fill(0);
        g.pairs.forEach((p, k) => (expected[player ? p.j : p.i] += joint[k]));
        context.masses(player, reach).forEach((v, i) => near(v, expected[i]));
        for (const winner of [0, 1, ...(board.length === 5 ? [-1] : [])]) {
          const node = { board, spent: [3, 3], winner },
            values = Array(count).fill(0);
          g.pairs.forEach((p, k) => {
            if (!joint[k]) return;
            const h = rank7([...g.hero[p.i].cards, ...board]),
              v = rank7([...g.villain[p.j].cards, ...board]);
            const equity =
              winner >= 0
                ? +(winner === player)
                : h === v
                  ? 0.5
                  : player
                    ? +(v > h)
                    : +(h > v);
            values[player ? p.j : p.i] += joint[k] * (equity * 10 - 3);
          });
          context
            .terminal(player, reach, node, 10)
            .forEach((v, i) => near(v, values[i]));
        }
      }
      compare(g.board);
      const board = [...g.board];
      for (const card of cards("AsKd")) {
        const policy = ranges[1 - player].map((_, i) => {
          const p = i % 3 ? (i + 1) / (count + 1) : 0;
          return [p, 1 - p];
        });
        reach = context.action(reach, policy, 0);
        joint = joint.map(
          (w, k) => w * policy[player ? g.pairs[k].i : g.pairs[k].j][0],
        );
        compare(board);
        reach = context.chance(player, reach, card, board.length);
        joint = joint.map((w, k) => {
          const p = g.pairs[k];
          return [...g.hero[p.i].cards, ...g.villain[p.j].cards].includes(card)
            ? 0
            : w / (52 - board.length - 4);
        });
        board.push(card);
        compare(board);
      }
    }
  }
});

test("rank sweep handles board ties, identical hands and arbitrarily small compatible reach", () => {
  const g = game(48),
    context = fullReachContext(g, fullCardContext(g));
  for (const [player, tiny] of [0, 1].flatMap((p) =>
    [1e-7, 1e-12, 1e-30].map((w) => [p, w]),
  )) {
    let reach = context.initial(player);
    for (const card of cards("AsKd"))
      reach = context.chance(
        player,
        reach,
        card,
        card === cards("As")[0] ? 3 : 4,
      );
    // Almost all weight is on one blocked hand; the remaining mass must not
    // become zero because total - blockers loses tiny terms to rounding.
    reach.other = reach.other.map((w, i) => (i === 10 ? w : w * tiny));
    const masses = context.masses(player, reach);
    const expected = Array(48).fill(0);
    g.pairs.forEach((p) => {
      const i = player ? p.j : p.i,
        j = player ? p.i : p.j;
      expected[i] += reach.own[i] * reach.other[j] * reach.scale;
    });
    masses.forEach((v, i) => {
      if (expected[i]) assert.ok(Math.abs(v / expected[i] - 1) < 1e-10);
      else assert.equal(v, 0);
    });
  }
  const board = cards("AsKsQsJsTs"),
    ranges = [g.hero, g.villain];
  // A separate flop is intentional: the rank cache belongs to one fixed flop.
  const tied = fullReachContext(
    { ...g, board: board.slice(0, 3) },
    fullCardContext(g),
  );
  for (const player of [0, 1]) {
    const reach = tied.initial(player);
    reach.own = reach.own.map((w, i) =>
      ranges[player][i].cards.some((c) => board.includes(c)) ? 0 : w,
    );
    reach.other = reach.other.map((w, i) =>
      ranges[1 - player][i].cards.some((c) => board.includes(c)) ? 0 : w,
    );
    const masses = tied.masses(player, reach);
    const values = tied.terminal(
      player,
      reach,
      { board, spent: [2, 2], winner: -1 },
      10,
    );
    values.forEach((v, i) => near(v, 3 * masses[i]));
  }
});
