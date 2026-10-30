import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT,
  cards,
  range,
  validate,
  rank7,
  equity,
  payoffs,
  solve,
  sample,
  importPackage,
} from "../app/engine.js";
import { createServer } from "../server.mjs";
test("validates card syntax, weights, duplicate combos and collisions", () => {
  assert.throws(() => cards("As As"));
  assert.throws(() => cards("10h"));
  assert.throws(() => range("AhKh:NaN", []));
  assert.throws(() => range("AhKh:1,KhAh:0.5", []));
  assert.throws(() => validate({ ...DEFAULT, hero: "AsKh" }));
  assert.throws(() => validate({ ...DEFAULT, villain: "AhKh", hero: "AhQd" }));
  assert.throws(() => validate({ ...DEFAULT, overrides: { bad: 0.5 } }));
  assert.throws(() => validate({ ...DEFAULT, pot: Infinity }));
  assert.throws(() => validate({ ...DEFAULT, iterations: 100.5 }));
});
test("hand classes and kickers have correct order", () => {
  const examples = [
    "As Kd 9h 7c 5s 3h 2c",
    "As Ad Kh 9c 7s 3h 2c",
    "As Ad Kh Kc 7s 3h 2c",
    "As Ad Ah Kc 7s 3h 2c",
    "As 2d 3h 4c 5s Jh Tc",
    "As Js 9s 7s 5s 3h 2c",
    "As Ad Ah Kc Ks 3h 2c",
    "As Ad Ah Ac Ks 3h 2c",
    "9s Ts Js Qs Ks 3h 2c",
  ];
  const ranks = examples.map((s) => rank7(cards(s)));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] > ranks[i - 1]);
  assert.ok(rank7(cards("2s 3h 4d 5c 6h Ks Qc")) > rank7(cards(examples[4])));
  assert.ok(
    rank7(cards("As Ad Ah Ks Kd Kh 2c")) ===
      rank7(cards("As Ad Ah Ks Kd 3h 2c")),
  );
});
test("equity enumerates 990 legal runouts symmetrically", () => {
  const h = cards("AhKh"),
    v = cards("QcQd"),
    b = cards("As7d2c");
  const e = equity(h, v, b);
  assert.ok(e > 0.8 && e < 1);
  assert.ok(Math.abs(e + equity(v, h, b) - 1) < 1e-12);
});
test("rake, ties and sunk-pot accounting", () => {
  assert.deepEqual(payoffs(0.5, { ...DEFAULT, pot: 10, stack: 15 }), {
    check: [5, 5],
    call: [5, 5],
    fold: [10, 0],
  });
  assert.deepEqual(
    payoffs(1, { ...DEFAULT, pot: 10, stack: 15, rake: 5, cap: 1 }),
    { check: [9.5, 0], call: [24, -15], fold: [9.5, 0] },
  );
});
test("known pure-strategy game converges and fixed opponents produce exact best response", () => {
  const s = { ...DEFAULT, hero: "AhKh", villain: "QcQd", iterations: 10000 },
    r = solve(s, [1]);
  assert.ok(r.baseline[0] < 0.01 || r.gap < 0.01);
  assert.ok(r.calls[0] < 0.01);
  assert.ok(r.gap < 0.01);
  const call = solve({ ...s, tendency: 1 }, [1]);
  assert.equal(call.model[0], 1);
  assert.equal(call.response[0], 1);
  assert.deepEqual(call.ev[0], [10, 25]);
  const lose = solve({ ...s, tendency: 1 }, [0]);
  assert.equal(lose.response[0], 0);
  assert.deepEqual(lose.ev[0], [0, -15]);
});
test("equivalent actions are not penalized and blend endpoints hold", () => {
  const s = { ...DEFAULT, hero: "AhKh", villain: "QcQd", tendency: -1 };
  const r = solve(s, [1]);
  assert.deepEqual(r.ev[0], [10, 10]);
  assert.equal(r.response[0], r.baseline[0]);
  const b = solve({ ...s, deviation: 0 }, [0.5]);
  assert.deepEqual(b.adjusted, b.baseline);
  assert.throws(() => solve(s, [NaN]));
});
test("joint sampling respects blockers, range weights and unique runouts", () => {
  const g = validate({
    ...DEFAULT,
    hero: "AhKh:1,QhQd:0.5",
    villain: "AcQc:1,AhJh:1",
  });
  assert.equal(g.pairs.length, 3);
  assert.ok(Math.abs(g.pairs[0].weight - 0.5) < 1e-12);
  let state = 1;
  const rng = () => (state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32;
  const counts = {};
  for (let n = 0; n < 10000; n++) {
    const h = sample(g, rng),
      all = [
        ...g.board,
        ...g.hero[h.i].cards,
        ...g.villain[h.j].cards,
        ...h.runout,
      ];
    assert.equal(new Set(all).size, 9);
    const k = h.i + "," + h.j;
    counts[k] = (counts[k] || 0) + 1;
  }
  assert.ok(Math.abs(counts["0,0"] / 10000 - 0.5) < 0.02);
});
test("packages reject unsupported versions and malformed coverage", () => {
  assert.throws(() => importPackage({ schema: 2, scenario: DEFAULT }));
  assert.throws(() =>
    importPackage({ schema: 1, scenario: DEFAULT, equities: [1] }),
  );
  assert.equal(
    importPackage({ schema: 1, scenario: DEFAULT }).scenario.name,
    DEFAULT.name,
  );
});
test("local server serves modules and refuses missing/private paths", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /POSTFLOP LAB/);
    assert.match(
      page.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.equal((await fetch(base + "/engine.js")).status, 200);
    assert.equal((await fetch(base + "/.git/config")).status, 404);
    assert.equal((await fetch(base + "/%2e%2e%2fpackage.json")).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
