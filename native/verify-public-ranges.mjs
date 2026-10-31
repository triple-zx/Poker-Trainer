import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parsePreflopRange,
  rangeText,
  importRangeFile,
} from "../app/preflop-ranges.js";

// Input is a locally downloaded corpus: [{name, text}]. No chart values are
// bundled in this repository. The oracle below handles exact combos only,
// independently of the app's class/interval/group parser.
const directory = ".native/preflop-source-review/";
const inputs = JSON.parse(
  (
    await readFile(process.argv[2] || directory + "range-inputs.json", "utf8")
  ).replace(/^\uFEFF/, ""),
);
const digest = (data) => createHash("sha256").update(data).digest("hex");
function oracle(text) {
  const values = new Map();
  function add(body, weight) {
    for (const token of body.split(/[,;\s]+/).filter(Boolean)) {
      assert.match(token, /^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/);
      const ids = [token.slice(0, 2), token.slice(2)].map(
        (c) => "23456789TJQKA".indexOf(c[0]) * 4 + "cdhs".indexOf(c[1]),
      );
      assert.notEqual(ids[0], ids[1]);
      const key = ids.sort((a, b) => b - a).join(":");
      assert.equal(values.has(key), false, "duplicate source combo");
      values.set(key, weight);
    }
  }
  const rest = text.replace(
    /\[(\d+(?:\.\d+)?)\]([^\[\]]+)\[\/(\d+(?:\.\d+)?)\]/g,
    (_all, open, body, close) => {
      assert.equal(Number(open), Number(close));
      assert.ok(Number(open) <= 100);
      add(body, Number(open) / 100);
      return ",";
    },
  );
  add(rest, 1);
  return [...values]
    .filter(([, w]) => w > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}
const failures = [],
  counts = [],
  fingerprints = [];
const start = performance.now();
let empty = 0,
  totalCombos = 0;
for (const { name, text } of inputs) {
  try {
    const expected = oracle(text),
      parsed = parsePreflopRange(text);
    const actual = parsed
      .map((h) => [h.cards.join(":"), h.weight])
      .sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(actual, expected);
    assert.deepEqual(parsePreflopRange(rangeText(parsed)), parsed);
    if (parsed.length) {
      const document = importRangeFile(text, name.split("/").at(-1));
      assert.equal(document.originalRange, rangeText(parsed));
      assert.deepEqual(importRangeFile(JSON.stringify(document)), document);
    } else empty++;
    totalCombos += parsed.length;
    counts.push(parsed.length);
    fingerprints.push([name, digest(text), digest(JSON.stringify(actual))]);
  } catch (error) {
    failures.push({ name, error: error.message });
  }
}
const archive = await readFile(directory + "artgto-viewer.zip");
const report = {
  reviewed: "2026-10-31",
  source: "https://artgto.com/gto-solutions/",
  download: "https://dl.artgto.com/artgto-viewer.zip",
  archiveBytes: archive.length,
  archiveSha256: digest(archive),
  files: inputs.length,
  validated: counts.length,
  empty,
  minPositiveCombinations: Math.min(...counts.filter(Boolean)),
  maxCombinations: Math.max(...counts),
  totalIncludedCombinations: totalCombos,
  corpusFingerprint: digest(JSON.stringify(fingerprints)),
  validationMs: performance.now() - start,
  verification:
    "Independent exact-combination percentage decoder; exact weight equality; canonical text and range-document round trips. This verifies import integrity, not poker equilibrium quality.",
  failures,
};
await writeFile(
  "docs/benchmarks/public-range-import.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
assert.equal(failures.length, 0, "Source corpus failed validation");
