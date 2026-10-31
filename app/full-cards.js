import { rank7 } from "./engine.js";

// All betting histories in one solved scenario share the same flop. A compact
// runout key avoids strings and sorting the whole board at every terminal node.
function runoutKey(board) {
  if (board.length === 3) return 2704;
  if (board.length === 4) return 2705 + board[3];
  const a = board[3],
    b = board[4];
  return a < b ? a * 52 + b : b * 52 + a;
}

// Count the Cartesian product of two exact ranges after public/private card
// removal without materializing its private-hand pairs. Inclusion-exclusion
// subtracts opponents holding either card, adding back the identical hand once.
// Input ranges contain unique positive-weight hands, as produced by validation.
export function rangeBoardCoverage(ranges, board) {
  const legal = ranges.map((range) => {
    const cards = new Uint16Array(52),
      exact = new Set(),
      indices = [];
    range.forEach((hand, index) => {
      const [a, b] = hand.cards;
      if (board.includes(a) || board.includes(b)) return;
      indices.push(index);
      cards[a]++;
      cards[b]++;
      exact.add(Math.min(a, b) * 52 + Math.max(a, b));
    });
    return { cards, exact, indices };
  });
  const actors = [new Set(), new Set()];
  let pairCount = 0;
  for (let player = 0; player < 2; player++) {
    const other = legal[1 - player];
    for (const index of legal[player].indices) {
      const [a, b] = ranges[player][index].cards;
      const count =
        other.indices.length -
        other.cards[a] -
        other.cards[b] +
        Number(other.exact.has(Math.min(a, b) * 52 + Math.max(a, b)));
      if (count > 0) actors[player].add(index);
      if (player === 0) pairCount += count;
    }
  }
  return { pairCount, actors };
}

export function fullCardContext(g) {
  const ranges = [g.hero, g.villain],
    hands = [],
    handIds = new Map();
  const ids = ranges.map((range) =>
    range.map(({ cards }) => {
      const key = Math.min(...cards) * 52 + Math.max(...cards);
      if (!handIds.has(key)) {
        handIds.set(key, hands.length);
        hands.push(cards);
      }
      return handIds.get(key);
    }),
  );
  let ranks, flopEquities;
  const turnEquities = new Map();
  const compatible = new Map();
  function coverage(board) {
    const key = runoutKey(board);
    if (!compatible.has(key))
      compatible.set(key, rangeBoardCoverage(ranges, board));
    return compatible.get(key);
  }
  function rank(id, board) {
    ranks ||= new Uint32Array(hands.length * 2704);
    const offset = id * 2704 + runoutKey(board);
    if (!ranks[offset]) ranks[offset] = rank7([...hands[id], ...board]);
    return ranks[offset];
  }
  function equity(pairIndex, board) {
    const pair = g.pairs[pairIndex];
    if (board.length === 5) {
      const hero = rank(ids[0][pair.i], board),
        villain = rank(ids[1][pair.j], board);
      return hero === villain ? 0.5 : +(hero > villain);
    }
    // A river inspection needs ranks only. Allocate each turn's equity column
    // on demand, so inspecting one later street does not reserve every turn.
    let table;
    if (board.length === 3) {
      flopEquities ||= new Float64Array(g.pairs.length).fill(NaN);
      table = flopEquities;
    } else {
      if (!turnEquities.has(board[3]))
        turnEquities.set(board[3], new Float64Array(g.pairs.length).fill(NaN));
      table = turnEquities.get(board[3]);
    }
    const offset = pairIndex;
    if (!Number.isNaN(table[offset])) return table[offset];
    const used = [
      ...g.hero[pair.i].cards,
      ...g.villain[pair.j].cards,
      ...board,
    ];
    let total = 0,
      count = 0;
    for (let card = 0; card < 52; card++) {
      if (used.includes(card)) continue;
      total += equity(pairIndex, [...board, card]);
      count++;
    }
    return (table[offset] = total / count);
  }
  return {
    coverage,
    equity,
    rank: (player, index, board) => rank(ids[player][index], board),
    get numericBytes() {
      return (
        (ranks?.byteLength || 0) +
        [...turnEquities.values()].reduce(
          (sum, table) => sum + table.byteLength,
          0,
        ) +
        (flopEquities?.byteLength || 0)
      );
    },
  };
}
