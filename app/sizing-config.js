export function betAmounts(s) {
  if (!s.sizing || s.sizing.mode === "allin") return [s.stack];
  const config = s.sizing;
  if (
    !["fast", "deep"].includes(config.mode) ||
    !Array.isArray(config.candidates) ||
    config.candidates.length < 1 ||
    config.candidates.length > 4 ||
    config.candidates.some((x) => !Number.isFinite(x) || x <= 0 || x > 1000)
  )
    throw Error("Use one to four candidate pot percentages in (0, 1000]");
  if (
    !Number.isInteger(config.maxSizes) ||
    config.maxSizes < 1 ||
    config.maxSizes > 4 ||
    !Number.isFinite(config.lossTarget) ||
    config.lossTarget < 0
  )
    throw Error("Invalid sizing complexity or loss target");
  let values = [
    ...new Set([
      ...config.candidates.map((p) =>
        Math.min(s.stack, Math.round(((s.pot * p) / 100) * 1000) / 1000),
      ),
      s.stack,
    ]),
  ].sort((a, b) => a - b);
  if (values.some((v) => v <= 0)) throw Error("Bet rounds to zero");
  if (config.mode === "deep") {
    const extra = [];
    for (let i = 1; i < values.length; i++)
      extra.push(Math.round((values[i - 1] + values[i]) * 500) / 1000);
    values = [...new Set([...values, ...extra])].sort((a, b) => a - b);
  }
  if (values.length > 9) throw Error("Too many sizing candidates");
  return values;
}

export function validateSizing(s, villain) {
  const sizes = betAmounts(s);
  if (!s.sizing) return;
  const overrides = s.sizing.nodeOverrides ?? {};
  if (
    typeof overrides !== "object" ||
    Array.isArray(overrides) ||
    overrides === null
  )
    throw Error("Invalid node overrides");
  for (const [key, v] of Object.entries(overrides)) {
    if (
      !villain.some((h) =>
        sizes.some((size) => key === h.label + "@" + size),
      ) ||
      !Number.isFinite(v) ||
      v < 0 ||
      v > 1
    )
      throw Error(
        "Node overrides use Combo@betBb keys and probabilities in [0,1]",
      );
  }
}
