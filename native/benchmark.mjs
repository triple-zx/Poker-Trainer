import { writeFile } from "node:fs/promises";
import os from "node:os";
import { run } from "./adapter.mjs";
import { DEFAULT, validate, equity, solve } from "../app/engine.js";
const fixtures = [
  DEFAULT,
  {
    ...DEFAULT,
    name: "Paired flop / blockers",
    flop: "Ks Kd 4h",
    hero: "AcQc:0.3,AhQh:1,9s8s:0.8",
    villain: "AcJc:0.5,AdQd:1,9s9h:1",
    stack: 5,
  },
  {
    ...DEFAULT,
    name: "Monotone / weighted",
    flop: "Qh Jh 2h",
    hero: "AhKh:0.2,QsQd:1,9c8c:0.4",
    villain: "AcKd:0.7,Ts9s:1,2c2d:0.5",
    stack: 20,
  },
  {
    ...DEFAULT,
    name: "Guaranteed top set / tiny range",
    flop: "As Ad 2c",
    hero: "AhKh",
    villain: "QcQd",
    stack: 3,
  },
];
const results = [];
for (const s of fixtures) {
  const g = validate(s),
    start = performance.now(),
    eq = g.pairs.map((p) =>
      equity(g.hero[p.i].cards, g.villain[p.j].cards, g.board),
    );
  const reference = solve(s, eq),
    referenceMs = performance.now() - start;
  const native = await run(s);
  const verified = solve(s, eq, native);
  const row = {
    name: s.name,
    scenario: s,
    pairs: g.pairs.length,
    runouts: g.pairs.length * 990,
    referenceMs,
    referenceGap: reference.gap,
    nativeMs: native.wallMs,
    reportedPercent: native.reportedPercent,
    independentGap: verified.gap,
    nativeGapBb: (native.reportedPercent * s.pot) / 50,
    passed:
      verified.gap < 0.001 &&
      Math.abs(verified.gap - (native.reportedPercent * s.pot) / 50) < 0.0001,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}
const report = {
  date: new Date().toISOString(),
  platform: os.platform(),
  arch: os.arch(),
  cpu: os.cpus()[0].model,
  node: process.version,
  threadLimit: 4,
  upstream: "6dfb65b4d7ed081da509e8d8c3d82138c4708267",
  patch: "native/texassolver.patch",
  results,
};
await writeFile(
  new URL("../docs/benchmarks/native.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
