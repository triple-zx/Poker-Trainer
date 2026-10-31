import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRevision = "66f2807f9f66609c3f9c78c5021b0c54c67b7f90";
// Historical reach comparison. Current storage is checked after unpacking by
// benchmark-matrices.mjs, including bit-identical result hashes and transfers.
const comparisonRevision = "481ec0b10fd4933dba62caa70855db5b7ae259ea";
const work = path.join(root, ".native/reach-benchmark");
if (process.argv[2] === "--child") {
  const [mode, moduleFile, fixtureFile, oracleFile] = process.argv.slice(3);
  const fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
  const module = await import(pathToFileURL(moduleFile));
  const tree = module.convertFull(fixture.tree, fixture.scenario, {
    portable: true,
  });
  global.gc();
  const started = performance.now();
  const result = module.evaluateFull(tree, fixture.scenario);
  const evaluateMs = performance.now() - started;
  const memory = process.memoryUsage();
  let numbers = 0,
    maxAbsoluteDifference = 0,
    maxRelativeDifference = 0;
  function compare(actual, expected, key = "") {
    if (typeof expected === "number") {
      assert.equal(typeof actual, "number");
      assert.ok(Number.isFinite(actual));
      const difference = Math.abs(actual - expected);
      maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference);
      maxRelativeDifference = Math.max(
        maxRelativeDifference,
        difference / Math.max(1, Math.abs(expected)),
      );
      numbers++;
      assert.ok(
        difference <= 2e-9 * Math.max(1, Math.abs(expected)),
        `${key}: ${actual} != ${expected}`,
      );
    } else if (expected && typeof expected === "object") {
      assert.ok(actual && typeof actual === "object", key);
      assert.deepEqual(Object.keys(actual), Object.keys(expected), key);
      if (key === "activeActions") assert.deepEqual(actual, expected);
      else
        for (const k of Object.keys(expected))
          compare(actual[k], expected[k], k);
    } else assert.equal(actual, expected, key);
  }
  if (mode === "before") await writeFile(oracleFile, JSON.stringify(result));
  else compare(result, JSON.parse(await readFile(oracleFile, "utf8")));
  console.log(
    JSON.stringify({
      evaluateMs,
      memory,
      nodes: result.nodes,
      gap: result.gap,
      modelEV: result.modelEV,
      numbers,
      maxAbsoluteDifference,
      maxRelativeDifference,
    }),
  );
} else {
  await mkdir(work, { recursive: true });
  for (const mode of ["before", "after"]) {
    const directory = path.join(work, mode);
    await mkdir(directory, { recursive: true });
    for (const file of await readdir(path.join(root, "app")))
      if (file.endsWith(".js"))
        await copyFile(
          path.join(root, "app", file),
          path.join(directory, file),
        );
    for (const file of mode === "before"
      ? ["full-game.js"]
      : ["full-game.js", "full-reach.js"]) {
      const old = spawnSync(
        "git",
        [
          "show",
          `${mode === "before" ? baselineRevision : comparisonRevision}:app/${file}`,
        ],
        { cwd: root, encoding: "utf8", windowsHide: true },
      );
      if (old.status) throw Error(old.stderr);
      await writeFile(path.join(directory, file), old.stdout);
    }
    // Isolated scalability experiment only; production range limits unchanged.
    const limitsFile = path.join(directory, "limits.js");
    await writeFile(
      limitsFile,
      (await readFile(limitsFile, "utf8")).replace(
        /FULL_COMBO_LIMIT = \d+/,
        "FULL_COMBO_LIMIT = 1326",
      ),
    );
  }
  const module = await import(
    pathToFileURL(path.join(work, "after/full-game.js"))
  );
  const { fullCardContext } = await import(
    pathToFileURL(path.join(work, "after/full-cards.js"))
  );
  const { DEFAULT, cards } = await import(
    pathToFileURL(path.join(work, "after/engine.js"))
  );
  const { parsePreflopRange, RANGE_TEMPLATES, rangeText } = await import(
    pathToFileURL(path.join(work, "after/preflop-ranges.js"))
  );
  const board = cards("7c6d2h");
  const all = parsePreflopRange(RANGE_TEMPLATES[0].range).filter(
    (h) => !h.cards.some((c) => board.includes(c)),
  );
  const hands = Array.from({ length: 96 }, (_, i) => ({
    ...all[Math.floor((i * all.length) / 96)],
    weight: ((i % 7) + 1) / 7,
  }));
  const scenario = {
    ...DEFAULT,
    name: "Synthetic 96-hand evaluation workload, not a solved strategy",
    game: "full",
    flop: "7c6d2h",
    hero: rangeText(hands),
    villain: rangeText(hands),
    pot: 4,
    stack: 1,
    betting: Object.fromEntries(
      ["flop", "turn", "river"].map((s) => [s, { bet: [25], raise: [100] }]),
    ),
  };
  const g = module.validateFull(scenario),
    context = fullCardContext(g);
  function build(state) {
    if (state.type === "terminal") return null;
    if (state.type === "chance")
      return {
        type: "chance",
        children: Object.fromEntries(
          Array.from({ length: 52 }, (_, c) => c)
            .filter(
              (c) =>
                !state.board.includes(c) &&
                context.coverage([...state.board, c]).pairCount,
            )
            .map((c) => [c, build(module.nextStreet(state, c))]),
        ),
      };
    const actions = module.configuredFullActions(scenario, state);
    const legal = context.coverage(state.board).actors[state.player];
    return {
      type: "action",
      actions,
      policy: hands.map((_, i) => {
        if (!legal.has(i)) return null;
        const row = actions.map((_, a) => 1 + ((i + 3 * a) % 7)),
          sum = row.reduce((a, b) => a + b, 0);
        return row.map((x) => x / sum);
      }),
      children: actions.map((a) =>
        build(module.transition(scenario, state, a)),
      ),
    };
  }
  const synthetic = path.join(work, "synthetic96.json");
  await writeFile(
    synthetic,
    JSON.stringify({ scenario, tree: build(module.initialState(scenario)) }),
  );
  const rows = [];
  for (const fixture of [
    ".native/full-sized-scenario.json",
    ".native/expanded-ranges.json",
    synthetic,
  ]) {
    const runs = { before: [], after: [] },
      oracle = path.join(work, "oracle.json");
    for (let round = 0; round < 3; round++) {
      for (const mode of round === 1
        ? ["after", "before"]
        : ["before", "after"]) {
        const proc = spawnSync(
          process.execPath,
          [
            "--expose-gc",
            fileURLToPath(import.meta.url),
            "--child",
            mode,
            path.join(work, mode, "full-game.js"),
            path.resolve(root, fixture),
            oracle,
          ],
          {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
        );
        if (proc.status !== 0) throw Error(proc.stderr || proc.stdout);
        const result = JSON.parse(proc.stdout);
        runs[mode].push(result);
        console.log(
          JSON.stringify({
            fixture: path.basename(fixture),
            round,
            mode,
            ...result,
          }),
        );
      }
    }
    const median = (mode) =>
      runs[mode].map((r) => r.evaluateMs).sort((a, b) => a - b)[1];
    rows.push({
      fixture: path.basename(fixture),
      beforeMedianMs: median("before"),
      afterMedianMs: median("after"),
      runs,
    });
  }
  await writeFile(
    path.join(root, "docs/benchmarks/factored-reach.json"),
    JSON.stringify(
      {
        baselineRevision,
        comparisonRevision,
        node: process.version,
        platform: process.platform,
        cpu: os.cpus()[0].model,
        method:
          "Three fresh-process evaluation runs per version, alternating order. Identical trees, policies, weights and settings. All numeric result fields checked within 2e-9 relative to max(1, absolute reference), all other fields and selected menus identical. The 96-hand fixture is synthetic, not a native solution; only isolated copies relax the range cap. Memory snapshots are not peak memory or 8 GB qualification.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
}
