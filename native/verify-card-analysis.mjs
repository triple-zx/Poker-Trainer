// Analyze existing native fixtures without starting another solve.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { restorePackage } from "../app/solution-package.js";
import { compareNextCards } from "../app/full-card-analysis.js";
import { analyzeNode, nodeReach } from "../app/full-node-analysis.js";
import { childPath } from "../app/full-model.js";

const reports = [];
for (const file of [
  ".native/full-sized-scenario.json",
  ".native/full-hand-ip-v3.json",
]) {
  const result = restorePackage(
    JSON.parse(await readFile(file, "utf8")),
  ).result;
  for (const profile of ["baseline", "model"]) {
    const found = new Map();
    function find(node, path = "root") {
      if (node.type === "terminal" || found.size === 2) return;
      if (
        node.type === "chance" &&
        !found.has(node.board.length) &&
        nodeReach(result, path, profile).reachable
      )
        found.set(node.board.length, path);
      for (const [choice, child] of Object.entries(node.children))
        find(child, childPath(path, node, choice));
    }
    find(result.root);
    assert.equal(found.size, 2);
    for (const [boardLength, path] of found) {
      const cache = new Map(),
        started = performance.now();
      const report = compareNextCards(result, path, profile, cache);
      const elapsedMs = performance.now() - started;
      const parent = analyzeNode(result, path, profile, cache);
      assert.ok(Math.abs(report.probabilityMass - 1) < 1e-10);
      assert.ok(
        Math.abs(report.weighted.hero.equity - parent.hero.equity) < 1e-10,
      );
      assert.ok(
        Math.abs(
          report.weighted.actions.reduce((sum, a) => sum + a.frequency, 0) - 1,
        ) < 1e-10,
      );
      assert.equal(
        report.player,
        result.scenario.heroPosition === "ip" ? 1 : 0,
      );
      reports.push({
        file,
        profile,
        path,
        street: boardLength === 3 ? "turn" : "river",
        cards: report.rows.length,
        positiveCards: report.positiveCards,
        probabilityMass: report.probabilityMass,
        heroEquity: report.weighted.hero.equity,
        comparisonWallMs: elapsedMs,
      });
    }
  }
}
const output = { nativeSolves: 0, reports };
await writeFile(
  "docs/benchmarks/card-analysis.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output));
