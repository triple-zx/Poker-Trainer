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
  let ranks, turnEquities, flopEquities;
  const compatible = new Map();
  function coverage(board) {
    const key = runoutKey(board);
    if (!compatible.has(key)) {
      const legal = ranges.map((range) =>
        range.map((hand) => !hand.cards.some((c) => board.includes(c))),
      );
      const pairIndices = [],
        actors = [new Set(), new Set()];
      g.pairs.forEach((pair, k) => {
        if (!legal[0][pair.i] || !legal[1][pair.j]) return;
        pairIndices.push(k);
        actors[0].add(pair.i);
        actors[1].add(pair.j);
      });
      compatible.set(key, { pairIndices, actors });
    }
    return compatible.get(key);
  }
  function rank(id, board) {
    const offset = id * 2704 + runoutKey(board);
    if (!ranks[offset]) ranks[offset] = rank7([...hands[id], ...board]);
    return ranks[offset];
  }
  function equity(pairIndex, board) {
    if (!ranks) {
      ranks = new Uint32Array(hands.length * 2704);
      turnEquities = new Float64Array(g.pairs.length * 52).fill(NaN);
      flopEquities = new Float64Array(g.pairs.length).fill(NaN);
    }
    const pair = g.pairs[pairIndex];
    if (board.length === 5) {
      const hero = rank(ids[0][pair.i], board),
        villain = rank(ids[1][pair.j], board);
      return hero === villain ? 0.5 : +(hero > villain);
    }
    const table = board.length === 3 ? flopEquities : turnEquities;
    const offset = board.length === 3 ? pairIndex : pairIndex * 52 + board[3];
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
    get numericBytes() {
      return (
        (ranks?.byteLength || 0) +
        (turnEquities?.byteLength || 0) +
        (flopEquities?.byteLength || 0)
      );
    },
  };
}
