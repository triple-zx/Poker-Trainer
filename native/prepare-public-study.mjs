import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { rangeDocument, parsePreflopRange } from "../app/preflop-ranges.js";
const rows = JSON.parse(
  (
    await readFile(".native/preflop-source-review/range-inputs.json", "utf8")
  ).replace(/^\uFEFF/, ""),
);
const out = "../preflop-study-imports";
await mkdir(out, { recursive: true });
const summary = [];
for (const [sourcePosition, position, open] of [
  ["UTG", "UTG", 2],
  ["MP", "HJ", 2],
  ["CO", "CO", 2],
  ["BU", "BTN", 2],
  ["SB", "SB", 3],
]) {
  const file = `artgto-viewer/ranges/${sourcePosition.toLowerCase()}/${sourcePosition}_RFI.txt`;
  const row = rows.find((r) => r.name === file);
  if (!row) throw Error("Missing " + file);
  const hash = createHash("sha256").update(row.text).digest("hex");
  const doc = rangeDocument({
    type: "poker-trainer-range",
    schema: 1,
    name: `ART/GTO ${position} RFI · 6-max 100bb`,
    range: row.text,
    context: {
      tableFormat: "6max",
      position,
      stackBB: 100,
      history:
        "Unopened pot; raise first in. Source position: " + sourcePosition,
      betSizes: `Raise to ${open} bb`,
      rakePercent: null,
      rakeCapBB: null,
      anteBB: null,
    },
    source: {
      label:
        "ART/GTO public preflop download; publisher-described solver output",
      url: "https://artgto.com/learn/ranges/",
      license:
        "Advertised as a free download for study. No explicit redistribution grant found in the reviewed archive or pages; not bundled with Poker Trainer.",
      notes: `Downloaded 2026-10-31 from https://dl.artgto.com/artgto-viewer.zip. File ${file}; SHA-256 ${hash}. Exact published weights preserved. Rake and ante assumptions and an independently reproducible convergence certificate were not established. Public page percentages are rounded; this file retains decimal frequencies. This input range is not a validated full-hand training solution.`,
    },
  });
  const filename = `ARTGTO-${position}-RFI-100bb.range.json`;
  await writeFile(`${out}/${filename}`, JSON.stringify(doc, null, 2) + "\n");
  const hands = parsePreflopRange(doc.range),
    mass = hands.reduce((n, h) => n + h.weight, 0);
  summary.push({
    filename,
    sourceFile: file,
    sourceSha256: hash,
    combos: hands.length,
    weightedCombos: mass,
    percent: (mass / 1326) * 100,
  });
}
await writeFile(
  `${out}/IMPORT-NOTES.txt`,
  "These five public ART/GTO opening ranges are prepared for local study. In Poker Trainer, open Ranges > Import range file, select one .range.json file and review its source and assumptions before saving.\n\nRake and ante values are unknown, not zero. The publisher describes the data as solver output; no independent equilibrium certificate was verified. These are weighted range inputs, not solved training scenarios. They exceed the current twelve-combination full-hand capacity; the app will refuse application without silently sampling them. The original complete 2,606-file archive remains in poker-trainer/.native/preflop-source-review/artgto-viewer.zip. No third-party viewer or executable was run. No redistribution permission is claimed.\n",
);
console.log(JSON.stringify(summary, null, 2));
