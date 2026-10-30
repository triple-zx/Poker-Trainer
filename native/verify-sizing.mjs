import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULT } from "../app/engine.js";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { FullSession } from "../app/full-session.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { fullCandidates } from "../app/full-sizing.js";
import { run } from "./adapter.mjs";

const scenario = {
  ...DEFAULT,
  name: "Deep sizing · native verification",
  engine: "native",
  game: "full",
  pot: 4,
  stack: 3,
  hero: "AhKh,9h8h",
  villain: "QcQd",
  iterations: 500,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((street) => [
      street,
      { bet: [50], raise: [100] },
    ]),
  ),
  fullSizing: { mode: "deep", maxBets: 1, maxRaises: 1, lossTarget: 0.01 },
};
const start = performance.now();
const profile = await run(scenario);
const result = evaluateFull(convertFull(profile.raw, scenario), scenario);
assert.ok(
  result.root.actions.some((a) => a.kind === "BET" && a.amount === 1.5),
  "Expanded 37.5% flop size exists",
);
assert.ok(
  result.root.actions.some((a) => a.kind === "BET" && a.amount === 2),
  "Original 50% flop size exists",
);
assert.ok(result.selection.value <= result.modelEV + 1e-8);
assert.ok(Number.isFinite(result.gap) && result.gap >= 0);
let decisions = 0,
  alternatives = 0;
const streets = new Set(),
  raises = new Set();
function inspect(n) {
  if (n.type === "terminal") return;
  if (n.type === "chance") {
    Object.values(n.children).forEach(inspect);
    return;
  }
  if (n.actions.some((a) => a.kind === "RAISE")) raises.add(n.board.length);
  if (n.player === 0) {
    streets.add(n.board.length);
    assert.ok(
      n.activeActions.filter((i) => n.actions[i].kind === "BET").length <= 1,
    );
    assert.ok(
      n.activeActions.filter((i) => n.actions[i].kind === "RAISE").length <= 1,
    );
    alternatives += n.actions.length - n.activeActions.length;
  }
  n.children.forEach(inspect);
}
inspect(result.root);
assert.deepEqual([...streets].sort(), [3, 4, 5]);
assert.deepEqual([...raises].sort(), [3, 4, 5]);
assert.ok(alternatives > 0);
const portable = solutionPackage(result);
const restored = restorePackage(JSON.parse(JSON.stringify(portable))).result;
assert.deepEqual(restored.selection, result.selection);
assert.deepEqual(restored.root.adjusted, result.root.adjusted);
let seed = 41;
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
  for (const d of hand.decisions) {
    assert.ok(Number.isFinite(d.loss) && d.loss >= 0);
    assert.equal(d.ev.length, d.choices.length);
  }
  decisions += hand.decisions.length;
}
const report = {
  scenario,
  candidates: fullCandidates(scenario),
  nodes: result.nodes,
  gap: result.gap,
  selection: result.selection,
  hands: 100,
  decisions,
  alternativeActions: alternatives,
  nativeWallMs: profile.wallMs,
  totalWallMs: performance.now() - start,
};
await writeFile(
  "docs/benchmarks/full-sizing.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (process.argv.includes("--export-fixture")) {
  await mkdir(".native", { recursive: true });
  await writeFile(".native/full-sized-scenario.json", JSON.stringify(portable));
}
console.log(JSON.stringify(report));
