// Compare preflight against saved native solution trees. No solver is started.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { estimateFullResources } from "../app/full-resources.js";
const files = process.argv.slice(2);
if (!files.length)
  files.push(
    ".native/full-sized-scenario.json",
    ".native/full-hand-ip-v3.json",
  );
const reports = [];
for (const file of files) {
  const pack = JSON.parse(await readFile(file, "utf8"));
  assert.equal(pack.type, "poker-trainer-solution");
  const started = performance.now();
  const estimate = estimateFullResources(pack.scenario);
  const preflightMs = performance.now() - started;
  const byStreet = [0, 0, 0];
  let policyValues = 0;
  function count(node, street = 0) {
    byStreet[street]++;
    if (node === null) return; // Portable packages encode terminal leaves as null.
    if (node.type === "action") {
      policyValues += node.policy.reduce(
        (sum, row) => sum + (row?.length || 0),
        0,
      );
      node.children.forEach((child) => count(child, street));
    } else if (node.type === "chance")
      Object.values(node.children).forEach((child) => count(child, street + 1));
  }
  count(pack.tree);
  assert.deepEqual(estimate.byStreet, byStreet);
  assert.equal(estimate.policyValues, policyValues);
  reports.push({
    file,
    nativeSolves: 0,
    preflightMs,
    estimate,
    observed: { byStreet, policyValues },
  });
}
await writeFile(
  "docs/benchmarks/resource-preflight.json",
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(JSON.stringify(reports, null, 2));
