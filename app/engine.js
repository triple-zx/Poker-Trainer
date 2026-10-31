import { validateSizing } from "./sizing-config.js";
import { validatePosition } from "./positions.js";
import { validateRangeOrigins } from "./preflop-ranges.js";
import { FULL_COMBO_LIMIT, BOUNDED_COMBO_LIMIT } from "./limits.js";
export const RANKS = "23456789TJQKA",
  SUITS = "cdhs";
export const DEFAULT = {
  name: "Ace-high · short stack lab",
  flop: "As 7d 2c",
  hero: "AhKh:1, QhQd:1, 9h8h:0.5",
  villain: "AcQc:1, KsKd:1, JhTh:0.5",
  pot: 10,
  stack: 15,
  rake: 0,
  cap: 0,
  tendency: 0,
  overrides: {},
  deviation: 1,
  iterations: 10000,
};
export function cards(text) {
  if (typeof text !== "string") throw Error("Cards must be text");
  const parts = text.trim().match(/[2-9TJQKA][cdhs]/g) || [];
  if (parts.join("") !== text.replace(/\s/g, ""))
    throw Error("Use cards such as As Kh 7d");
  const ids = parts.map((c) => RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]));
  if (new Set(ids).size !== ids.length) throw Error("Duplicate card");
  return ids;
}
export const cardName = (c) => RANKS[Math.floor(c / 4)] + SUITS[c % 4];
export function range(text, board, limit = BOUNDED_COMBO_LIMIT) {
  if (typeof text !== "string") throw Error("Range must be text");
  const seen = new Set();
  const out = text.split(",").map((entry) => {
    const parts = entry.trim().split(":");
    if (parts.length > 2) throw Error("Invalid weight");
    const hand = cards(parts[0]);
    const weight = parts.length === 1 ? 1 : Number(parts[1]);
    if (
      hand.length !== 2 ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 1
    )
      throw Error("Use exact two-card combinations with weights in (0, 1]");
    const key = [...hand].sort((a, b) => a - b).join(",");
    if (seen.has(key)) throw Error("Duplicate combination");
    seen.add(key);
    if (hand.some((c) => board.includes(c)))
      throw Error("A range card overlaps the flop");
    return { cards: hand, weight, label: hand.map(cardName).join("") };
  });
  if (out.length > limit)
    throw Error(
      `This release supports at most ${limit} combinations per player`,
    );
  return out;
}
export function validate(s) {
  if (!s || typeof s !== "object") throw Error("Invalid scenario");
  validatePosition(s);
  const board = cards(s.flop);
  if (board.length !== 3) throw Error("Choose exactly three flop cards");
  const limit = s.game === "full" ? FULL_COMBO_LIMIT : BOUNDED_COMBO_LIMIT;
  const hero = range(s.hero, board, limit),
    villain = range(s.villain, board, limit);
  for (const [key, min, max] of [
    ["pot", 0.01, 10000],
    ["stack", 0.01, 10000],
    ["rake", 0, 10],
    ["cap", 0, 1000],
    ["tendency", -1, 1],
    ["deviation", 0, 1],
    ["iterations", 100, 100000],
  ])
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw Error("Invalid " + key);
  if (!Number.isInteger(s.iterations))
    throw Error("Iterations must be an integer");
  if (typeof s.name !== "string" || s.name.length > 100)
    throw Error("Invalid scenario name");
  if (
    !s.overrides ||
    Array.isArray(s.overrides) ||
    typeof s.overrides !== "object"
  )
    throw Error("Invalid overrides");
  for (const [k, v] of Object.entries(s.overrides))
    if (
      !villain.some((h) => h.label === k) ||
      !Number.isFinite(v) ||
      v < 0 ||
      v > 1
    )
      throw Error(
        "Overrides must map opponent combinations to probabilities from 0 to 1",
      );
  validateSizing(s, villain);
  validateRangeOrigins(s);
  const pairs = [];
  hero.forEach((h, i) =>
    villain.forEach((v, j) => {
      if (!h.cards.some((c) => v.cards.includes(c)))
        pairs.push({ i, j, weight: h.weight * v.weight });
    }),
  );
  if (!pairs.length) throw Error("Ranges have no compatible deals");
  const total = pairs.reduce((a, p) => a + p.weight, 0);
  pairs.forEach((p) => (p.weight /= total));
  return { board, hero, villain, pairs };
}
const pack = (cat, r) =>
  [cat, ...r, ...Array(5 - r.length).fill(0)].reduce((a, x) => a * 15 + x, 0);
function straight(rs) {
  for (let hi = 14; hi >= 5; hi--)
    if (
      Array.from({ length: 5 }, (_, i) => (hi - i === 1 ? 14 : hi - i)).every(
        (r) => rs.includes(r),
      )
    )
      return hi;
  return 0;
}
export function rank7(cs) {
  const counts = Array(15).fill(0),
    suits = [[], [], [], []];
  for (const c of cs) {
    const r = 2 + Math.floor(c / 4);
    counts[r]++;
    suits[c % 4].push(r);
  }
  const rs = [];
  for (let r = 14; r >= 2; r--) if (counts[r]) rs.push(r);
  const flush = suits.find((s) => s.length >= 5);
  if (flush) {
    const st = straight(flush);
    if (st) return pack(8, [st]);
  }
  const four = rs.find((r) => counts[r] === 4);
  if (four) return pack(7, [four, rs.find((r) => r !== four)]);
  const trips = rs.filter((r) => counts[r] >= 3);
  if (trips.length) {
    const pair = rs.find((r) => r !== trips[0] && counts[r] >= 2);
    if (pair) return pack(6, [trips[0], pair]);
  }
  if (flush) return pack(5, flush.sort((a, b) => b - a).slice(0, 5));
  const st = straight(rs);
  if (st) return pack(4, [st]);
  if (trips.length)
    return pack(3, [trips[0], ...rs.filter((r) => r !== trips[0]).slice(0, 2)]);
  const pairs = rs.filter((r) => counts[r] >= 2);
  if (pairs.length >= 2)
    return pack(2, [
      ...pairs.slice(0, 2),
      rs.find((r) => !pairs.slice(0, 2).includes(r)),
    ]);
  if (pairs.length)
    return pack(1, [pairs[0], ...rs.filter((r) => r !== pairs[0]).slice(0, 3)]);
  return pack(0, rs.slice(0, 5));
}
export function equity(h, v, board) {
  const used = [...h, ...v, ...board],
    deck = Array.from({ length: 52 }, (_, i) => i).filter(
      (c) => !used.includes(c),
    );
  let score = 0,
    n = 0;
  for (let a = 0; a < deck.length; a++)
    for (let b = a + 1; b < deck.length; b++) {
      const run = [...board, deck[a], deck[b]],
        x = rank7([...h, ...run]),
        y = rank7([...v, ...run]);
      score += x > y ? 1 : x === y ? 0.5 : 0;
      n++;
    }
  return score / n;
}
export const rake = (pot, s) => Math.min((pot * s.rake) / 100, s.cap);
export function payoffs(e, s) {
  const p = s.pot,
    b = s.stack;
  return {
    check: [e * (p - rake(p, s)), (1 - e) * (p - rake(p, s))],
    call: [
      e * (p + 2 * b - rake(p + 2 * b, s)) - b,
      (1 - e) * (p + 2 * b - rake(p + 2 * b, s)) - b,
    ],
    fold: [p - rake(p, s), 0],
  };
}
const strategy = (r) => {
  const a = Math.max(0, r[0]),
    b = Math.max(0, r[1]);
  return a + b ? b / (a + b) : 0.5;
};
export function actionValues(g, s, eq, x, y) {
  const hv = g.hero.map(() => [0, 0]),
    vv = g.villain.map(() => [0, 0]);
  g.pairs.forEach((p, k) => {
    const u = payoffs(eq[k], s),
      w = p.weight;
    hv[p.i][0] += w * u.check[0];
    hv[p.i][1] += w * ((1 - y[p.j]) * u.fold[0] + y[p.j] * u.call[0]);
    vv[p.j][0] += w * x[p.i] * u.fold[1];
    vv[p.j][1] += w * x[p.i] * u.call[1];
  });
  return { hv, vv };
}
export function solve(s, eq, profile = null) {
  const g = validate(s);
  if (
    eq.length !== g.pairs.length ||
    eq.some((e) => !Number.isFinite(e) || e < 0 || e > 1)
  )
    throw Error("Invalid equity coverage");
  const hr = g.hero.map(() => [0, 0]),
    vr = g.villain.map(() => [0, 0]),
    hs = hr.map(() => 0),
    vs = vr.map(() => 0);
  for (let t = 0; t < (profile ? 0 : s.iterations); t++) {
    const x = hr.map(strategy),
      y = vr.map(strategy),
      { hv, vv } = actionValues(g, s, eq, x, y);
    [hr, vr].forEach((regs, z) =>
      regs.forEach((r, i) => {
        const vals = z ? vv[i] : hv[i],
          p = z ? y[i] : x[i],
          v = vals[0] * (1 - p) + vals[1] * p;
        r[0] += vals[0] - v;
        r[1] += vals[1] - v;
      }),
    );
    x.forEach((v, i) => (hs[i] += v));
    y.forEach((v, i) => (vs[i] += v));
  }
  if (profile) {
    for (const [values, count] of [
      [profile.baseline, g.hero.length],
      [profile.calls, g.villain.length],
    ])
      if (
        !Array.isArray(values) ||
        values.length !== count ||
        values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
      )
        throw Error("Invalid native profile");
  }
  const baseline = profile?.baseline || hs.map((v) => v / s.iterations),
    calls = profile?.calls || vs.map((v) => v / s.iterations),
    model = calls.map(
      (v, i) =>
        s.overrides[g.villain[i].label] ??
        (s.tendency >= 0 ? v + (1 - v) * s.tendency : v * (1 + s.tendency)),
    );
  const { hv, vv } = actionValues(g, s, eq, baseline, calls);
  const gap =
    hv.reduce(
      (a, v, i) =>
        a + Math.max(...v) - (v[0] * (1 - baseline[i]) + v[1] * baseline[i]),
      0,
    ) +
    vv.reduce(
      (a, v, i) =>
        a + Math.max(...v) - (v[0] * (1 - calls[i]) + v[1] * calls[i]),
      0,
    );
  const ev = actionValues(g, s, eq, baseline, model).hv.map((v, i) => {
    const mass = g.pairs
      .filter((p) => p.i === i)
      .reduce((a, p) => a + p.weight, 0);
    return mass ? v.map((x) => x / mass) : [0, 0];
  });
  const response = ev.map((v, i) =>
    Math.abs(v[0] - v[1]) < 1e-10 ? baseline[i] : +(v[1] > v[0]),
  );
  const adjusted = baseline.map(
    (v, i) => v * (1 - s.deviation) + response[i] * s.deviation,
  );
  return {
    schema: 1,
    engine: profile?.engine || "Reference",
    nativeProfile: profile,
    scenario: structuredClone(s),
    eq,
    baseline,
    calls,
    model,
    ev,
    response,
    adjusted,
    gap,
    coverage: g.pairs.length * 990,
    ready: true,
  };
}
export function sample(g, rng = Math.random) {
  let r = rng(),
    p = g.pairs.at(-1);
  for (const q of g.pairs) {
    r -= q.weight;
    if (r < 0) {
      p = q;
      break;
    }
  }
  const used = [...g.board, ...g.hero[p.i].cards, ...g.villain[p.j].cards],
    deck = Array.from({ length: 52 }, (_, i) => i).filter(
      (c) => !used.includes(c),
    );
  const turn = deck.splice(Math.floor(rng() * deck.length), 1)[0],
    river = deck.splice(Math.floor(rng() * deck.length), 1)[0];
  return { ...p, runout: [turn, river] };
}
export function importPackage(data) {
  if (data.schema !== 1 || !data.scenario) throw Error("Unsupported package");
  const g = validate(data.scenario);
  if (data.equities) {
    if (
      !Array.isArray(data.equities) ||
      data.equities.length !== g.pairs.length ||
      data.equities.some((e) => !Number.isFinite(e) || e < 0 || e > 1)
    )
      throw Error("Invalid result");
  }
  return { scenario: data.scenario, equities: data.equities || null };
}
