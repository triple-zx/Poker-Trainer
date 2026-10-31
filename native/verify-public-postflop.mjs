// Feasibility only: copied modules raise hand/probability caps. Production
// admission limits remain unchanged. Public source values stay in .native.
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  study = path.join(root, ".native/compact-study");
await mkdir(path.join(study, "app"), { recursive: true });
for (const file of await readdir(path.join(root, "app")))
  if (file.endsWith(".js"))
    await copyFile(path.join(root, "app", file), path.join(study, "app", file));
const limitsFile = path.join(study, "app/limits.js");
await writeFile(
  limitsFile,
  (await readFile(limitsFile, "utf8"))
    .replace(/FULL_COMBO_LIMIT = \d+/, "FULL_COMBO_LIMIT = 1326")
    .replace(
      /FULL_POLICY_VALUE_LIMIT = \d+/,
      "FULL_POLICY_VALUE_LIMIT = 12000000",
    ),
);
await writeFile(
  path.join(study, "adapter.mjs"),
  (await readFile(path.join(root, "native/adapter.mjs"), "utf8"))
    .replaceAll('from "../app/', 'from "./app/')
    .replace(
      'from "./checkpoint-job.mjs"',
      'from "../../native/checkpoint-job.mjs"',
    ),
);
process.env.TEXASSOLVER_BIN = path.join(
  root,
  ".native/TexasSolver/trainer-build",
  process.platform === "win32" ? "console_solver.exe" : "console_solver",
);
process.env.TEXASSOLVER_RESOURCES = path.join(
  root,
  ".native/TexasSolver/resources",
);
const { run } = await import(pathToFileURL(path.join(study, "adapter.mjs")));
const { DEFAULT, cards } = await import(
  pathToFileURL(path.join(study, "app/engine.js"))
);
const { parsePreflopRange, rangeText } = await import(
  pathToFileURL(path.join(study, "app/preflop-ranges.js"))
);
const { convertFull, evaluateFull } = await import(
  pathToFileURL(path.join(study, "app/full-game.js"))
);
const { estimateFullResources } = await import(
  pathToFileURL(path.join(study, "app/full-resources.js"))
);
const { solutionPackage, restorePackage } = await import(
  pathToFileURL(path.join(study, "app/solution-package.js"))
);
const { FullSession } = await import(
  pathToFileURL(path.join(study, "app/full-session.js"))
);
const { modelBasis } = await import(
  pathToFileURL(path.join(study, "app/full-model.js"))
);
const corpus = JSON.parse(
  (
    await readFile(
      path.join(root, ".native/preflop-source-review/range-inputs.json"),
      "utf8",
    )
  ).replace(/^\uFEFF/, ""),
);
const files = [
  "artgto-viewer/ranges/utg/UTG_RFI.txt",
  "artgto-viewer/ranges/bb/BB_call_vs_UTG_RFI.txt",
];
const inputs = files.map((name) => {
  const found = corpus.find((row) => row.name === name);
  assert.ok(found, name);
  return found;
});
const flop = "7c6d2h",
  board = cards(flop);
const ranges = inputs.map(({ text }) =>
  parsePreflopRange(text).filter(
    (h) => !h.cards.some((c) => board.includes(c)),
  ),
);
const scenario = {
  ...DEFAULT,
  name: "Public range inputs: minimal postflop feasibility",
  game: "full",
  heroPosition: "ip",
  flop,
  hero: rangeText(ranges[0]),
  villain: rangeText(ranges[1]),
  pot: 4,
  stack: 1,
  iterations: 500,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((s) => [s, { bet: [25], raise: [100] }]),
  ),
  fullTendencies: {
    classes: Object.fromEntries(
      Array.from({ length: 9 }, (_, c) => [c, { bet: -0.5, call: 0.5 }]),
    ),
  },
};
const estimate = estimateFullResources(scenario);
assert.ok(estimate.withinNodeBudget && estimate.withinPolicyBudget);
console.log(
  JSON.stringify({
    heroHands: ranges[0].length,
    villainHands: ranges[1].length,
    estimate,
    freeGiB: os.freemem() / 2 ** 30,
  }),
);
const reuse = process.argv.includes("--reuse"),
  rawPath = path.join(study, "native-raw.json");
let profile;
if (reuse) {
  profile = JSON.parse(await readFile(rawPath, "utf8"));
  assert.equal(modelBasis(profile.scenario), modelBasis(scenario));
} else {
  const controller = new AbortController();
  const monitor = setInterval(() => {
    if (os.freemem() < 512 * 1024 * 1024) controller.abort();
  }, 1000);
  try {
    profile = await run(scenario, controller.signal);
  } finally {
    clearInterval(monitor);
  }
  await writeFile(
    rawPath,
    JSON.stringify({
      scenario,
      raw: profile.raw,
      wallMs: profile.wallMs,
      reportedPercent: profile.reportedPercent,
    }),
  );
}
console.log(
  JSON.stringify({ nativeMs: profile.wallMs, nativeRunReused: reuse }),
);
const started = performance.now();
const result = evaluateFull(convertFull(profile.raw, scenario), scenario);
const evaluationMs = performance.now() - started;
const nativeGap = (profile.reportedPercent * scenario.pot) / 50;
assert.equal(result.nodes, estimate.nodes);
assert.ok(
  Math.abs(result.gap - nativeGap) < 0.0001,
  `${result.gap} != ${nativeGap}`,
);
const serialized = JSON.stringify(solutionPackage(result));
await writeFile(path.join(study, "solution.json"), serialized);
const restored = restorePackage(JSON.parse(serialized)).result;
assert.equal(restored.gap, result.gap);
assert.equal(restored.modelEV, result.modelEV);
let seed = 5132,
  decisions = 0;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const streets = new Set();
for (let i = 0; i < 100; i++) {
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
  inputs: inputs.map((row, i) => ({
    name: row.name,
    sha256: createHash("sha256").update(row.text).digest("hex"),
    compatibleHands: ranges[i].length,
  })),
  game: {
    flop,
    pot: scenario.pot,
    stack: scenario.stack,
    heroPosition: scenario.heroPosition,
    iterations: scenario.iterations,
    betting: scenario.betting,
  },
  estimate,
  nativeMs: profile.wallMs,
  nativeRunReused: reuse,
  evaluationMs,
  nativeGap,
  gap: result.gap,
  packageBytes: Buffer.byteLength(serialized),
  trainedHands: 100,
  decisions,
  streets: [...streets].sort(),
  memoryAtCompletion: process.memoryUsage(),
  qualification:
    "Isolated cap-relaxed minimum-tree feasibility using public preflop range inputs. This hypothetical pot 4 bb / remaining stack 1 bb postflop tree is not the source 100 bb preflop game. Source values and solution remain local and are not bundled. Memory snapshots are not process peaks or representative 8 GB qualification. Production caps are unchanged.",
};
await writeFile(
  path.join(root, "docs/benchmarks/public-postflop.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
