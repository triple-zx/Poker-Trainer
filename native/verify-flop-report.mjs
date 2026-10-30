import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULT, equity, validate } from "../app/engine.js";
import { convertFull, evaluateFull } from "../app/full-game.js";
import { solutionPackage, restorePackage } from "../app/solution-package.js";
import { compareSavedFlops } from "../app/flop-report.js";
import { run } from "./adapter.mjs";

const saved = new Map(),
  measurements = [];
await mkdir(".native", { recursive: true });
for (const [label, flop] of [
  ["Ace", "As7d2c"],
  ["Jack", "Js7d2c"],
]) {
  const scenario = {
    ...DEFAULT,
    name: `${label}-high · flop comparison`,
    game: "full",
    hero: "AhKh",
    villain: "QcQd",
    flop,
    pot: 4,
    stack: 1,
    iterations: 200,
    betting: Object.fromEntries(
      ["flop", "turn", "river"].map((street) => [
        street,
        { bet: [25], raise: [100] },
      ]),
    ),
  };
  const profile = await run(scenario);
  const result = evaluateFull(convertFull(profile.raw, scenario), scenario);
  assert.ok(result.gap < 0.001, "Independent baseline gap target");
  const pkg = solutionPackage(result);
  const restored = restorePackage(JSON.parse(JSON.stringify(pkg))).result;
  assert.equal(restored.gap, result.gap);
  saved.set(scenario.name, restored);
  await writeFile(
    `.native/multi-flop-${label.toLowerCase()}.json`,
    JSON.stringify(pkg),
  );
  measurements.push({
    name: scenario.name,
    flop,
    nodes: result.nodes,
    gap: result.gap,
    nativeWallMs: profile.wallMs,
  });
}
const entries = [...saved].map(([name, result], i) => ({
  name,
  scenario: result.scenario,
  weight: i ? 3 : 1,
}));
const reports = [];
for (const profile of ["baseline", "model"]) {
  for (const weightMode of ["equal", "custom"]) {
    const started = performance.now();
    const report = await compareSavedFlops(
      { entries, profile, weightMode },
      (name) => saved.get(name),
    );
    const wallMs = performance.now() - started;
    assert.equal(report.groups.length, 1);
    const group = report.groups[0];
    assert.equal(group.flops, 2);
    assert.ok(
      Math.abs(group.actions.reduce((sum, a) => sum + a.frequency, 0) - 1) <
        1e-10,
    );
    let expectedEquity = 0;
    for (const row of group.rows) {
      const game = validate(row.scenario);
      expectedEquity +=
        row.share *
        equity(game.hero[0].cards, game.villain[0].cards, game.board);
    }
    assert.ok(Math.abs(group.hero.equity - expectedEquity) < 1e-10);
    assert.equal(group.unconverged, 0);
    reports.push({
      profile,
      weightMode,
      wallMs,
      heroEquity: group.hero.equity,
      modelEV: group.modelEV,
      actions: group.actions,
      shares: group.rows.map((row) => row.share),
    });
  }
}
const output = { nativeSolves: 2, measurements, reports };
await writeFile(
  "docs/benchmarks/flop-report.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output));
