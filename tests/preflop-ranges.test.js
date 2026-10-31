import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePreflopRange as parse,
  rangeText,
  preflopMatrix,
  handClass,
  rangeDocument,
  importRangeFile,
  rangeForFlop,
  validateRangeOrigins,
  RANGE_TEMPLATES,
} from "../app/preflop-ranges.js";
import { DEFAULT, validate } from "../app/engine.js";
import {
  scenarioPackage,
  restorePackage,
  sameScenario,
} from "../app/solution-package.js";
import { flopGroupSettings } from "../app/flop-report.js";

const doc = (range, extra = {}) =>
  rangeDocument({
    type: "poker-trainer-range",
    schema: 1,
    name: "My range",
    range,
    ...extra,
  });
test("range notation expands classes, plus and intervals into all exact combinations", () => {
  assert.equal(parse("AA").length, 6);
  assert.equal(parse("AKs").length, 4);
  assert.equal(parse("AKo").length, 12);
  assert.equal(parse("AK").length, 16);
  assert.equal(parse("QQ+").length, 18);
  assert.equal(parse("AJs+").length, 12);
  assert.equal(parse("KTo+").length, 36);
  assert.equal(parse("77-TT").length, 24);
  assert.equal(parse("A5s-A2s").length, 16);
  assert.equal(parse("T9s-54s").length, 24);
  assert.deepEqual(parse("A5s-A2s"), parse("A2s-A5s"));
  assert.deepEqual(parse("khah:.25"), parse("AhKh:25%"));
  assert.equal(
    parse("AA:0,AKs:.5").reduce((n, h) => n + h.weight, 0),
    2,
  );
  assert.equal(parse(RANGE_TEMPLATES[0].range).length, 1326);
  assert.equal(
    new Set(parse(RANGE_TEMPLATES[0].range).map((h) => h.label)).size,
    1326,
  );
  for (const d of RANGE_TEMPLATES)
    assert.equal(rangeText(parse(d.range)), d.range);
});
test("range parsing rejects ambiguity, malformed weights and overlapping tokens", () => {
  for (const value of [
    "AA,AsAh",
    "AKs,AhKh:0",
    "AhKh,KhAh",
    "AA:1.1",
    "AA:-1",
    "AA:NaN",
    "AA:",
    "AA:0x1",
    "AA:101%",
    "AA::1",
    "AhAh",
    "AAs",
    "A5s-A2o",
    "KTs-76s",
    "44-A4",
    "AA++",
    "0.1 0.2",
  ])
    assert.throws(() => parse(value), undefined, value);
  assert.equal(parse("").length, 0);
  assert.equal(parse("AA:1e-4")[0].weight, 0.0001);
  assert.deepEqual(parse("AA: .5; AKs:25%\nKQo"), parse("AA:.5,AKs:.25,KQo"));
});
test("percentage groups preserve fractional weights, suits and canonical range provenance", () => {
  const source = "[0.5]AhKh,AdKd[/0.50], [25]QQ[/25][100]A5s-A2s[/100]; KQo:.5";
  const expected = parse("AhKh:.005,AdKd:.005,QQ:.25,A5s-A2s,KQo:.5");
  assert.deepEqual(parse(source), expected);
  const imported = importRangeFile(source, "Study.txt");
  assert.equal(imported.range, rangeText(expected));
  assert.equal(imported.originalRange, imported.range);
  assert.deepEqual(importRangeFile(JSON.stringify(imported)), imported);
  assert.deepEqual(parse("[0]AA[/0], AKs"), parse("AKs"));
  assert.equal(
    parse(`[12.345]${RANGE_TEMPLATES[0].range.replace(/:1/g, "")}[/12.345]`)
      .length,
    1326,
  );
  const applied = rangeForFlop(doc("[25]AKs[/25]"), "As 7d 2c", 12);
  assert.equal(applied.blocked, 1);
  assert.ok(parse(applied.text).every((h) => h.weight === 0.25));
});
test("malformed or conflicting percentage groups fail without a partial range", () => {
  for (const text of [
    "[50]AA",
    "AA[/50]",
    "[25]AA[/50]",
    "[25][/25]",
    "[25]AA[50]KK[/50][/25]",
    "[50]AA:.5[/50]",
    "[101]AA[/101]",
    "[-1]AA[/-1]",
    "[NaN]AA[/NaN]",
    "[50%]AA[/50%]",
    "[5e1]AA[/5e1]",
    "[50AA",
    "AA]",
    "[50]AA[/50]AA",
    "[0]AhKh[/0],[25]KhAh[/25]",
    "[25]AA[/25], AsAh:.25",
    "AA, [25]KK[/25] trailing",
  ])
    assert.throws(() => parse(text), undefined, text);
});
test("range matrix preserves suit-specific weights and correct class denominators", () => {
  const matrix = preflopMatrix(parse("AhKh:.5,AdKd:1,QsQh:.6"));
  assert.equal(matrix.length, 169);
  assert.equal(new Set(matrix.map((c) => c.label)).size, 169);
  assert.equal(matrix.find((c) => c.label === "AKs").weight, 1.5 / 4);
  assert.equal(matrix.find((c) => c.label === "QQ").weight, 0.6 / 6);
  assert.equal(matrix.find((c) => c.label === "AKo").combos.length, 12);
  assert.ok(
    matrix
      .find((c) => c.label === "AKs")
      .combos.every((h) => handClass(h.cards) === "AKs"),
  );
});
test("range documents retain assumptions and original weights, excluding unrelated personal data", () => {
  const original = doc("AKs", {
    context: {
      tableFormat: "hu",
      position: "BTN/SB",
      opponentPosition: "BB",
      stackBB: 100,
      rakePercent: 5,
      rakeCapBB: 2,
      anteBB: 0,
      history: "BTN raises; BB calls",
      betSizes: "Open 2.5",
    },
    source: {
      label: "Personal model",
      url: "https://example.com/range",
      license: "Unknown",
      notes: "Unverified",
      privateData: "omit",
    },
    records: ["omit"],
  });
  const edited = rangeDocument({ ...original, range: "AhKh:.5" });
  const restored = importRangeFile(JSON.stringify(edited));
  assert.deepEqual(restored, edited);
  assert.equal(parse(restored.originalRange).length, 4);
  assert.equal(restored.context.stackBB, 100);
  assert.equal(restored.source.privateData, undefined);
  assert.equal(restored.records, undefined);
  assert.equal(importRangeFile("AA:50%", "custom.txt").name, "custom");
  for (const bad of [
    { schema: 2 },
    { name: "" },
    { range: "AA:0" },
    { context: { tableFormat: "hu", position: "UTG" } },
    { context: { stackBB: -1 } },
    { source: [] },
  ])
    assert.throws(() => rangeDocument({ ...original, ...bad }));
});
test("postflop application removes only board collisions and refuses automatic range truncation", () => {
  const applied = rangeForFlop(doc("AKs"), "As 7d 2c", 4);
  assert.equal(applied.count, 3);
  assert.equal(applied.blocked, 1);
  assert.ok(!applied.text.includes("AsKs"));
  const weighted = rangeForFlop(doc("AhKh:.25,AdKd:.75"), "As7d2c", 4);
  assert.equal(parse(weighted.text)[0].weight, 0.25);
  assert.throws(() => rangeForFlop(doc("22+"), "As7d2c", 4), /No combinations/);
  assert.throws(() => rangeForFlop(doc("AsKs"), "As7d2c", 4), /blocks every/);
  assert.throws(() => rangeForFlop(doc("AKs"), "As As 2c", 4), /distinct/);
});
test("scenario provenance is validated, retained in schema 5 and separates flop report assumptions", () => {
  const source = doc("AhKh", {
    context: { tableFormat: "6max", position: "BTN", stackBB: 100 },
  });
  const s = {
    ...DEFAULT,
    hero: "AhKh",
    villain: "QcQd",
    rangeOrigins: { hero: source },
  };
  validate(s);
  validateRangeOrigins(s);
  const pkg = scenarioPackage(s);
  assert.equal(pkg.schema, 5);
  assert.deepEqual(restorePackage(pkg).scenario.rangeOrigins, s.rangeOrigins);
  assert.ok(sameScenario(s, restorePackage(pkg).scenario));
  assert.throws(() => validate({ ...s, hero: "AdKd" }), /provenance/);
  assert.throws(
    () => validate({ ...s, rangeOrigins: { other: source } }),
    /provenance/,
  );
  const changed = {
    ...s,
    rangeOrigins: {
      hero: { ...source, context: { ...source.context, stackBB: 50 } },
    },
  };
  assert.ok(!sameScenario(s, changed));
  const full = {
    ...s,
    game: "full",
    pot: 4,
    stack: 1,
    betting: Object.fromEntries(
      ["flop", "turn", "river"].map((k) => [k, { bet: [25], raise: [100] }]),
    ),
  };
  assert.notDeepEqual(
    flopGroupSettings(full),
    flopGroupSettings({ ...full, rangeOrigins: changed.rangeOrigins }),
  );
  const dirty = {
    ...s,
    rangeOrigins: { hero: { ...source, records: ["private"] } },
  };
  assert.equal(
    scenarioPackage(dirty).scenario.rangeOrigins.hero.records,
    undefined,
  );
});
