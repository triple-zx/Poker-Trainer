import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { DEFAULT } from "../app/engine.js";
import { rangeDocument, rangeForFlop } from "../app/preflop-ranges.js";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { FullSession } from "../app/full-session.js";
import { run } from "./adapter.mjs";

const source = rangeDocument({
  type: "poker-trainer-range",
  schema: 1,
  name: "Native range provenance verification",
  range: "AsKs:.5,AhKh:.75,AdKd:.5,AcKc:.5",
  originalRange: "AKs:.5",
  context: {
    tableFormat: "6max",
    position: "BTN",
    opponentPosition: "BB",
    stackBB: 100,
    history: "BTN opens; BB calls",
  },
  source: {
    label: "Original synthetic study model",
    notes:
      "Suit-weight/provenance regression; no equilibrium claim for the input range",
  },
});
const applied = rangeForFlop(source, "As7d2c", 4);
assert.equal(applied.count, 3);
assert.equal(applied.blocked, 1);
const scenario = {
  ...DEFAULT,
  name: "Range library · native verification",
  game: "full",
  flop: "As7d2c",
  hero: applied.text,
  villain: "QcQd",
  pot: 4,
  stack: 1,
  iterations: 1000,
  rangeOrigins: { hero: source },
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((k) => [k, { bet: [25], raise: [100] }]),
  ),
};
const profile = await run(scenario);
const result = evaluateFull(convertFull(profile.raw, scenario), scenario);
assert.ok(result.gap < 0.001);
const pkg = solutionPackage(result);
assert.equal(pkg.schema, 5);
const restored = restorePackage(JSON.parse(JSON.stringify(pkg))).result;
assert.deepEqual(restored.scenario.rangeOrigins, scenario.rangeOrigins);
assert.equal(restored.gap, result.gap);
assert.equal(restored.modelEV, result.modelEV);
let seed = 9742,
  decisions = 0;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 100; i++) {
  const hand = new FullSession(restored, null, rng);
  for (let step = 0; !hand.finished; step++) {
    assert.ok(step < 60);
    if (hand.node.type === "action" && hand.node.player === 0)
      hand.choose(Math.floor(rng() * hand.node.actions.length));
    else hand.advance();
  }
  for (const d of hand.decisions)
    assert.ok(Number.isFinite(d.loss) && d.loss >= 0);
  decisions += hand.decisions.length;
}
const report = {
  nodes: result.nodes,
  combinations: applied.count,
  blocked: applied.blocked,
  schema: pkg.schema,
  gap: result.gap,
  nativeWallMs: profile.wallMs,
  hands: 100,
  decisions,
  provenanceRoundTrip: true,
};
await writeFile(
  "docs/benchmarks/range-library.json",
  JSON.stringify(report, null, 2) + "\n",
);
await mkdir(".native", { recursive: true });
await writeFile(".native/range-library-v5.json", JSON.stringify(pkg));
console.log(JSON.stringify(report));
