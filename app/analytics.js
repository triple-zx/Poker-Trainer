import { rank7 } from "./engine.js";
import { betAmounts } from "./sizing-config.js";

export function recordActions(record) {
  if (Array.isArray(record.actions)) return record.actions;
  return record.config?.sizing
    ? [0, ...betAmounts(record.config)]
    : [0, record.config?.stack];
}

export const CATEGORIES = [
  ["High card", "高牌"],
  ["One pair", "一对"],
  ["Two pair", "两对"],
  ["Three of a kind", "三条"],
  ["Straight", "顺子"],
  ["Flush", "同花"],
  ["Full house", "葫芦"],
  ["Four of a kind", "四条"],
  ["Straight flush", "同花顺"],
];
const hasStraight = (ranks) =>
  Array.from({ length: 10 }, (_, i) => i + 5).some((high) =>
    Array.from({ length: 5 }, (_, i) => high - i).every((rank) =>
      ranks.has(rank === 1 ? 14 : rank),
    ),
  );
export function handFeatures(hole, board) {
  const known = [...hole, ...board],
    category = Math.floor(rank7(known) / 15 ** 5),
    suits = [0, 0, 0, 0],
    ranks = new Set(known.map((c) => Math.floor(c / 4) + 2));
  known.forEach((c) => suits[c % 4]++);
  const straightRanks = hasStraight(ranks)
    ? []
    : Array.from({ length: 13 }, (_, i) => i + 2).filter(
        (r) => !ranks.has(r) && hasStraight(new Set([...ranks, r])),
      );
  return {
    category,
    flushDraw: suits.includes(4),
    backdoorFlush: board.length === 3 && suits.includes(3),
    straightOuts: straightRanks.reduce(
      (sum, r) =>
        sum + 4 - known.filter((c) => Math.floor(c / 4) + 2 === r).length,
      0,
    ),
  };
}
export function summarizeRange(g, eq, side = "hero") {
  const own = g[side],
    other = g[side === "hero" ? "villain" : "hero"],
    ownKey = side === "hero" ? "i" : "j",
    otherKey = side === "hero" ? "j" : "i",
    totalOther = other.reduce((sum, h) => sum + h.weight, 0);
  const hands = own.map((h, i) => {
    const indices = g.pairs.flatMap((p, k) => (p[ownKey] === i ? [k] : [])),
      mass = indices.reduce((sum, k) => sum + g.pairs[k].weight, 0),
      equity = mass
        ? indices.reduce(
            (sum, k) =>
              sum + g.pairs[k].weight * (side === "hero" ? eq[k] : 1 - eq[k]),
            0,
          ) / mass
        : null,
      blocked = other.filter((v) => v.cards.some((c) => h.cards.includes(c)));
    return {
      ...h,
      ...handFeatures(h.cards, g.board),
      mass,
      equity,
      blockedWeight: blocked.reduce((sum, v) => sum + v.weight, 0) / totalOther,
      blockedCombos: blocked.map((v) => v.label),
      compatible: indices.map((k) => other[g.pairs[k][otherKey]].label),
    };
  });
  return {
    hands,
    equity: hands.reduce((sum, h) => sum + h.mass * (h.equity ?? 0), 0),
    categories: CATEGORIES.map((_, cat) =>
      hands
        .filter((h) => h.category === cat)
        .reduce((sum, h) => sum + h.mass, 0),
    ),
    flushDraw: hands
      .filter((h) => h.flushDraw)
      .reduce((sum, h) => sum + h.mass, 0),
    straightDraw: hands
      .filter((h) => h.straightOuts > 0)
      .reduce((sum, h) => sum + h.mass, 0),
  };
}
export function practiceGroups(g) {
  const features = g.hero.map((h) => handFeatures(h.cards, g.board)),
    groups = [];
  CATEGORIES.forEach((label, c) => {
    const indices = features.flatMap((f, i) => (f.category === c ? [i] : []));
    if (indices.length) groups.push({ key: "category:" + c, label, indices });
  });
  for (const [key, label, predicate] of [
    ["flush", ["Flush draws", "同花听牌"], (f) => f.flushDraw],
    ["straight", ["Straight draws", "顺子听牌"], (f) => f.straightOuts > 0],
    [
      "backdoor",
      ["Backdoor flush patterns", "后门同花牌型"],
      (f) => f.backdoorFlush,
    ],
  ]) {
    const indices = features.flatMap((f, i) => (predicate(f) ? [i] : []));
    if (indices.length) groups.push({ key: "draw:" + key, label, indices });
  }
  return groups;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function calibration(records) {
  const groups = new Map();
  for (const r of records) {
    if (!r.config || !Number.isFinite(r.loss)) continue;
    const target = Array.isArray(r.target)
      ? r.target
      : [1 - r.target, r.target];
    if (
      target.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
      Math.abs(target.reduce((a, b) => a + b, 0) - 1) > 1e-5 ||
      !Number.isInteger(r.action) ||
      r.action < 0 ||
      r.action >= target.length
    )
      continue;
    const key = JSON.stringify([
      canonical(r.config),
      r.hero,
      r.targeted || false,
      r.practiceTarget || "",
      recordActions(r),
    ]);
    if (!groups.has(key))
      groups.set(key, {
        scenario: r.scenario,
        hero: r.hero,
        targeted: !!r.targeted,
        actions: recordActions(r),
        count: 0,
        loss: 0,
        observed: target.map(() => 0),
        expected: target.map(() => 0),
        variance: target.map(() => 0),
      });
    const g = groups.get(key);
    g.count++;
    g.loss += r.loss;
    g.observed[r.action]++;
    target.forEach((p, a) => {
      g.expected[a] += p;
      g.variance[a] += p * (1 - p);
    });
  }
  return [...groups.values()].map((g) => ({
    ...g,
    meanLoss: g.loss / g.count,
    observed: g.observed.map((n) => n / g.count),
    expected: g.expected.map((n) => n / g.count),
    standardError: g.variance.map((v) => Math.sqrt(v) / g.count),
  }));
}
