import { DEFAULT, importPackage, validate } from "./engine.js";
import { validateRangeOrigins, rangeDocument } from "./preflop-ranges.js";
import { convertFull, evaluateFull, validateFull } from "./full-game.js";
import { modelBasis } from "./full-model.js";
import { validateTendencies } from "./opponent-tendencies.js";

export const PACKAGE_LIMIT = 128 * 1024 * 1024;
const scenarioFields = [
  ...Object.keys(DEFAULT),
  "game",
  "engine",
  "betting",
  "sizing",
  "fullSizing",
  "fullModel",
  "fullTendencies",
  "heroPosition",
  "rangeOrigins",
];
// Export only game settings and baseline policies. Journals, sampled cards,
// cached EVs, and application/storage state never enter a shared package.
function scenarioCopy(s) {
  const copy = structuredClone(
    Object.fromEntries(
      scenarioFields
        .filter((key) => Object.hasOwn(s, key))
        .map((key) => [key, s[key]]),
    ),
  );
  if (copy.game === "full") copy.engine = "native";
  if (copy.heroPosition === "oop") delete copy.heroPosition;
  validateTendencies(copy);
  validateRangeOrigins(copy);
  if (copy.rangeOrigins)
    copy.rangeOrigins = Object.fromEntries(
      Object.entries(copy.rangeOrigins).map(([side, doc]) => [
        side,
        rangeDocument(doc),
      ]),
    );
  return copy;
}
export function sameScenario(a, b) {
  if (!a || !b) return false;
  const canonical = (s) =>
    JSON.stringify(scenarioCopy(s), (_, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
    );
  return canonical(a) === canonical(b);
}
const needsV3 = (s) => s.heroPosition === "ip" || !!s.fullModel;
const modelVersion = (s) =>
  s.rangeOrigins ? 5 : s.fullTendencies ? 4 : needsV3(s) ? 3 : null;
export function scenarioPackage(s, equities) {
  const scenario = scenarioCopy(s);
  if (scenario.game === "full") validateFull(scenario);
  return modelVersion(scenario)
    ? {
        schema: modelVersion(scenario),
        type: "poker-trainer-scenario",
        scenario,
      }
    : { schema: 1, scenario, equities };
}
export function solutionPackage(result) {
  if (!result?.full || !result.ready)
    throw Error("Precompute a complete full-hand solution first");
  const scenario = scenarioCopy(result.scenario);
  validateFull(scenario);
  let count = 0;
  function pack(node) {
    if (++count > 600000) throw Error("Solution exceeds the node budget");
    if (node.type === "terminal") return null; // Reconstructed from legal transitions.
    if (node.type === "chance")
      return {
        type: "chance",
        children: Object.fromEntries(
          Object.entries(node.children).map(([card, child]) => [
            card,
            pack(child),
          ]),
        ),
      };
    if (node.type !== "action") throw Error("Invalid solution node");
    return {
      type: "action",
      actions: node.actions.map(({ kind, amount }) =>
        amount === undefined ? { kind } : { kind, amount },
      ),
      policy: node.policy.map((row) => (row ? [...row] : null)),
      children: node.children.map(pack),
    };
  }
  return {
    schema: modelVersion(scenario) || 2,
    type: "poker-trainer-solution",
    scenario,
    tree: pack(result.root),
  };
}
export function restorePackage(data) {
  if (
    [3, 4, 5].includes(data?.schema) &&
    data.type === "poker-trainer-scenario"
  ) {
    const scenario = scenarioCopy(data.scenario);
    validate(scenario);
    if (scenario.game === "full") validateFull(scenario);
    return { scenario, result: null };
  }
  if (data?.schema === 1) {
    const parsed = importPackage(data);
    const scenario = scenarioCopy(parsed.scenario);
    if (scenario.game === "full") validateFull(scenario);
    return { scenario, result: null };
  }
  if (
    ![2, 3, 4, 5].includes(data?.schema) ||
    data.type !== "poker-trainer-solution" ||
    !data.scenario
  )
    throw Error("Unsupported solution package");
  const scenario = scenarioCopy(data.scenario);
  // Rebuild state, check every required branch/policy, and recalculate all EVs.
  // A file's ready flag, gap, equity or scores are never trusted.
  const result = evaluateFull(
    convertFull(data.tree, scenario, { portable: true }),
    scenario,
  );
  result.engine = "Imported baseline · independently evaluated full streets";
  return { scenario, result };
}

export function remodelSolution(result, scenario) {
  validateFull(scenario);
  if (
    modelBasis(result.scenario) !== modelBasis(scenario) ||
    result.scenario.iterations !== scenario.iterations
  )
    throw Error("These settings require a new baseline solve");
  const pack = solutionPackage(result);
  pack.scenario = scenario;
  const restored = restorePackage(pack);
  restored.result.engine = result.engine;
  return restored;
}
