import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRevision = "975a18353c38cc342015c4bb56e52fb16cd770bd";
// Historical compact-card-table comparison. Factored reach changes summation
// order; benchmark-reach.mjs checks the current evaluator with numeric bounds.
const comparisonRevision = "66f2807f9f66609c3f9c78c5021b0c54c67b7f90";
if (process.argv[2] === "--child") {
  const fixture = JSON.parse(await readFile(process.argv[4], "utf8"));
  const evaluator = await import(pathToFileURL(process.argv[3]));
  global.gc?.();
  const start = performance.now();
  const tree = evaluator.convertFull(fixture.tree, fixture.scenario, {
    portable: true,
  });
  const converted = performance.now();
  const result = evaluator.evaluateFull(tree, fixture.scenario);
  const finished = performance.now();
  const memoryBeforeCollection = process.memoryUsage();
  global.gc?.();
  const memoryAfterCollection = process.memoryUsage();
  const digest = createHash("sha256")
    .update(JSON.stringify(result))
    .digest("hex");
  console.log(
    JSON.stringify({
      convertMs: converted - start,
      evaluateMs: finished - converted,
      totalMs: finished - start,
      nodes: result.nodes,
      gap: result.gap,
      modelEV: result.modelEV,
      digest,
      memoryBeforeCollection,
      memoryAfterCollection,
    }),
  );
} else {
  await mkdir(path.join(root, ".native"), { recursive: true });
  const original = spawnSync(
    "git",
    ["show", `${baselineRevision}:app/full-game.js`],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (original.status !== 0)
    throw Error(original.stderr || "Cannot read comparison baseline");
  const baseline = path.join(root, ".native", "evaluation-baseline.mjs");
  // Relax only the old range-cap check so both algorithms evaluate identical
  // twelve-combination inputs. Betting, policies, precision and EV stay equal.
  await writeFile(
    baseline,
    original.stdout
      .replaceAll('from "./', 'from "../app/')
      .replace(
        "g.hero.length > 4 || g.villain.length > 4",
        "g.hero.length > 12 || g.villain.length > 12",
      ),
  );
  const fixtures = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [".native/full-sized-scenario.json", ".native/expanded-ranges.json"];
  const compact = path.join(root, ".native", "evaluation-compact.mjs");
  const version = spawnSync(
    "git",
    ["show", `${comparisonRevision}:app/full-game.js`],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (version.status !== 0) throw Error(version.stderr);
  await writeFile(
    compact,
    version.stdout.replaceAll('from "./', 'from "../app/'),
  );
  const rows = [];
  for (const fixture of fixtures) {
    const runs = { before: [], after: [] };
    for (let round = 0; round < 3; round++) {
      for (const mode of round % 2
        ? ["after", "before"]
        : ["before", "after"]) {
        const result = spawnSync(
          process.execPath,
          [
            "--expose-gc",
            fileURLToPath(import.meta.url),
            "--child",
            mode === "before" ? baseline : compact,
            path.resolve(root, fixture),
          ],
          {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
        );
        if (result.status !== 0)
          throw Error(result.stderr || "Evaluation benchmark failed");
        runs[mode].push(JSON.parse(result.stdout));
      }
    }
    const first = runs.before[0];
    for (const run of [...runs.before, ...runs.after])
      assert.equal(
        run.digest,
        first.digest,
        "Every baseline/model/EV/menu value must stay identical",
      );
    const median = (mode, field) =>
      runs[mode].map((r) => r[field]).sort((a, b) => a - b)[1];
    const row = {
      fixture,
      exactResultEquality: true,
      beforeMedianMs: median("before", "totalMs"),
      afterMedianMs: median("after", "totalMs"),
      beforeEvaluationMs: median("before", "evaluateMs"),
      afterEvaluationMs: median("after", "evaluateMs"),
      runs,
    };
    rows.push(row);
    console.log(
      JSON.stringify({
        fixture,
        beforeMs: row.beforeMedianMs,
        afterMs: row.afterMedianMs,
        exactResultEquality: true,
      }),
    );
  }
  await writeFile(
    path.join(root, "docs", "benchmarks", "range-evaluation.json"),
    JSON.stringify(
      {
        schema: 1,
        baselineRevision,
        comparisonRevision,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0].model,
        method:
          "Three fresh-process runs per algorithm and fixture, alternating order; same solved tree, policy, weights, precision and menus. Baseline cap alone relaxed to 12. Memory snapshots are not peak RAM or 8 GB qualification.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
}
