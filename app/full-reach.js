// Counterfactual reach for independent starting ranges factors into own hand
// weight, opponent hand/action weight, and a public chance/normalization scalar.
// Card collisions are excluded when summing, never treated as independent deals.
export function fullReachContext(g, cardContext) {
  const ranges = [g.hero, g.villain];
  const key = ([a, b]) => Math.min(a, b) * 52 + Math.max(a, b);
  const exact = ranges.map(
    (range) => new Map(range.map((h, i) => [key(h.cards), i])),
  );
  const normalizer = g.pairs.reduce(
    (sum, p) => sum + g.hero[p.i].weight * g.villain[p.j].weight,
    0,
  );
  const orders = new Map();
  function ordered(board) {
    const k = Math.min(board[3], board[4]) * 52 + Math.max(board[3], board[4]);
    if (!orders.has(k))
      orders.set(
        k,
        ranges.map((range, player) =>
          Uint16Array.from(
            range
              .flatMap((h, i) =>
                h.cards.some((c) => board.includes(c)) ? [] : [i],
              )
              .sort(
                (a, b) =>
                  cardContext.rank(player, a, board) -
                  cardContext.rank(player, b, board),
              ),
          ),
        ),
      );
    return orders.get(k);
  }
  function aggregate(player) {
    return {
      player,
      total: 0,
      cards: new Float64Array(52),
      weights: new Float64Array(ranges[player].length),
      active: [],
    };
  }
  function add(sum, i, weight) {
    if (!weight) return;
    const [a, b] = ranges[sum.player][i].cards;
    sum.total += weight;
    sum.cards[a] += weight;
    sum.cards[b] += weight;
    sum.weights[i] = weight;
    sum.active.push(i);
  }
  function clear(sum) {
    sum.total = 0;
    sum.cards.fill(0);
    for (const i of sum.active) sum.weights[i] = 0;
    sum.active.length = 0;
  }
  function compatible(sum, hand) {
    const [a, b] = hand.cards;
    const identical = exact[sum.player].get(key(hand.cards));
    const mass =
      sum.total - sum.cards[a] - sum.cards[b] + (sum.weights[identical] || 0);
    // Cancellation can hide very small but positive compatible weights. Re-sum
    // those cases directly; never prune a low-reach hand using a threshold.
    if (mass > sum.total * 1e-4) return mass;
    let direct = 0;
    for (const i of sum.active) {
      const cards = ranges[sum.player][i].cards;
      if (!cards.includes(a) && !cards.includes(b)) direct += sum.weights[i];
    }
    return direct;
  }
  function masses(player, reach) {
    if (g.pairs.length <= 256) {
      const values = Array(ranges[player].length).fill(0);
      for (const p of g.pairs) {
        const i = player ? p.j : p.i,
          j = player ? p.i : p.j;
        values[i] += reach.own[i] * reach.other[j] * reach.scale;
      }
      return values;
    }
    const sum = aggregate(1 - player);
    reach.other.forEach((weight, i) => add(sum, i, weight));
    return ranges[player].map(
      (hand, i) => reach.own[i] * compatible(sum, hand) * reach.scale,
    );
  }
  function terminal(player, reach, node, pot) {
    const values = Array(ranges[player].length).fill(0);
    if (node.winner >= 0) {
      const payoff = (node.winner === player ? pot : 0) - node.spent[player];
      return masses(player, reach).map((mass) => mass * payoff);
    }
    if (node.board.length < 5 || g.pairs.length <= 256) {
      // Exact all-in equity is shared across betting histories by cardContext.
      g.pairs.forEach((p, k) => {
        const i = player ? p.j : p.i,
          j = player ? p.i : p.j;
        const weight = reach.own[i] * reach.other[j] * reach.scale;
        if (!weight) return;
        const hero = cardContext.equity(k, node.board);
        values[i] +=
          weight * ((player ? 1 - hero : hero) * pot - node.spent[player]);
      });
      return values;
    }
    // Sweep sorted river ranks. Prefix and tie masses exclude both private
    // cards, so showdown costs grow with hand counts rather than their product.
    const order = ordered(node.board),
      opponent = 1 - player;
    const total = aggregate(opponent),
      lower = aggregate(opponent),
      ties = aggregate(opponent);
    for (const j of order[opponent]) add(total, j, reach.other[j]);
    let cursor = 0,
      previousRank = -1;
    for (const i of order[player]) {
      if (!reach.own[i]) continue;
      const rank = cardContext.rank(player, i, node.board);
      if (rank !== previousRank) {
        while (
          cursor < order[opponent].length &&
          cardContext.rank(opponent, order[opponent][cursor], node.board) < rank
        ) {
          const j = order[opponent][cursor++];
          add(lower, j, reach.other[j]);
        }
        clear(ties);
        for (let k = cursor; k < order[opponent].length; k++) {
          const j = order[opponent][k];
          if (cardContext.rank(opponent, j, node.board) !== rank) break;
          add(ties, j, reach.other[j]);
        }
        previousRank = rank;
      }
      const hand = ranges[player][i];
      const wins = compatible(lower, hand) + 0.5 * compatible(ties, hand);
      values[i] =
        reach.own[i] *
        reach.scale *
        (wins * pot - compatible(total, hand) * node.spent[player]);
    }
    return values;
  }
  return {
    initial(player) {
      return {
        own: ranges[player].map((h) => h.weight),
        other: ranges[1 - player].map((h) => h.weight),
        scale: 1 / normalizer,
      };
    },
    chance(player, reach, card, boardLength) {
      return {
        own: reach.own.map((w, i) =>
          ranges[player][i].cards.includes(card) ? 0 : w,
        ),
        other: reach.other.map((w, i) =>
          ranges[1 - player][i].cards.includes(card) ? 0 : w,
        ),
        scale: reach.scale / (52 - boardLength - 4),
      };
    },
    action(reach, policy, action) {
      return {
        ...reach,
        other: reach.other.map((w, i) => w * (policy[i]?.[action] || 0)),
      };
    },
    masses,
    terminal,
  };
}
