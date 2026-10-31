import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRevision = "e7b3119940f0cce7b8e115a2ba2a517b05ea1abe";
const comparisonRevision = "66f2807f9f66609c3f9c78c5021b0c54c67b7f90";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
if (process.argv[2] === "--child") {
  const module = await import(pathToFileURL(process.argv[4]));
  if (process.argv[3] === "coverage") {
    const { parsePreflopRange, RANGE_TEMPLATES } = await import(
      "../app/preflop-ranges.js"
    );
    const { cards } = await import("../app/engine.js");
    const board = cards("7c6d2h");
    const legal = parsePreflopRange(RANGE_TEMPLATES[0].range).filter(
      (h) => !h.cards.some((c) => board.includes(c)),
    );
    // Spread hands through the canonical range so small workloads do not all
    // share one card and accidentally contain no compatible private deals.
    const count = Number(process.argv[5]);
    const hands = Array.from(
      { length: count },
      (_, i) => legal[Math.floor((i * legal.length) / count)],
    );
    const pairs = [];
    hands.forEach((h, i) =>
      hands.forEach((v, j) => {
        if (!h.cards.some((c) => v.cards.includes(c)))
          pairs.push({ i, j, weight: 1 });
      }),
    );
    assert.ok(pairs.length > 0, "Coverage benchmark needs compatible deals");
    global.gc();
    const before = process.memoryUsage();
    const context = module.fullCardContext({
      board,
      hero: hands,
      villain: hands,
      pairs,
    });
    globalThis.coverageKeepAlive = context;
    const start = performance.now();
    let rows = [];
    const add = (b) => {
      const x = context.coverage(b);
      rows.push([
        x.pairCount ?? x.pairIndices.length,
        ...x.actors.map((s) => [...s].sort((a, b) => a - b)),
      ]);
    };
    add(board);
    for (let turn = 0; turn < 52; turn++) {
      if (board.includes(turn)) continue;
      add([...board, turn]);
      for (let river = turn + 1; river < 52; river++)
        if (!board.includes(river)) add([...board, turn, river]);
    }
    const elapsedMs = performance.now() - start;
    const boards = rows.length,
      digest = hash(rows);
    rows = null;
    global.gc();
    const after = process.memoryUsage();
    console.log(
      JSON.stringify({
        combos: hands.length,
        pairs: pairs.length,
        boards,
        elapsedMs,
        heapDelta: after.heapUsed - before.heapUsed,
        before,
        after,
        digest,
      }),
    );
  } else {
    const fixture = JSON.parse(await readFile(process.argv[5], "utf8"));
    const result = module.evaluateFull(
      module.convertFull(fixture.tree, fixture.scenario, { portable: true }),
      fixture.scenario,
    );
    console.log(
      JSON.stringify({
        nodes: result.nodes,
        gap: result.gap,
        digest: hash(result),
      }),
    );
  }
} else {
  const directory = path.join(root, ".native/coverage-baseline");
  await mkdir(directory, { recursive: true });
  for (const file of ["full-game.js", "full-cards.js"]) {
    const original = spawnSync(
      "git",
      ["show", `${baselineRevision}:app/${file}`],
      { cwd: root, encoding: "utf8", windowsHide: true },
    );
    if (original.status !== 0) throw Error(original.stderr);
    const source = original.stdout
      .replaceAll('from "./', 'from "../../app/')
      .replace('from "../../app/full-cards.js"', 'from "./full-cards.js"');
    await writeFile(path.join(directory, file), source);
  }
  // Keep the historical bit-identical evaluation comparison isolated from
  // later changes to evaluation summation order (see benchmark-reach.mjs).
  const comparison = path.join(root, ".native/coverage-comparison");
  await mkdir(comparison, { recursive: true });
  const version = spawnSync(
    "git",
    ["show", `${comparisonRevision}:app/full-game.js`],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (version.status !== 0) throw Error(version.stderr);
  await writeFile(
    path.join(comparison, "full-game.js"),
    version.stdout.replaceAll('from "./', 'from "../../app/'),
  );
  function child(task, mode, arg) {
    const file = task === "coverage" ? "full-cards.js" : "full-game.js";
    const proc = spawnSync(
      process.execPath,
      [
        "--expose-gc",
        fileURLToPath(import.meta.url),
        "--child",
        task,
        path.join(
          mode === "before"
            ? directory
            : task === "result"
              ? comparison
              : path.join(root, "app"),
          file,
        ),
        String(arg),
      ],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    if (proc.status !== 0) throw Error(proc.stderr || proc.stdout);
    return JSON.parse(proc.stdout);
  }
  const coverage = [];
  for (const combos of [12, 96]) {
    const runs = { before: [], after: [] };
    for (let round = 0; round < 3; round++)
      for (const mode of round % 2 ? ["after", "before"] : ["before", "after"])
        runs[mode].push(child("coverage", mode, combos));
    for (const run of [...runs.before, ...runs.after])
      assert.equal(run.digest, runs.before[0].digest);
    const median = (mode, key) =>
      runs[mode].map((r) => r[key]).sort((a, b) => a - b)[1];
    const row = {
      combos,
      beforeMedianMs: median("before", "elapsedMs"),
      afterMedianMs: median("after", "elapsedMs"),
      beforeMedianHeapDelta: median("before", "heapDelta"),
      afterMedianHeapDelta: median("after", "heapDelta"),
      runs,
    };
    coverage.push(row);
    console.log(
      JSON.stringify({
        combos,
        beforeMs: row.beforeMedianMs,
        afterMs: row.afterMedianMs,
        beforeHeap: row.beforeMedianHeapDelta,
        afterHeap: row.afterMedianHeapDelta,
      }),
    );
  }
  const results = [];
  for (const fixture of [
    ".native/full-sized-scenario.json",
    ".native/expanded-ranges.json",
  ]) {
    const before = child("result", "before", fixture),
      after = child("result", "after", fixture);
    assert.equal(after.digest, before.digest);
    results.push({ fixture, before, after });
    console.log(JSON.stringify({ fixture, exactResultEquality: true }));
  }
  // Feasibility only: copied modules relax the range-count cap, with all
  // production files and node/probability guards unchanged. No solve runs.
  const study = path.join(root, ".native/coverage-study-app");
  await mkdir(study, { recursive: true });
  for (const file of await readdir(path.join(root, "app")))
    if (file.endsWith(".js"))
      await copyFile(path.join(root, "app", file), path.join(study, file));
  const limits = await readFile(path.join(study, "limits.js"), "utf8");
  await writeFile(
    path.join(study, "limits.js"),
    limits.replace(/FULL_COMBO_LIMIT = \d+/, "FULL_COMBO_LIMIT = 1326"),
  );
  const { estimateFullResources } = await import(
    pathToFileURL(path.join(study, "full-resources.js"))
  );
  const { parsePreflopRange, rangeText, RANGE_TEMPLATES } = await import(
    pathToFileURL(path.join(study, "preflop-ranges.js"))
  );
  const { DEFAULT, cards } = await import(
    pathToFileURL(path.join(study, "engine.js"))
  );
  const corpus = JSON.parse(
    (
      await readFile(".native/preflop-source-review/range-inputs.json", "utf8")
    ).replace(/^\uFEFF/, ""),
  );
  const cases = [
    {
      name: "Complete mathematical ranges",
      hero: RANGE_TEMPLATES[0].range,
      villain: RANGE_TEMPLATES[0].range,
    },
    {
      name: "ART/GTO UTG RFI and BB call inputs",
      hero: corpus.find(
        (r) => r.name === "artgto-viewer/ranges/utg/UTG_RFI.txt",
      ).text,
      villain: corpus.find(
        (r) => r.name === "artgto-viewer/ranges/bb/BB_call_vs_UTG_RFI.txt",
      ).text,
    },
  ];
  const feasibility = [];
  for (const item of cases) {
    const board = cards("7c6d2h"),
      unblocked = (text) =>
        parsePreflopRange(text).filter(
          (h) => !h.cards.some((c) => board.includes(c)),
        );
    const hero = unblocked(item.hero),
      villain = unblocked(item.villain);
    const scenario = {
      ...DEFAULT,
      game: "full",
      flop: "7c6d2h",
      hero: rangeText(hero),
      villain: rangeText(villain),
      pot: 4,
      stack: 1,
      betting: Object.fromEntries(
        ["flop", "turn", "river"].map((k) => [k, { bet: [25], raise: [100] }]),
      ),
    };
    const start = performance.now(),
      estimate = estimateFullResources(scenario);
    feasibility.push({
      name: item.name,
      heroCombos: hero.length,
      villainCombos: villain.length,
      preflightMs: performance.now() - start,
      estimate,
    });
  }
  const report = {
    baselineRevision,
    comparisonRevision,
    node: process.version,
    platform: process.platform,
    cpu: os.cpus()[0].model,
    method:
      "Three fresh-process coverage runs per version, alternating order; identical ranges and every unordered public runout. Heap deltas after GC retain the coverage cache; they are not peak RAM. Complete result hashes verify both existing solved fixtures. Feasibility uses an isolated cap-only-relaxed module copy, no native solve, and a hypothetical pot 4 bb / remaining stack 1 bb minimal all-in tree, not the source preflop game's stack/rake assumptions.",
    coverage,
    results,
    feasibility,
  };
  await writeFile(
    "docs/benchmarks/card-coverage.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ feasibility }));
}
