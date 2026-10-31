import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { serialize, deserialize } from "node:v8";
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRevision = "3bb1a9b154266ac8e4a5ac13ccfc11905f02439c";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

if (process.argv[2] === "--child") {
  const [directory, filename, workload] = process.argv.slice(3);
  const module = (file) => import(pathToFileURL(path.join(directory, file)));
  const { analyzeNode, nodeReach } = await module("full-node-analysis.js");
  const { compareNextCards } = await module("full-card-analysis.js");
  const { childPath } = await module("full-model.js");
  const { convertFull, evaluateFull } = await import("../app/full-game.js");
  async function load() {
    if (filename.endsWith(".bin")) return deserialize(await readFile(filename));
    const fixture = JSON.parse(await readFile(filename, "utf8"));
    // Public-range feasibility is deliberately isolated from production caps.
    const converter =
      workload === "public-root"
        ? await module("full-game.js")
        : { convertFull };
    const tree = converter.convertFull(fixture.tree, fixture.scenario, {
      portable: true,
    });
    if (workload === "public-root")
      return { ...tree, scenario: fixture.scenario };
    return evaluateFull(tree, fixture.scenario);
  }
  const result = await load();
  globalThis.savedResult = result;
  const profile = workload === "public-root" ? "baseline" : "model";
  const selected = {};
  function find(node, current = "root") {
    const key =
      (node.type === "action"
        ? "action"
        : node.type === "chance"
          ? "chance"
          : "") + node.board.length;
    if (
      ["action4", "action5", "chance3", "chance4"].includes(key) &&
      !selected[key] &&
      nodeReach(result, current, profile).reachable
    )
      selected[key] = current;
    if (Object.keys(selected).length === 4) return;
    if (node.type === "action")
      node.children.forEach((child, i) => {
        if (Object.keys(selected).length < 4)
          find(child, childPath(current, node, i));
      });
    else if (node.type === "chance")
      for (const [card, child] of Object.entries(node.children)) {
        if (Object.keys(selected).length === 4) break;
        find(child, childPath(current, node, card));
      }
  }
  if (workload !== "public-root") {
    find(result.root);
    assert.equal(
      Object.keys(selected).length,
      4,
      "All requested streets have reachable reports",
    );
  }
  await new Promise(setImmediate);
  global.gc();
  await new Promise(setImmediate);
  global.gc();
  const before = process.memoryUsage(),
    cache = new Map(),
    reports = [],
    timings = [];
  function measure(name, fn) {
    const started = performance.now(),
      report = fn();
    timings.push({ name, ms: performance.now() - started });
    assert.ok(report.reachable);
    const summary = report.rows
      ? report
      : {
          profile: report.profile,
          reach: report.reach,
          logReach: report.logReach,
          game: report.game,
          hero: report.hero,
          villain: report.villain,
          frequencies: report.frequencies,
          node: {
            type: report.node.type,
            player: report.node.player,
            board: report.node.board,
            actions: report.node.actions,
          },
        };
    if (!report.rows) {
      assert.ok(
        Math.abs(report.hero.equity + report.villain.equity - 1) < 1e-10,
      );
      for (const side of ["hero", "villain"]) {
        assert.ok(
          Math.abs(report[side].hands.reduce((sum, h) => sum + h.mass, 0) - 1) <
            1e-10,
        );
        for (const hand of report[side].hands)
          assert.ok(hand.equity === null || Number.isFinite(hand.equity));
      }
    }
    reports.push(summary);
  }
  if (workload !== "later")
    measure("flop", () => analyzeNode(result, "root", profile, cache));
  if (workload !== "public-root") {
    measure("turn", () =>
      analyzeNode(result, selected.action4, profile, cache),
    );
    measure("river", () =>
      analyzeNode(result, selected.action5, profile, cache),
    );
    const comparison =
      workload === "later" ? selected.chance4 : selected.chance3;
    measure("nextCards", () =>
      compareNextCards(result, comparison, profile, cache),
    );
  }
  globalThis.retainedAnalysis = { cache, reports };
  await new Promise(setImmediate);
  global.gc();
  await new Promise(setImmediate);
  global.gc();
  const after = process.memoryUsage();
  console.log(
    JSON.stringify({
      workload,
      profile,
      paths: selected,
      timings,
      elapsedMs: timings.reduce((s, t) => s + t.ms, 0),
      retainedBytes:
        after.heapUsed +
        after.arrayBuffers -
        before.heapUsed -
        before.arrayBuffers,
      before,
      after,
      digest: digest(reports),
      hands: [reports[0].game.hero.length, reports[0].game.villain.length],
      rootEquity: workload !== "later" ? reports[0].hero.equity : null,
    }),
  );
} else {
  const previous = path.join(root, ".native/analysis-before/app");
  await mkdir(previous, { recursive: true });
  await cp(path.join(root, "app"), previous, { recursive: true });
  for (const file of [
    "full-node-analysis.js",
    "full-cards.js",
    "analytics.js",
    "full-card-analysis.js",
  ]) {
    const old = spawnSync("git", ["show", `${baselineRevision}:app/${file}`], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(old.status, 0, old.stderr);
    await writeFile(path.join(previous, file), old.stdout);
  }
  const current = path.join(root, "app"),
    child = fileURLToPath(import.meta.url);
  const prepared = new Map();
  async function prepare(fixture) {
    if (prepared.has(fixture)) return prepared.get(fixture);
    const { convertFull, evaluateFull } = await import("../app/full-game.js");
    const data = JSON.parse(await readFile(path.join(root, fixture), "utf8"));
    const result = evaluateFull(
      convertFull(data.tree, data.scenario, { portable: true }),
      data.scenario,
    );
    const filename =
      ".native/analysis-ready-" + path.basename(fixture) + ".bin";
    await writeFile(path.join(root, filename), serialize(result));
    prepared.set(fixture, filename);
    return filename;
  }
  function run(directory, fixture, workload) {
    const r = spawnSync(
      process.execPath,
      [
        "--expose-gc",
        "--max-old-space-size=1024",
        child,
        "--child",
        directory,
        path.join(root, fixture),
        workload,
      ],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    if (r.error) throw r.error;
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim());
  }
  const cases = [];
  for (const [name, fixture, workload] of [
    ["native12-full", ".native/expanded-ranges.json", "full"],
    ["native96-later", ".native/broad96-scenario.json", "later"],
  ]) {
    const ready = await prepare(fixture);
    const before = [],
      after = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const mode of repeat % 2
        ? ["after", "before"]
        : ["before", "after"]) {
        const result = run(
          mode === "before" ? previous : current,
          ready,
          workload,
        );
        (mode === "before" ? before : after).push(result);
        console.log(
          JSON.stringify({
            name,
            mode,
            repeat,
            ms: result.elapsedMs,
            retainedBytes: result.retainedBytes,
          }),
        );
      }
    }
    assert.ok(
      [...before, ...after].every((r) => r.digest === before[0].digest),
      "Every reported value matches exactly",
    );
    const median = (rows, key) =>
      rows.map((r) => r[key]).sort((a, b) => a - b)[1];
    cases.push({
      name,
      fixture,
      workload,
      before,
      after,
      median: {
        beforeMs: median(before, "elapsedMs"),
        afterMs: median(after, "elapsedMs"),
        beforeRetainedBytes: median(before, "retainedBytes"),
        afterRetainedBytes: median(after, "retainedBytes"),
      },
    });
  }
  const broad = run(
    current,
    await prepare(".native/broad96-scenario.json"),
    "full",
  );
  console.log(
    JSON.stringify({
      name: "native96-full-after",
      ms: broad.elapsedMs,
      retainedBytes: broad.retainedBytes,
    }),
  );
  const isolated = path.join(root, ".native/analysis-public/app");
  await mkdir(isolated, { recursive: true });
  await cp(current, isolated, { recursive: true });
  const limits = await readFile(path.join(isolated, "limits.js"), "utf8");
  assert.ok(limits.includes("FULL_COMBO_LIMIT = 96"));
  await writeFile(
    path.join(isolated, "limits.js"),
    limits.replace("FULL_COMBO_LIMIT = 96", "FULL_COMBO_LIMIT = 1326"),
  );
  const caps = await readFile(path.join(isolated, "limits.js"), "utf8");
  assert.ok(caps.includes("FULL_POLICY_VALUE_LIMIT = 2400000"));
  await writeFile(
    path.join(isolated, "limits.js"),
    caps.replace(
      "FULL_POLICY_VALUE_LIMIT = 2400000",
      "FULL_POLICY_VALUE_LIMIT = 12000000",
    ),
  );
  const publicRoot = run(
    isolated,
    ".native/compact-study/solution.json",
    "public-root",
  );
  const report = {
    baselineRevision,
    platform: process.platform,
    node: process.version,
    cpu: os.cpus()[0].model,
    totalMemory: os.totalmem(),
    comparison:
      "Identical saved trees, ranges, profiles and paths; displayed summaries, conditional pairs/hands and next-card reports hash identically. Fresh processes deserialize the same prepared result so garbage from solver evaluation cannot contaminate memory deltas. Timings exclude loading/conversion/evaluation. Retained analysis heap+buffers after two GC turns, not peak process RAM.",
    cases,
    broadAfterOnly: broad,
    publicRootAfterOnly: publicRoot,
    limitations:
      "No before/after claim for the 96-hand flop or isolated public-root cases. Public-input limits are relaxed only in an ignored copy; production remains 96 hands/2.4M probabilities. Public chart weights are not included. No native solve runs.",
  };
  await writeFile(
    path.join(root, "docs/benchmarks/compact-analysis.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      publicRootMs: publicRoot.elapsedMs,
      publicRootRetainedBytes: publicRoot.retainedBytes,
      medians: cases.map((c) => ({ name: c.name, ...c.median })),
    }),
  );
}
