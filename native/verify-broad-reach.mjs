// Run benchmark-reach.mjs first to generate the deterministic 96-hand inputs.
// Reuse preserves the measured native timing without starting another solve.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { run } from "./adapter.mjs";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { estimateFullResources } from "../app/full-resources.js";
import { FullSession } from "../app/full-session.js";
import { modelBasis } from "../app/full-model.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const study = path.join(root, ".native/reach-benchmark");
const { scenario: input } = JSON.parse(
  await readFile(path.join(study, "synthetic96.json"), "utf8"),
);
const scenario = {
  ...input,
  name: "Native 96-hand full-street feasibility",
  iterations: 500,
  fullTendencies: {
    classes: Object.fromEntries(
      Array.from({ length: 9 }, (_, c) => [c, { bet: -0.5, call: 0.5 }]),
    ),
  },
};
const estimate = estimateFullResources(scenario);
assert.ok(estimate.withinNodeBudget && estimate.withinPolicyBudget);
console.log(JSON.stringify({ estimate, freeGiB: os.freemem() / 2 ** 30 }));
const controller = new AbortController();
let lowestFreeBytes = os.freemem();
const monitor = setInterval(() => {
  lowestFreeBytes = Math.min(lowestFreeBytes, os.freemem());
  if (lowestFreeBytes < 512 * 1024 * 1024) controller.abort();
}, 1000);
const reuse = process.argv.includes("--reuse");
let profile;
try {
  profile = reuse
    ? JSON.parse(await readFile(path.join(study, "native96-raw.json"), "utf8"))
    : await run(scenario, controller.signal, {
        onProgress: (progress) => console.log(JSON.stringify({ progress })),
      });
  if (reuse) assert.equal(modelBasis(profile.scenario), modelBasis(scenario));
} finally {
  clearInterval(monitor);
}
// Retain the expensive native result before any independent validation so a
// failed assertion never requires rerunning the solver to investigate.
await writeFile(
  path.join(study, "native96-raw.json"),
  JSON.stringify({
    scenario,
    raw: profile.raw,
    wallMs: profile.wallMs,
    reportedPercent: profile.reportedPercent,
  }),
);
const started = performance.now();
const result = evaluateFull(convertFull(profile.raw, scenario), scenario);
const evaluationMs = performance.now() - started;
assert.equal(result.nodes, estimate.nodes);
const nativeGap = (profile.reportedPercent * scenario.pot) / 50;
assert.ok(
  Math.abs(result.gap - nativeGap) < 0.0001,
  `${result.gap} differs from native ${nativeGap}`,
);
const pkg = solutionPackage(result),
  serialized = JSON.stringify(pkg);
await writeFile(path.join(root, ".native/broad96-scenario.json"), serialized);
const restored = restorePackage(pkg).result;
assert.equal(restored.modelEV, result.modelEV);
assert.equal(restored.gap, result.gap);
let seed = 971,
  decisions = 0;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const streets = new Set();
for (let i = 0; i < 200; i++) {
  const hand = new FullSession(restored, null, rng);
  for (let steps = 0; !hand.finished; steps++) {
    assert.ok(steps < 60);
    if (hand.node.type === "action" && hand.node.player === 0) {
      streets.add(hand.node.board.length);
      hand.choose(Math.floor(rng() * hand.node.actions.length));
    } else hand.advance();
  }
  for (const decision of hand.decisions) {
    assert.ok(Number.isFinite(decision.loss));
    decisions++;
  }
}
assert.deepEqual([...streets].sort(), [3, 4, 5]);
const report = {
  scenario,
  estimate,
  nativeMs: profile.wallMs,
  nativeRunReused: reuse,
  evaluationMs,
  nativeGap,
  gap: result.gap,
  packageBytes: Buffer.byteLength(serialized),
  trainedHands: 200,
  decisions,
  streets: [...streets].sort(),
  lowestFreeBytes,
  memoryAtCompletion: process.memoryUsage(),
  qualification:
    "Windows 96-by-96 verification through production validation, evaluation, export/import and training. Reused native timing belongs to the saved original solve, not this validation run. Lowest system free memory and completion snapshots are not process peaks or representative 8 GB certification. The minimal check/all-in tree does not demonstrate broad-range raise trees or ordinary stack depths.",
};
await writeFile(
  path.join(root, "docs/benchmarks/broad-reach.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
