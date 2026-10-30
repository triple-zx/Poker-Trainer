import { validateFull } from "./full-game.js";
import { fullCandidates } from "./full-sizing.js";
import { analyzeNode } from "./full-node-analysis.js";
import { actionKey } from "./full-model.js";
import { scenarioPackage, sameScenario } from "./solution-package.js";

const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );

// Conservative grouping: unspecified and explicitly neutral model settings can
// remain separate. Never hide a model difference to produce a pooled average.
export function flopGroupSettings(s) {
  const g = validateFull(s);
  const range = (hands) => {
    const total = hands.reduce((sum, hand) => sum + hand.weight, 0);
    return hands
      .map((h) => ({
        cards: [...h.cards].sort((a, b) => a - b),
        weight: h.weight / total,
      }))
      .sort((a, b) => a.cards[0] - b.cards[0] || a.cards[1] - b.cards[1]);
  };
  return {
    heroPosition: s.heroPosition || "oop",
    hero: range(g.hero),
    villain: range(g.villain),
    pot: s.pot,
    stack: s.stack,
    rake: s.rake,
    cap: s.cap,
    candidates: Object.fromEntries(
      Object.entries(fullCandidates(s)).map(([street, sizes]) => [
        street,
        {
          bet: [...sizes.bet].sort((a, b) => a - b),
          raise: [...sizes.raise].sort((a, b) => a - b),
        },
      ]),
    ),
    fullSizing: s.fullSizing || null,
    tendency: s.tendency,
    overrides: s.overrides,
    deviation: s.deviation,
    fullTendencies: s.fullTendencies || null,
    // The basis binds detailed edits to their board/tree. They are not assumed
    // to mean the same opponent on another flop, even if the edit counts match.
    fullModel: s.fullModel || null,
  };
}

export function summarizeSavedFlop(
  result,
  expectedScenario,
  profile = "model",
) {
  if (!result?.full || !result.ready)
    throw Error(
      "No complete saved solution; load, precompute and save this scenario first",
    );
  if (!sameScenario(result.scenario, expectedScenario))
    throw Error(
      "Saved solution does not match the library settings; precompute and save it again",
    );
  const s = scenarioPackage(result.scenario).scenario,
    g = validateFull(s);
  if (
    result.root?.type !== "action" ||
    canonical(result.root.board) !== canonical(g.board)
  )
    throw Error("Saved solution has an invalid opening decision");
  if (![result.gap, result.modelEV].every(Number.isFinite) || result.gap < 0)
    throw Error(
      "Saved solution is missing evaluated quality or response metrics",
    );
  const report = analyzeNode(result, "root", profile);
  if (
    !report.frequencies ||
    report.frequencies.some((p) => !Number.isFinite(p) || p < 0) ||
    Math.abs(report.frequencies.reduce((a, b) => a + b, 0) - 1) > 1e-8
  )
    throw Error("Saved solution is missing the selected opening strategy");
  const summary = (r) => ({
    equity: r.equity,
    categories: r.categories,
    flushDraw: r.flushDraw,
    straightDraw: r.straightDraw,
  });
  const settings = flopGroupSettings(s);
  return {
    scenario: s,
    profile,
    settings,
    groupKey: canonical(settings),
    flopKey: [...g.board].sort((a, b) => a - b).join(","),
    board: g.board,
    hero: summary(report.hero),
    villain: summary(report.villain),
    player: result.root.player,
    actions: result.root.actions,
    frequencies: report.frequencies,
    gap: result.gap,
    modelEV: result.modelEV,
    nodes: result.nodes,
    iterations: s.iterations,
  };
}

export function aggregateFlops(entries, weightMode = "equal") {
  if (!Array.isArray(entries) || entries.length < 2)
    throw Error("Select at least two saved solutions");
  if (!["equal", "custom"].includes(weightMode))
    throw Error("Unknown flop weighting mode");
  const groups = new Map(),
    seenNames = new Set();
  for (const entry of entries) {
    if (seenNames.has(entry.name))
      throw Error("A saved solution was selected twice");
    seenNames.add(entry.name);
    const weight = weightMode === "equal" ? 1 : entry.weight;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000000)
      throw Error(
        "Each custom weight must be greater than zero and at most 1,000,000",
      );
    const summary = entry.summary;
    if (!summary || !["baseline", "model"].includes(summary.profile))
      throw Error("Missing flop summary");
    const key = summary.profile + ":" + summary.groupKey;
    if (!groups.has(key))
      groups.set(key, {
        settings: summary.settings,
        profile: summary.profile,
        rows: [],
        flops: new Set(),
        player: summary.player,
      });
    const group = groups.get(key);
    if (group.flops.has(summary.flopKey))
      throw Error(
        `Duplicate flop in a compatible group: ${entry.name}. Select one saved solve for that flop`,
      );
    if (summary.player !== group.player)
      throw Error("Cannot combine different opening players");
    group.flops.add(summary.flopKey);
    group.rows.push({ name: entry.name, weight, ...summary });
  }
  const empty = () => ({
    equity: 0,
    categories: Array(9).fill(0),
    flushDraw: 0,
    straightDraw: 0,
  });
  return {
    weightMode,
    selectedSolutions: entries.length,
    groups: [...groups.values()].map((group) => {
      const total = group.rows.reduce((sum, row) => sum + row.weight, 0);
      const hero = empty(),
        villain = empty(),
        actions = new Map();
      let modelEV = 0;
      for (const row of group.rows) {
        row.share = row.weight / total;
        for (const [side, target] of [
          ["hero", hero],
          ["villain", villain],
        ]) {
          for (const key of ["equity", "flushDraw", "straightDraw"])
            target[key] += row.share * row[side][key];
          row[side].categories.forEach(
            (p, i) => (target.categories[i] += row.share * p),
          );
        }
        modelEV += row.share * row.modelEV;
        row.actions.forEach((action, i) => {
          const key = actionKey(action),
            target = actions.get(key) || { ...action, frequency: 0 };
          target.frequency += row.share * row.frequencies[i];
          actions.set(key, target);
        });
      }
      return {
        ...group,
        flops: group.flops.size,
        totalWeight: total,
        hero,
        villain,
        modelEV,
        actions: [...actions.values()],
        maxGap: Math.max(...group.rows.map((r) => r.gap)),
        unconverged: group.rows.filter((r) => r.gap > 0.001).length,
      };
    }),
  };
}

// Load only one large saved tree at a time; only small summaries survive.
// A missing/stale entry fails the whole request rather than silently shrinking coverage.
export async function compareSavedFlops(request, load, progress = () => {}) {
  if (!request || !Array.isArray(request.entries) || request.entries.length < 2)
    throw Error("Select at least two saved solutions");
  if (!["baseline", "model"].includes(request.profile))
    throw Error("Unknown comparison profile");
  if (!["equal", "custom"].includes(request.weightMode))
    throw Error("Unknown flop weighting mode");
  const names = new Set();
  for (const entry of request.entries) {
    if (!entry || typeof entry.name !== "string" || !entry.name)
      throw Error("Invalid saved scenario name");
    if (names.has(entry.name))
      throw Error("A saved solution was selected twice");
    names.add(entry.name);
    if (
      request.weightMode === "custom" &&
      (!Number.isFinite(entry.weight) ||
        entry.weight <= 0 ||
        entry.weight > 1000000)
    )
      throw Error(
        "Each custom weight must be greater than zero and at most 1,000,000",
      );
  }
  const summaries = [];
  for (const [i, entry] of request.entries.entries()) {
    if (typeof entry.name !== "string" || !entry.name)
      throw Error("Invalid saved scenario name");
    progress({ completed: i, total: request.entries.length, name: entry.name });
    try {
      const result = await load(entry.name);
      summaries.push({
        name: entry.name,
        weight: entry.weight,
        summary: summarizeSavedFlop(result, entry.scenario, request.profile),
      });
    } catch (e) {
      throw Error(entry.name + ": " + e.message);
    }
  }
  const report = aggregateFlops(summaries, request.weightMode);
  progress({
    completed: request.entries.length,
    total: request.entries.length,
  });
  return report;
}
