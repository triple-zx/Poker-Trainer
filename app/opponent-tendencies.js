import { rank7 } from "./engine.js";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const valid = (value) => Number.isFinite(value) && value >= -1 && value <= 1;
export function validateTendencies(s) {
  const cfg = s.fullTendencies;
  if (cfg === undefined) return;
  if (
    s.game !== "full" ||
    !object(cfg) ||
    Object.keys(cfg).some((k) => !["bluff", "raise", "classes"].includes(k)) ||
    ["bluff", "raise"].some((k) => cfg[k] !== undefined && !valid(cfg[k]))
  )
    throw Error("Full-hand tendencies must be between −1 and +1");
  if (cfg.classes === undefined) return;
  if (!object(cfg.classes)) throw Error("Invalid hand-class tendencies");
  for (const [category, row] of Object.entries(cfg.classes)) {
    if (
      !/^[0-8]$/.test(category) ||
      !object(row) ||
      Object.keys(row).some((k) => !["call", "bet", "raise"].includes(k)) ||
      Object.values(row).some((v) => !valid(v))
    )
      throw Error(
        "Hand-class call, bet and raise tendencies must be between −1 and +1",
      );
  }
}

// Shift one legal action group's total probability, preserving relative weights
// within the group and its complement. Empty-probability groups split uniformly.
export function setGroupProbability(row, indices, target) {
  if (!indices.length || indices.length === row.length) return row;
  const group = new Set(indices),
    mass = indices.reduce((sum, i) => sum + row[i], 0),
    other = row.reduce((sum, p, i) => sum + (group.has(i) ? 0 : p), 0);
  target = Math.max(0, Math.min(1, target));
  return row.map((p, i) =>
    group.has(i)
      ? target * (mass > 0 ? p / mass : 1 / indices.length)
      : (1 - target) *
        (other > 0 ? p / other : 1 / (row.length - indices.length)),
  );
}
const shifted = (p, amount) =>
  amount >= 0 ? p + (1 - p) * amount : p * (1 + amount);

export function opponentPolicy(s, node, hand, baseline) {
  const cfg = s.fullTendencies;
  let row = baseline;
  let category, byClass;
  if (cfg) {
    category = Math.floor(rank7([...hand.cards, ...node.board]) / 15 ** 5);
    byClass = cfg.classes?.[category];
    const kind = node.actions.some((a) => a.kind === "RAISE") ? "raise" : "bet";
    // High-card hands are an explicitly limited bluff proxy. Paired boards can
    // classify weak private hands as made hands; this is not an equity label.
    const tendency =
      byClass?.[kind] ??
      (category === 0 ? cfg.bluff || 0 : kind === "raise" ? cfg.raise || 0 : 0);
    if (tendency) {
      const indices = node.actions.flatMap((a, i) =>
        a.kind.toLowerCase() === kind ? [i] : [],
      );
      const mass = indices.reduce((sum, i) => sum + row[i], 0);
      row = setGroupProbability(row, indices, shifted(mass, tendency));
    }
  }
  const call = node.actions.findIndex((a) => a.kind === "CALL");
  if (call < 0) return row;
  const tendency = byClass?.call ?? s.tendency;
  const target = s.overrides[hand.label] ?? shifted(row[call], tendency);
  return target === row[call] ? row : setGroupProbability(row, [call], target);
}
