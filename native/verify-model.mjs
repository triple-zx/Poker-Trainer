// Reuses a saved native fixture; deliberately never starts a C++ solve.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  restorePackage,
  remodelSolution,
  solutionPackage,
} from "../app/solution-package.js";
import {
  actionKey,
  childPath,
  editFullModel,
  modelLocks,
} from "../app/full-model.js";
import { FullSession } from "../app/full-session.js";
const file = process.argv[2] || ".native/full-sized-scenario.json";
const baseline = restorePackage(
  JSON.parse(await readFile(file, "utf8")),
).result;
const found = new Map();
function find(node, path = "root") {
  if (node.type === "terminal" || found.size === 6) return;
  if (node.type === "action" && node.player === 1) {
    for (const kind of ["BET", "RAISE"]) {
      const index = node.actions.findIndex((a) => a.kind === kind);
      const key = node.board.length + ":" + kind;
      if (index >= 0 && !found.has(key)) found.set(key, { path, index, node });
    }
  }
  for (const [choice, child] of Object.entries(node.children))
    find(child, childPath(path, node, choice));
}
find(baseline.root);
assert.equal(found.size, 6, "Bets and raises on every street");
let scenario = baseline.scenario;
for (const { path, index, node } of found.values()) {
  scenario = editFullModel(
    scenario,
    path,
    "QcQd",
    Object.fromEntries(
      node.actions.map((a, i) => [actionKey(a), +(i === index)]),
    ),
  );
}
const started = performance.now();
const result = remodelSolution(baseline, scenario).result;
const elapsedMs = performance.now() - started;
assert.equal(result.gap, baseline.gap);
const locks = modelLocks(result.root, scenario);
let verified = 0;
function inspect(node) {
  if (node.type === "terminal") return;
  if (locks.has(node)) {
    assert.deepEqual(node.model[0], locks.get(node).get(0));
    verified++;
  }
  Object.values(node.children).forEach(inspect);
}
inspect(result.root);
assert.equal(verified, 6);
assert.equal(
  restorePackage(solutionPackage(result)).result.modelEV,
  result.modelEV,
);
let seed = 61,
  decisions = 0;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 100; i++) {
  const session = new FullSession(result, null, rng);
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
  editedDecisions: verified,
  streets: ["flop", "turn", "river"],
  kinds: ["BET", "RAISE"],
  gap: result.gap,
  baselineModelEV: baseline.modelEV,
  editedModelEV: result.modelEV,
  updateWallMs: elapsedMs,
  nativeSolves: 0,
  hands: 100,
  decisions,
};
await writeFile(
  "docs/benchmarks/full-model.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
