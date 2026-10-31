import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { matrixRows, matrixTransfers } from "../app/full-matrix.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRevision = "481ec0b10fd4933dba62caa70855db5b7ae259ea";
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v?.values instanceof Float64Array ? matrixRows(v) : v,
  );
const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
if (process.argv[2] === "--child") {
  const module = await import(pathToFileURL(process.argv[3]));
  global.gc();
  const before = process.memoryUsage();
  async function loadAndEvaluate() {
    const fixture = JSON.parse(await readFile(process.argv[4], "utf8"));
    const started = performance.now();
    const converted = module.convertFull(fixture.tree, fixture.scenario, {
      portable: true,
    });
    const result = module.evaluateFull(converted, fixture.scenario);
    return { result, elapsedMs: performance.now() - started };
  }
  const { result, elapsedMs } = await loadAndEvaluate();
  globalThis.retainedSolution = result;
  await new Promise(setImmediate);
  global.gc();
  await new Promise(setImmediate);
  global.gc();
  const after = process.memoryUsage();
  const retainedBytes =
    after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers;
  const digest = hash(result);
  const transfers = matrixTransfers(result.root);
  const moved = structuredClone(result, { transfer: transfers });
  assert.equal(
    hash(moved),
    digest,
    "Worker transfer preserves every result value",
  );
  console.log(
    JSON.stringify({
      elapsedMs,
      retainedBytes,
      before,
      after,
      digest,
      transferredBuffers: transfers.length,
      nodes: moved.nodes,
      gap: moved.gap,
    }),
  );
} else {
  const baseline = path.join(root, ".native/matrix-before");
  await mkdir(baseline, { recursive: true });
  for (const file of ["full-game.js", "full-reach.js"]) {
    const old = spawnSync("git", ["show", `${baselineRevision}:app/${file}`], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    if (old.status !== 0) throw Error(old.stderr);
    await writeFile(
      path.join(baseline, file),
      old.stdout
        .replaceAll('from "./', 'from "../../app/')
        .replace('from "../../app/full-reach.js"', 'from "./full-reach.js"'),
    );
  }
  const rows = [];
  const fixtures = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [".native/expanded-ranges.json", ".native/broad96-scenario.json"];
  for (const fixture of fixtures) {
    const runs = { before: [], after: [] };
    for (let round = 0; round < 3; round++)
      for (const mode of round % 2
        ? ["after", "before"]
        : ["before", "after"]) {
        const proc = spawnSync(
          process.execPath,
          [
            "--expose-gc",
            fileURLToPath(import.meta.url),
            "--child",
            path.join(
              mode === "before" ? baseline : path.join(root, "app"),
              "full-game.js",
            ),
            path.resolve(root, fixture),
          ],
          {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
        );
        if (proc.status !== 0) throw Error(proc.stderr || proc.stdout);
        const run = JSON.parse(proc.stdout);
        runs[mode].push(run);
        assert.equal(
          run.digest,
          runs.before[0].digest,
          "All policies, EVs, menus and result metadata remain bit-identical after unpacking rows",
        );
        console.log(JSON.stringify({ fixture, mode, round, ...run }));
      }
    const median = (mode, field) =>
      runs[mode].map((r) => r[field]).sort((a, b) => a - b)[1];
    rows.push({
      fixture,
      beforeMedianMs: median("before", "elapsedMs"),
      afterMedianMs: median("after", "elapsedMs"),
      beforeRetainedBytes: median("before", "retainedBytes"),
      afterRetainedBytes: median("after", "retainedBytes"),
      runs,
    });
  }
  await writeFile(
    path.join(root, "docs/benchmarks/compact-matrices.json"),
    JSON.stringify(
      {
        baselineRevision,
        node: process.version,
        platform: process.platform,
        cpu: os.cpus()[0].model,
        method:
          "Three fresh-process conversion/evaluation runs per version, alternating order. Input packages and temporary conversion wrapper released before GC. Retained bytes are heapUsed plus arrayBuffers growth while keeping the evaluated result alive, not peak RSS or an 8 GB guarantee. Unpacking compact matrices gives identical result hashes; structured worker-style transfer also preserves the hashes.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
}
