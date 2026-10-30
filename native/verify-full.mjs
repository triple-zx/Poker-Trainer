import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { DEFAULT } from "../app/engine.js";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { FullSession } from "../app/full-session.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { run } from "./adapter.mjs";

const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh",
  villain: "QcQd",
  iterations: 200,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((k) => [k, { bet: [50], raise: [100] }]),
  ),
};
const profile = await run(scenario),
  result = evaluateFull(convertFull(profile.raw, scenario), scenario);
assert.ok(result.gap < 0.001, "Full-street independent Nash gap target");
assert.ok(
  Math.abs(result.gap - (profile.reportedPercent * scenario.pot) / 50) < 0.0001,
  "Independent and native gap agreement",
);
const streets = new Set(),
  raises = new Set();
let nodes = 0;
function visit(n) {
  nodes++;
  if (n.type === "action") {
    streets.add(n.board.length);
    if (n.actions.some((a) => a.kind === "RAISE")) raises.add(n.board.length);
    if (n.player === 0)
      for (const ev of n.ev) if (ev) assert.ok(ev.every(Number.isFinite));
    n.children.forEach(visit);
  } else if (n.type === "chance") Object.values(n.children).forEach(visit);
}
visit(result.root);
assert.deepEqual([...streets].sort(), [3, 4, 5]);
assert.deepEqual([...raises].sort(), [3, 4, 5]);
const restored = restorePackage(
  JSON.parse(JSON.stringify(solutionPackage(result))),
).result;
assert.equal(restored.nodes, result.nodes);
assert.equal(restored.gap, result.gap);
assert.deepEqual(restored.root.ev, result.root.ev);
let seed = 3921;
const rng = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
let decisions = 0;
for (let i = 0; i < 100; i++) {
  const hand = new FullSession(restored, null, rng);
  for (let steps = 0; !hand.finished; steps++) {
    assert.ok(steps < 60, "Hands must terminate");
    if (hand.node.type === "action" && hand.node.player === 0)
      hand.choose(Math.floor(rng() * hand.node.actions.length));
    else hand.advance();
  }
  for (const d of hand.decisions)
    assert.ok(Number.isFinite(d.loss) && d.loss >= 0);
  decisions += hand.decisions.length;
}
// A legal missing continuation must fail before any hand can be dealt.
const raw = profile.raw,
  saved = raw.childrens.CHECK;
delete raw.childrens.CHECK;
assert.throws(() => convertFull(raw, scenario), /Missing/);
raw.childrens.CHECK = saved;
const report = {
  nodes,
  decisions,
  hands: 100,
  importedSolution: true,
  gap: result.gap,
  nativePercent: profile.reportedPercent,
  wallMs: profile.wallMs,
};
console.log(JSON.stringify(report));
await writeFile(
  "docs/benchmarks/full-hand.json",
  JSON.stringify(report, null, 2) + "\n",
);
