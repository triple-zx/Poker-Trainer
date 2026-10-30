// Reuse an existing native solution; this check never starts the C++ solver.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { handFeatures } from "../app/analytics.js";
import { validateFull } from "../app/full-game.js";
import { FullSession } from "../app/full-session.js";
import {
  restorePackage,
  remodelSolution,
  solutionPackage,
} from "../app/solution-package.js";

const baseline = restorePackage(
  JSON.parse(
    await readFile(
      process.argv[2] || ".native/full-sized-scenario.json",
      "utf8",
    ),
  ),
).result;
const scenario = {
  ...baseline.scenario,
  tendency: 0,
  overrides: {},
  fullTendencies: { bluff: -1, raise: -1, classes: { 1: { bet: 1 } } },
};
delete scenario.fullModel;
const started = performance.now();
const result = remodelSolution(baseline, scenario).result;
const updateWallMs = performance.now() - started;
assert.equal(result.gap, baseline.gap);
const game = validateFull(scenario),
  checked = [0, 0, 0],
  changed = [0, 0, 0];
function inspect(node) {
  if (node.type === "terminal") return;
  if (node.type === "action" && node.player === 1) {
    node.model.forEach((row, h) => {
      if (!row) return;
      const street = node.board.length - 3;
      checked[street]++;
      assert.ok(row.every((p) => Number.isFinite(p) && p >= 0 && p <= 1));
      assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-10);
      if (row.some((p, a) => Math.abs(p - node.policy[h][a]) > 1e-10))
        changed[street]++;
      const category = handFeatures(game.villain[h].cards, node.board).category;
      // All raising is removed by one of the two global controls. Calling is
      // neutral here, so no later probability adjustment can reinstate raises.
      node.actions.forEach((a, i) => {
        if (a.kind === "RAISE" || (a.kind === "BET" && category === 0))
          assert.equal(row[i], 0);
        if (a.kind === "CHECK" && category === 1) assert.equal(row[i], 0);
      });
    });
  }
  Object.values(node.children).forEach(inspect);
}
inspect(result.root);
assert.ok(
  changed.every((n) => n > 0),
  "The model changes all three streets",
);
const pack = solutionPackage(result);
assert.equal(pack.schema, 4);
const restored = restorePackage(pack).result;
assert.equal(restored.modelEV, result.modelEV);
assert.deepEqual(restored.scenario.fullTendencies, scenario.fullTendencies);
let seed = 73,
  decisions = 0;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 100; i++) {
  const session = new FullSession(restored, null, rng);
  for (let step = 0; !session.finished; step++) {
    assert.ok(step < 60);
    if (session.node.type === "action" && session.node.player === 0)
      session.choose(Math.floor(rng() * session.node.actions.length));
    else session.advance();
  }
  session.decisions.forEach((d) =>
    assert.ok(Number.isFinite(d.loss) && d.loss >= 0),
  );
  decisions += session.decisions.length;
}
const report = {
  nodes: result.nodes,
  streets: ["flop", "turn", "river"],
  checkedOpponentRows: checked,
  changedOpponentRows: changed,
  gap: result.gap,
  baselineModelEV: baseline.modelEV,
  modeledEV: result.modelEV,
  updateWallMs,
  nativeSolves: 0,
  packageSchema: pack.schema,
  hands: 100,
  decisions,
};
await writeFile(
  "docs/benchmarks/opponent-tendencies.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
