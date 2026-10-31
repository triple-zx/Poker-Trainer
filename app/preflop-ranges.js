import { FULL_COMBO_LIMIT, BOUNDED_COMBO_LIMIT } from "./limits.js";
// Range construction and interchange do not assume an equilibrium strategy.
const RANKS = "23456789TJQKA",
  SUITS = "cdhs";
export const RANGE_FILE_LIMIT = 1024 * 1024;
const cardName = (c) => RANKS[Math.floor(c / 4)] + SUITS[c % 4];
const hand = (a, b, weight) => {
  const cards = [a, b].sort((x, y) => y - x);
  return { cards, weight, label: cards.map(cardName).join("") };
};
function classSpec(token) {
  const m = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/i.exec(token);
  if (!m) throw Error(`Unsupported range token: ${token}`);
  const [hi, lo] = [
    RANKS.indexOf(m[1].toUpperCase()),
    RANKS.indexOf(m[2].toUpperCase()),
  ].sort((a, b) => b - a);
  const suit = m[3].toLowerCase();
  if (hi === lo && suit)
    throw Error("Pairs cannot have a suited/offsuit suffix");
  return { hi, lo, suit };
}
export function handClass(cards) {
  const [a, b] = [...cards].sort((x, y) => y - x);
  return (
    RANKS[Math.floor(a / 4)] +
    RANKS[Math.floor(b / 4)] +
    (Math.floor(a / 4) === Math.floor(b / 4) ? "" : a % 4 === b % 4 ? "s" : "o")
  );
}
function expandClass(spec, weight) {
  const out = [];
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      if (spec.hi === spec.lo && a <= b) continue;
      if (spec.suit === "s" && a !== b) continue;
      if (spec.suit === "o" && a === b) continue;
      out.push(hand(spec.hi * 4 + a, spec.lo * 4 + b, weight));
    }
  return out;
}
function expandToken(token, weight) {
  const exact = /^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i.exec(token);
  if (exact) {
    const a =
      RANKS.indexOf(exact[1].toUpperCase()) * 4 +
      SUITS.indexOf(exact[2].toLowerCase());
    const b =
      RANKS.indexOf(exact[3].toUpperCase()) * 4 +
      SUITS.indexOf(exact[4].toLowerCase());
    if (a === b)
      throw Error("A combination cannot contain the same card twice");
    return [hand(a, b, weight)];
  }
  const specs = [];
  if (token.endsWith("+")) {
    const s = classSpec(token.slice(0, -1));
    if (s.hi === s.lo)
      for (let r = s.hi; r < 13; r++) specs.push({ hi: r, lo: r, suit: "" });
    else for (let r = s.lo; r < s.hi; r++) specs.push({ ...s, lo: r });
  } else if (token.includes("-")) {
    const parts = token.split("-");
    if (parts.length !== 2) throw Error("Invalid range interval");
    const a = classSpec(parts[0]),
      b = classSpec(parts[1]);
    if (a.suit !== b.suit) throw Error("Range interval suffixes must match");
    const count = Math.max(Math.abs(a.hi - b.hi), Math.abs(a.lo - b.lo));
    if (!(a.hi === b.hi || a.hi - a.lo === b.hi - b.lo))
      throw Error("Use pair, fixed-high-card or equal-gap intervals");
    if ((a.hi === a.lo) !== (b.hi === b.lo))
      throw Error("Do not mix pairs and nonpairs in an interval");
    for (let i = 0; i <= count; i++)
      specs.push({
        hi: a.hi + i * Math.sign(b.hi - a.hi),
        lo: a.lo + i * Math.sign(b.lo - a.lo),
        suit: a.suit,
      });
  } else specs.push(classSpec(token));
  return specs.flatMap((s) => expandClass(s, weight));
}
export function parsePreflopRange(text) {
  if (typeof text !== "string" || text.length > RANGE_FILE_LIMIT)
    throw Error("Range text must be at most 1 MiB");
  if (!text.trim()) return [];
  const seen = new Set(),
    out = [];
  for (const entry of text
    .trim()
    .replace(/\s*:\s*/g, ":")
    .split(/[,;\s]+/)) {
    if (!entry) continue;
    const parts = entry.split(":");
    if (parts.length > 2) throw Error(`Invalid weight: ${entry}`);
    let weight = 1;
    if (parts.length === 2) {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$/.test(parts[1]))
        throw Error(`Invalid weight: ${entry}`);
      weight =
        Number(parts[1].replace(/%$/, "")) / (parts[1].endsWith("%") ? 100 : 1);
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw Error(
        "Weights must be from 0 to 1, or explicit percentages from 0% to 100%",
      );
    for (const h of expandToken(parts[0], weight)) {
      if (seen.has(h.label))
        throw Error(`Overlapping or duplicate combination: ${h.label}`);
      seen.add(h.label);
      if (weight > 0) out.push(h);
    }
  }
  return out.sort((a, b) => b.cards[0] - a.cards[0] || b.cards[1] - a.cards[1]);
}
export const rangeText = (hands) =>
  hands.map((h) => `${h.label}:${h.weight}`).join(",");
export function preflopMatrix(hands) {
  const values = new Map(hands.map((h) => [h.label, h.weight]));
  return [...RANKS].reverse().flatMap((a, i) =>
    [...RANKS].reverse().map((b, j) => {
      const label = i === j ? a + b : i < j ? a + b + "s" : b + a + "o";
      const combos = parsePreflopRange(label).map((h) => ({
        ...h,
        weight: values.get(h.label) || 0,
      }));
      return {
        label,
        combos,
        weight: combos.reduce((sum, h) => sum + h.weight, 0) / combos.length,
      };
    }),
  );
}
function shortText(value, label, max = 2000) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max)
    throw Error(`Invalid ${label}`);
  return value.trim();
}
export function rangeDocument(data) {
  if (!data || data.type !== "poker-trainer-range" || data.schema !== 1)
    throw Error("Unsupported range document");
  const name = shortText(data.name, "range name", 100);
  if (!name) throw Error("Name this range before saving");
  const hands = parsePreflopRange(data.range);
  if (!hands.length)
    throw Error("Include at least one positive-weight combination");
  const originalRange = rangeText(
    parsePreflopRange(data.originalRange ?? data.range),
  );
  if (!originalRange) throw Error("Original range cannot be empty");
  const c = data.context ?? {},
    source = data.source ?? {};
  if (
    typeof c !== "object" ||
    Array.isArray(c) ||
    typeof source !== "object" ||
    Array.isArray(source)
  )
    throw Error("Invalid range metadata");
  const tableFormat = c.tableFormat || "unspecified";
  if (!["unspecified", "hu", "6max"].includes(tableFormat))
    throw Error("Unknown table format");
  const context = { tableFormat };
  for (const key of ["position", "opponentPosition", "history", "betSizes"])
    context[key] = shortText(c[key], key);
  const positions =
    tableFormat === "hu"
      ? ["", "BTN/SB", "BB"]
      : ["", "UTG", "HJ", "CO", "BTN", "SB", "BB"];
  for (const key of ["position", "opponentPosition"])
    if (tableFormat !== "unspecified" && !positions.includes(context[key]))
      throw Error("Position does not match table format");
  for (const key of ["stackBB", "rakePercent", "rakeCapBB", "anteBB"]) {
    const value = c[key] ?? null;
    if (
      value !== null &&
      (!Number.isFinite(value) ||
        value < 0 ||
        value > (key === "rakePercent" ? 100 : 100000))
    )
      throw Error(`Invalid ${key}`);
    context[key] = value;
  }
  return {
    type: "poker-trainer-range",
    schema: 1,
    name,
    range: rangeText(hands),
    originalRange,
    context,
    source: Object.fromEntries(
      ["label", "url", "license", "notes"].map((key) => [
        key,
        shortText(source[key], key),
      ]),
    ),
  };
}
export function importRangeFile(text, filename = "Imported range") {
  if (typeof text !== "string" || text.length > RANGE_FILE_LIMIT)
    throw Error("Range file exceeds 1 MiB");
  return rangeDocument(
    text.trim().startsWith("{")
      ? JSON.parse(text)
      : {
          type: "poker-trainer-range",
          schema: 1,
          name: filename.replace(/\.[^.]+$/, "").slice(0, 100),
          range: text,
          source: { label: "User import; source and quality not verified" },
        },
  );
}
export function rangeForFlop(document, flop, limit) {
  const doc = rangeDocument(document),
    matches = typeof flop === "string" ? flop.match(/[2-9TJQKA][cdhs]/g) : null;
  if (
    !matches ||
    matches.length !== 3 ||
    matches.join("") !== flop.replace(/\s/g, "") ||
    new Set(matches).size !== 3
  )
    throw Error("Choose three distinct flop cards first");
  const board = matches.map(
    (c) => RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]),
  );
  const original = parsePreflopRange(doc.range),
    hands = original.filter((h) => !h.cards.some((c) => board.includes(c)));
  if (!hands.length)
    throw Error("The flop blocks every combination in this range");
  if (hands.length > limit)
    throw Error(
      `This range has ${hands.length} unblocked combinations; this training mode currently supports ${limit}. Edit an explicit study subset before applying. No combinations were selected or dropped automatically.`,
    );
  return {
    text: rangeText(hands),
    blocked: original.length - hands.length,
    count: hands.length,
    document: doc,
  };
}
export function validateRangeOrigins(s) {
  if (s.rangeOrigins === undefined) return;
  const origins = s.rangeOrigins;
  if (
    !origins ||
    typeof origins !== "object" ||
    Array.isArray(origins) ||
    !Object.keys(origins).length ||
    Object.keys(origins).some((k) => !["hero", "villain"].includes(k))
  )
    throw Error("Invalid range provenance");
  for (const [side, doc] of Object.entries(origins)) {
    const applied = rangeForFlop(
      doc,
      s.flop,
      s.game === "full" ? FULL_COMBO_LIMIT : BOUNDED_COMBO_LIMIT,
    );
    if (applied.text !== rangeText(parsePreflopRange(s[side])))
      throw Error("Range provenance no longer matches the scenario range");
  }
}
export const RANGE_TEMPLATES = [
  [
    "All hands · construction template",
    "22+,A2+,K2+,Q2+,J2+,T2+,92+,82+,72+,62+,52+,42+,32",
  ],
  ["Pocket pairs · construction template", "22+"],
  ["Broadway · construction template", "TT+,AT+,KT+,QT+,JT"],
  ["Suited connectors · construction template", "AKs-32s"],
].map(([name, range]) =>
  rangeDocument({
    type: "poker-trainer-range",
    schema: 1,
    name,
    range,
    source: {
      label: "Poker Trainer original construction template",
      license: "CC0-1.0",
      notes:
        "Hand-family illustration only. No position, stack, rake model, recommended action or equilibrium claim. Original template data dedicated to CC0-1.0.",
    },
  }),
);
