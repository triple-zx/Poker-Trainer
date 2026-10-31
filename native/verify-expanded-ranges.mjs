import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEFAULT, validate } from "../app/engine.js";
import { rangeDocument, rangeForFlop } from "../app/preflop-ranges.js";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { estimateFullResources } from "../app/full-resources.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { FullSession } from "../app/full-session.js";
import { modelBasis } from "../app/full-model.js";
import { run } from "./adapter.mjs";
const hero = rangeDocument({
  type: "poker-trainer-range",
  schema: 1,
  name: "Broadway suited study",
  range: "AKs:.75,AQs:.5,KQs:.25",
  source: {
    label: "Original synthetic study fixture",
    notes: "Not a GTO preflop recommendation",
  },
});
const villain = rangeDocument({
  type: "poker-trainer-range",
  schema: 1,
  name: "Pocket pair study",
  range: "QQ:.6,JJ:.4",
  source: { label: "Original synthetic study fixture" },
});
const flop = "7c6d2h";
const scenario = {
  ...DEFAULT,
  name: "Twelve-combination full-hand verification",
  game: "full",
  engine: "native",
  flop,
  hero: rangeForFlop(hero, flop, 12).text,
  villain: rangeForFlop(villain, flop, 12).text,
  rangeOrigins: { hero, villain },
  pot: 4,
  stack: 3,
  iterations: 500,
  fullTendencies: {
    classes: Object.fromEntries(
      Array.from({ length: 9 }, (_, category) => [
        category,
        { bet: -0.5, raise: -0.5, call: 0.5 },
      ]),
    ),
  },
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((street) => [
      street,
      { bet: [50], raise: [100] },
    ]),
  ),
};
const g = validate(scenario);
assert.equal(g.hero.length, 12);
assert.equal(g.villain.length, 12);
const estimate = estimateFullResources(scenario);
console.log(
  JSON.stringify({
    heroCombos: g.hero.length,
    villainCombos: g.villain.length,
    pairs: g.pairs.length,
    estimate,
  }),
);
const reuse = process.argv.includes("--reuse");
const saved = reuse
  ? JSON.parse(await readFile(".native/expanded-ranges.json", "utf8"))
  : null;
if (saved)
  assert.equal(
    modelBasis(saved.scenario),
    modelBasis(scenario),
    "Reused solution must have the same native game",
  );
const profile = reuse ? null : await run(scenario);
const started = performance.now();
const result = evaluateFull(
  convertFull(reuse ? saved.tree : profile.raw, scenario, { portable: reuse }),
  scenario,
);
const evaluationMs = performance.now() - started;
assert.equal(result.nodes, estimate.nodes);
if (profile)
  assert.ok(
    Math.abs(result.gap - (profile.reportedPercent * scenario.pot) / 50) <
      0.0001,
  );
await mkdir(".native", { recursive: true });
const pkg = solutionPackage(result);
await writeFile(".native/expanded-ranges.json", JSON.stringify(pkg));
const restored = restorePackage(pkg).result;
assert.equal(restored.gap, result.gap);
assert.equal(restored.modelEV, result.modelEV);
let seed = 3922,
  decisions = 0;
const streets = new Set();
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let handNumber = 0; handNumber < 200; handNumber++) {
  const hand = new FullSession(restored, null, rng);
  for (let step = 0; !hand.finished; step++) {
    assert.ok(step < 60);
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
  schema: 1,
  scenario,
  pairs: g.pairs.length,
  nodes: result.nodes,
  nativeRunReused: reuse,
  nativeMs: profile?.wallMs ?? null,
  evaluationMs,
  gap: result.gap,
  nativeGap: profile ? (profile.reportedPercent * scenario.pot) / 50 : null,
  packageBytes: Buffer.byteLength(JSON.stringify(pkg)),
  processMemoryAtCompletion: process.memoryUsage(),
  trainedHands: 200,
  decisions,
  streets: [...streets].sort(),
};
await writeFile(
  "docs/benchmarks/expanded-ranges.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    nativeRunReused: reuse,
    nodes: report.nodes,
    gap: report.gap,
    evaluationMs,
    trainedHands: report.trainedHands,
    decisions,
    streets: report.streets,
    packageBytes: report.packageBytes,
  }),
);
