export function validateFullSizing(s) {
  const cfg = s.fullSizing;
  if (!cfg) return;
  if (
    !["fast", "deep"].includes(cfg.mode) ||
    !Number.isInteger(cfg.maxBets) ||
    cfg.maxBets < 1 ||
    cfg.maxBets > 3 ||
    !Number.isInteger(cfg.maxRaises) ||
    cfg.maxRaises < 1 ||
    cfg.maxRaises > 3 ||
    !Number.isFinite(cfg.lossTarget) ||
    cfg.lossTarget < 0 ||
    cfg.lossTarget > s.pot
  )
    throw Error(
      "Choose fast/deep sizing, one to three retained bets/raises, and a loss target between zero and the starting pot",
    );
}

// Deep is a finite candidate expansion. The geometric seed describes equal
// pot-fraction betting from the starting flop, not optimal sizing on every line.
export function fullCandidates(s) {
  const out = structuredClone(s.betting);
  if (s.fullSizing?.mode !== "deep") return out;
  const geometric =
    Math.round(500 * ((1 + (2 * s.stack) / s.pot) ** (1 / 3) - 1)) / 10;
  for (const street of ["flop", "turn", "river"]) {
    for (const kind of ["bet", "raise"]) {
      const values = [...out[street][kind]].sort((a, b) => a - b);
      const floor = kind === "bet" ? 25 : 50;
      const midpoint =
        values.length > 1
          ? (values[0] + values[1]) / 2
          : (values[0] + (values[0] > floor ? floor : 200)) / 2;
      values.push(Math.round(midpoint * 10) / 10);
      if (kind === "bet" && geometric >= 25 && geometric <= 200)
        values.push(geometric);
      out[street][kind] = [...new Set(values)].sort((a, b) => a - b);
    }
  }
  return out;
}

// rows[action][privateHand] already contains counterfactual deal mass.
// Each menu is shared across the private range; never pick sizes separately
// after seeing the opponent's hidden hand.
export function selectNodeMenu(actions, rows, maxBets, maxRaises) {
  const passive = actions
    .map((_, i) => i)
    .filter((i) => !["BET", "RAISE"].includes(actions[i].kind));
  const aggressive = actions
    .map((_, i) => i)
    .filter((i) => ["BET", "RAISE"].includes(actions[i].kind));
  let best = null;
  for (let mask = 0; mask < 2 ** aggressive.length; mask++) {
    const selected = aggressive.filter((_, i) => mask & (1 << i));
    if (
      selected.filter((i) => actions[i].kind === "BET").length > maxBets ||
      selected.filter((i) => actions[i].kind === "RAISE").length > maxRaises
    )
      continue;
    const menu = [...passive, ...selected].sort((a, b) => a - b);
    if (!menu.length) continue;
    const value = rows[0].reduce(
      (sum, _, i) => sum + Math.max(...menu.map((a) => rows[a][i])),
      0,
    );
    if (
      !best ||
      value > best.value + 1e-12 ||
      (Math.abs(value - best.value) <= 1e-12 &&
        menu.length < best.actions.length)
    )
      best = { actions: menu, value };
  }
  if (!best) throw Error("No legal sizing menu");
  return best.actions;
}

export function chooseMenuLimits(candidates, fullValue, target) {
  const options = candidates.map((c) => ({
    ...c,
    loss: Math.max(0, fullValue - c.value),
  }));
  const complexity = (c) => c.maxBets + c.maxRaises;
  const within = options
    .filter((c) => c.loss <= target + 1e-10)
    .sort(
      (a, b) =>
        complexity(a) - complexity(b) ||
        a.loss - b.loss ||
        a.maxBets - b.maxBets,
    );
  const best =
    within[0] ||
    options.sort((a, b) => a.loss - b.loss || complexity(a) - complexity(b))[0];
  return {
    ...best,
    fullValue,
    targetReached: within.length > 0,
    lossTarget: target,
  };
}
