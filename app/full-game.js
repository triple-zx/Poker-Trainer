import { validate, cards, cardName, rank7 } from "./engine.js";

const EPS = 0.00001;
const round = (n) => Math.round(n * 1000) / 1000;
export function validateFull(s) {
  const g = validate(s);
  if (s.game !== "full") throw Error("Choose full-hand training");
  if (s.rake && s.cap)
    throw Error("Full-hand native training currently requires zero rake");
  if (s.pot < 4 || s.stack < 1 || s.stack / s.pot > 3)
    throw Error(
      "Full-hand trees support a pot of at least 4 bb and stacks from 1 bb to 3 times the pot",
    );
  if (g.hero.length > 4 || g.villain.length > 4)
    throw Error(
      "Full-hand trees support up to four exact combinations per player",
    );
  if (s.sizing) throw Error("Use full-hand sizing settings");
  for (const street of ["flop", "turn", "river"]) {
    const cfg = s.betting?.[street];
    if (!cfg) throw Error("Missing " + street + " sizes");
    for (const kind of ["bet", "raise"]) {
      const a = cfg[kind];
      if (
        !Array.isArray(a) ||
        !a.length ||
        a.length > 2 ||
        new Set(a).size !== a.length ||
        a.some(
          (v) =>
            !Number.isFinite(v) || v < (kind === "raise" ? 50 : 25) || v > 200,
        )
      )
        throw Error(
          "Choose one or two distinct " +
            street +
            " " +
            kind +
            " percentages between " +
            (kind === "raise" ? 50 : 25) +
            " and 200",
        );
    }
  }
  return g;
}
export function initialState(s) {
  return {
    board: cards(s.flop),
    spent: [0, 0],
    street: [0, 0],
    player: 0,
    checks: 0,
    lastRaise: 1,
    raises: 0,
    type: "action",
  };
}
export function transition(s, state, action) {
  if (state.type !== "action") throw Error("Action at a non-decision");
  const p = state.player,
    other = 1 - p,
    gap = round(state.spent[other] - state.spent[p]);
  const n = {
    ...state,
    spent: [...state.spent],
    street: [...state.street],
    player: other,
  };
  const finish = () => {
    n.type =
      n.board.length === 5 || n.spent.every((x) => Math.abs(x - s.stack) < EPS)
        ? "terminal"
        : "chance";
    n.winner = -1;
    return n;
  };
  if (action.kind === "FOLD") {
    if (gap <= EPS) throw Error("Cannot fold without a bet");
    return { ...n, type: "terminal", winner: other };
  }
  if (action.kind === "CHECK") {
    if (gap > EPS) throw Error("Cannot check facing a bet");
    n.checks++;
    return n.checks === 2 ? finish() : n;
  }
  if (action.kind === "CALL") {
    if (gap <= EPS) throw Error("Cannot call without a bet");
    n.spent[p] = state.spent[other];
    n.street[p] = round(n.street[p] + gap);
    return finish();
  }
  if (
    !["BET", "RAISE"].includes(action.kind) ||
    (action.kind === "BET") !== gap <= EPS
  )
    throw Error("Invalid bet or raise");
  const amount = action.amount,
    remaining = round(s.stack - state.spent[p]),
    increment = round(amount - gap);
  if (
    !Number.isFinite(amount) ||
    amount > remaining + EPS ||
    increment <= EPS ||
    (increment < (gap > EPS ? state.lastRaise : 1) - EPS &&
      amount < remaining - EPS)
  )
    throw Error("Illegal bet or raise amount");
  n.spent[p] = round(n.spent[p] + amount);
  n.street[p] = round(n.street[p] + amount);
  n.lastRaise = increment;
  n.checks = 0;
  n.raises = (state.raises || 0) + 1;
  return n;
}
export function nextStreet(state, card) {
  if (
    state.type !== "chance" ||
    state.board.includes(card) ||
    !Number.isInteger(card) ||
    card < 0 ||
    card > 51
  )
    throw Error("Invalid street transition");
  return {
    ...state,
    type: "action",
    board: [...state.board, card],
    street: [0, 0],
    player: 0,
    checks: 0,
    lastRaise: 1,
    raises: 0,
  };
}
export const streetName = (board) =>
  ["Flop", "Turn", "River"][board.length - 3];
export function fullActionLabel(action, state, s) {
  const p = state.player;
  if (action.kind === "CALL")
    return "Call " + round(state.spent[1 - p] - state.spent[p]) + " bb";
  if (action.kind === "CHECK") return "Check";
  if (action.kind === "FOLD") return "Fold";
  const allin = Math.abs(state.spent[p] + action.amount - s.stack) < EPS;
  return (
    (action.kind === "RAISE"
      ? "Raise to " + round(state.street[p] + action.amount)
      : "Bet " + action.amount) +
    " bb" +
    (allin ? " · all-in" : "")
  );
}

// The native export omits terminal children. Infer them only from legal game
// transitions; a missing nonterminal branch is an error, never a check-down.
export function convertFull(raw, s, { portable = false } = {}) {
  const g = validateFull(s),
    ranges = [g.hero, g.villain];
  let count = 0;
  const compatible = (board) =>
    g.pairs.filter(
      (p) =>
        ![...g.hero[p.i].cards, ...g.villain[p.j].cards].some((c) =>
          board.includes(c),
        ),
    );
  function visit(data, state) {
    if (++count > 600000)
      throw Error(
        "Tree exceeds the 600,000-node budget. Reduce sizes or stacks.",
      );
    if (state.type === "terminal")
      return {
        type: "terminal",
        board: state.board,
        spent: state.spent,
        winner: state.winner,
      };
    if (state.type === "chance") {
      if (
        portable ? data?.type !== "chance" : data?.node_type !== "chance_node"
      )
        throw Error("Missing chance continuation");
      const children = {};
      for (let c = 0; c < 52; c++) {
        if (state.board.includes(c) || !compatible([...state.board, c]).length)
          continue;
        children[c] = visit(
          portable ? data.children?.[c] : data.dealcards?.[cardName(c)],
          nextStreet(state, c),
        );
      }
      return {
        type: "chance",
        board: state.board,
        spent: state.spent,
        children,
      };
    }
    if (
      (portable
        ? data?.type !== "action"
        : data?.node_type !== "action_node" ||
          data.player !== 1 - state.player) ||
      !Array.isArray(data.actions) ||
      !data.actions.length ||
      data.actions.length > 8
    )
      throw Error("Missing or unexpected decision node");
    const actions = data.actions.map((a) => {
      if (portable) {
        if (!a || !["CHECK", "CALL", "FOLD", "BET", "RAISE"].includes(a.kind))
          throw Error("Invalid saved action");
        return ["BET", "RAISE"].includes(a.kind)
          ? { kind: a.kind, amount: a.amount }
          : { kind: a.kind };
      }
      if (["CHECK", "CALL", "FOLD"].includes(a)) return { kind: a };
      const m = /^(BET|RAISE) ([0-9]+(?:\.[0-9]+)?)$/.exec(a);
      if (!m) throw Error("Invalid native action");
      return { kind: m[1], amount: Number(m[2]) / 1000 };
    });
    const gap = state.spent[1 - state.player] - state.spent[state.player];
    for (const required of gap > EPS ? ["CALL", "FOLD"] : ["CHECK"])
      if (!actions.some((a) => a.kind === required))
        throw Error("Missing legal passive action");
    if (new Set(actions.map((a) => JSON.stringify(a))).size !== actions.length)
      throw Error("Duplicate action");
    const kind = gap > EPS ? "RAISE" : "BET",
      remaining = round(s.stack - state.spent[state.player]);
    const cfg = s.betting[streetName(state.board).toLowerCase()];
    const amounts =
      gap > EPS && state.raises >= 4
        ? []
        : [
            ...cfg[kind.toLowerCase()].map((percent) =>
              Math.min(
                remaining,
                round(
                  ((s.pot + 2 * Math.max(...state.spent)) * percent) / 100,
                ) + (gap > EPS ? gap : 0),
              ),
            ),
            remaining,
          ];
    const expected = [
      ...new Set(amounts.map(round).filter((amount) => amount > gap + EPS)),
    ];
    if (
      expected.some(
        (amount) =>
          !actions.some(
            (a) => a.kind === kind && Math.abs(a.amount - amount) < 0.0011,
          ),
      ) ||
      actions.filter((a) => a.kind === kind).length !== expected.length
    )
      throw Error("Native tree omitted or changed a configured size");
    if (
      !portable &&
      data.strategy?.actions &&
      JSON.stringify(data.strategy.actions) !== JSON.stringify(data.actions)
    )
      throw Error("Native strategy action order differs");
    const pairs = compatible(state.board),
      indices = new Set(pairs.map((p) => (state.player ? p.j : p.i)));
    const policy = ranges[state.player].map((h, i) => {
      if (!indices.has(i)) return null;
      const v = portable
        ? data.policy?.[i]
        : data.strategy?.strategy?.[h.label] ||
          data.strategy?.strategy?.[h.label.slice(2) + h.label.slice(0, 2)];
      if (
        !Array.isArray(v) ||
        v.length !== actions.length ||
        v.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
        Math.abs(v.reduce((a, b) => a + b, 0) - 1) > 0.0001
      )
        throw Error("Missing or invalid legal-combination strategy");
      const mass = v.reduce((a, b) => a + b, 0);
      return v.map((x) => x / mass);
    });
    const children = actions.map((a, i) =>
      visit(
        portable ? data.children?.[i] : data.childrens?.[data.actions[i]],
        transition(s, state, a),
      ),
    );
    return {
      type: "action",
      board: state.board,
      spent: state.spent,
      street: state.street,
      player: state.player,
      actions,
      policy,
      children,
    };
  }
  const root = visit(raw, initialState(s));
  return { root, nodes: count };
}

export function boardEquity(h, v, board, cache = new Map()) {
  const key =
    h.join(",") +
    "/" +
    v.join(",") +
    "/" +
    [...board].sort((a, b) => a - b).join(",");
  if (cache.has(key)) return cache.get(key);
  if (board.length === 5) {
    const a = rank7([...h, ...board]),
      b = rank7([...v, ...board]);
    const value = a === b ? 0.5 : +(a > b);
    cache.set(key, value);
    return value;
  }
  const used = [...h, ...v, ...board];
  let total = 0,
    count = 0;
  for (let c = 0; c < 52; c++)
    if (!used.includes(c)) {
      total += boardEquity(h, v, [...board, c], cache);
      count++;
    }
  const value = total / count;
  cache.set(key, value);
  return value;
}

// Counterfactual reach excludes the responding player's own choices. Maximize
// AFTER summing over the hidden opponent range, never once per private pair.
export function evaluateFull(tree, s, { store = true } = {}) {
  const g = validateFull(s),
    ranges = [g.hero, g.villain],
    cache = new Map();
  const modeled = new WeakSet();
  const index = (p, player) => (player ? p.j : p.i);
  const policies = (node, model) => {
    if (!model || node.player !== 1) return node.policy;
    if (modeled.has(node)) return node.model;
    node.model = node.policy.map((v, i) => {
      if (!v) return null;
      const call = node.actions.findIndex((a) => a.kind === "CALL");
      if (call < 0) return v;
      const target =
        s.overrides[g.villain[i].label] ??
        (s.tendency >= 0
          ? v[call] + (1 - v[call]) * s.tendency
          : v[call] * (1 + s.tendency));
      return v.map((x, a) =>
        a === call
          ? target
          : (1 - target) *
            (v[call] < 1 - 1e-12 ? x / (1 - v[call]) : 1 / (v.length - 1)),
      );
    });
    modeled.add(node);
    return node.model;
  };
  function response(player, model, record) {
    function walk(node, reach) {
      const values = Array(ranges[player].length).fill(0);
      if (node.type === "terminal") {
        const pot = s.pot + node.spent[0] + node.spent[1];
        g.pairs.forEach((p, k) => {
          if (!reach[k]) return;
          const eq =
            node.winner >= 0
              ? +(node.winner === player)
              : player
                ? 1 -
                  boardEquity(
                    g.hero[p.i].cards,
                    g.villain[p.j].cards,
                    node.board,
                    cache,
                  )
                : boardEquity(
                    g.hero[p.i].cards,
                    g.villain[p.j].cards,
                    node.board,
                    cache,
                  );
          values[index(p, player)] +=
            reach[k] * (eq * pot - node.spent[player]);
        });
        return values;
      }
      if (node.type === "chance") {
        for (const [card, child] of Object.entries(node.children)) {
          const c = Number(card),
            next = reach.map((r, k) => {
              const p = g.pairs[k];
              return g.hero[p.i].cards.includes(c) ||
                g.villain[p.j].cards.includes(c)
                ? 0
                : r / (52 - node.board.length - 4);
            });
          const v = walk(child, next);
          v.forEach((x, i) => (values[i] += x));
        }
        return values;
      }
      const policy = policies(node, model);
      if (node.player !== player) {
        node.children.forEach((child, a) => {
          const v = walk(
            child,
            reach.map(
              (r, k) => r * (policy[index(g.pairs[k], node.player)]?.[a] || 0),
            ),
          );
          v.forEach((x, i) => (values[i] += x));
        });
        return values;
      }
      const rows = node.children.map((child) => walk(child, reach));
      const masses = Array(values.length).fill(0);
      g.pairs.forEach((p, k) => (masses[index(p, player)] += reach[k]));
      const ev = values.map((_, i) =>
        masses[i] ? rows.map((row) => row[i] / masses[i]) : null,
      );
      values.forEach(
        (_, i) => (values[i] = Math.max(...rows.map((row) => row[i]))),
      );
      if (record) {
        node.ev = ev;
        node.adjusted = ev.map((v, i) => {
          if (!v) return null;
          const best = Math.max(...v),
            winners = v.map((x) => (Math.abs(x - best) < 1e-8 ? 1 : 0)),
            n = winners.reduce((a, b) => a + b, 0);
          return v.map(
            (_, a) =>
              (1 - s.deviation) * node.policy[i][a] +
              (s.deviation * winners[a]) / n,
          );
        });
      }
      return values;
    }
    return walk(
      tree.root,
      g.pairs.map((p) => p.weight),
    ).reduce((a, b) => a + b, 0);
  }
  const h = response(0, false, false),
    v = response(1, false, false);
  const modelEV = response(0, true, store);
  return {
    full: true,
    schema: 2,
    scenario: structuredClone(s),
    ...tree,
    gap: Math.max(0, h + v - s.pot),
    modelEV,
    ready: true,
    engine: "TexasSolver · independently evaluated full streets",
    coverage: g.pairs.length * 45 * 44,
    eq: g.pairs.map((p) =>
      boardEquity(g.hero[p.i].cards, g.villain[p.j].cards, g.board, cache),
    ),
  };
}
