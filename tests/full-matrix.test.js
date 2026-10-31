import test from "node:test";
import assert from "node:assert/strict";
import {
  packMatrix,
  mapMatrix,
  matrixRow,
  matrixRows,
  matrixValue,
  createMatrixArena,
  matrixTransfers,
} from "../app/full-matrix.js";
import { DEFAULT } from "../app/engine.js";
import { parsePreflopRange, rangeText } from "../app/preflop-ranges.js";
import {
  convertFull,
  evaluateFull,
  initialState,
  transition,
  nextStreet,
  configuredFullActions,
  validateFull,
} from "../app/full-game.js";
import { fullCardContext } from "../app/full-cards.js";
import {
  solutionPackage,
  restorePackage,
  remodelSolution,
} from "../app/solution-package.js";
import { FullSession, drillContext } from "../app/full-session.js";
import { nodeReach, analyzeNode } from "../app/full-node-analysis.js";
import { editFullModel } from "../app/full-model.js";

test("compact rows preserve exact doubles, missing rows and worker clone semantics", () => {
  const rows = Array.from({ length: 32 }, (_, i) =>
    i % 5 ? [i / 31, 1e-30, -i - 0.25] : null,
  );
  const matrix = packMatrix(rows, 3),
    cloned = structuredClone(matrix);
  assert.ok(cloned.values instanceof Float64Array);
  assert.equal(cloned.values.length, 96);
  for (const action of [-1, 3, 1.5])
    assert.equal(matrixValue(cloned, 1, action), undefined);
  assert.deepEqual(matrixRows(cloned), rows);
  for (let i = 0; i < rows.length; i++)
    for (let a = 0; a < 3; a++)
      assert.equal(matrixValue(cloned, i, a), rows[i]?.[a]);
  const row = matrixRow(cloned, 1);
  row[0] = 99;
  assert.equal(
    matrixValue(cloned, 1, 0),
    rows[1][0],
    "Extracted rows cannot mutate shared storage",
  );
  cloned.values[3] = 22;
  assert.equal(
    matrixValue(matrix, 1, 0),
    rows[1][0],
    "Worker/IDB clone owns its buffers",
  );
  const mapped = mapMatrix(matrix, 2, (r) => (r ? [r[0], r[1]] : null));
  assert.deepEqual(
    matrixRows(mapped),
    rows.map((r) => (r ? r.slice(0, 2) : null)),
  );
  assert.deepEqual(packMatrix([[0, 1], null], 2), [[0, 1], null]);
  assert.throws(() => packMatrix(rows, 2), /width/);
  const arena = createMatrixArena();
  const root = {
    policy: packMatrix(rows, 3, arena),
    children: [{ model: packMatrix(rows, 3, arena) }],
  };
  assert.strictEqual(
    root.policy.values.buffer,
    root.children[0].model.values.buffer,
  );
  const transfers = matrixTransfers(root);
  assert.equal(transfers.length, 2);
  const moved = structuredClone(root, { transfer: transfers });
  assert.equal(root.policy.values.byteLength, 0);
  assert.deepEqual(matrixRows(moved.children[0].model), rows);
  assert.deepEqual(matrixRows(moved.policy), rows);
});

test("compact full solutions preserve portable format, training, analysis and opponent edits", () => {
  const range = rangeText(parsePreflopRange("JJ+"));
  const scenario = {
    ...DEFAULT,
    name: "Compact matrix compatibility",
    game: "full",
    flop: "7c6d2h",
    hero: range,
    villain: range,
    pot: 4,
    stack: 1,
    betting: Object.fromEntries(
      ["flop", "turn", "river"].map((street) => [
        street,
        { bet: [25], raise: [100] },
      ]),
    ),
  };
  const g = validateFull(scenario),
    cards = fullCardContext(g);
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
                cards.coverage([...state.board, c]).pairCount,
            )
            .map((c) => [c, build(nextStreet(state, c))]),
        ),
      };
    const actions = configuredFullActions(scenario, state),
      legal = cards.coverage(state.board).actors[state.player];
    return {
      type: "action",
      actions,
      policy: g.hero.map((_, i) =>
        legal.has(i) ? actions.map(() => 1 / actions.length) : null,
      ),
      children: actions.map((a) => build(transition(scenario, state, a))),
    };
  }
  const tree = build(initialState(scenario));
  const result = evaluateFull(
    convertFull(tree, scenario, { portable: true }),
    scenario,
  );
  assert.ok(result.root.policy.values instanceof Float64Array);
  assert.ok(result.root.ev.values instanceof Float64Array);
  assert.ok(result.root.adjusted.values instanceof Float64Array);
  const pkg = solutionPackage(result);
  assert.deepEqual(
    pkg.tree,
    tree,
    "Shared JSON schema remains ordinary row arrays",
  );
  const restored = restorePackage(JSON.parse(JSON.stringify(pkg))).result;
  assert.equal(restored.gap, result.gap);
  assert.deepEqual(restored.root.ev, result.root.ev);
  // Simulate a previous version's saved row-array result, mixed with compact
  // descendants; all readers must accept either representation at each node.
  const legacy = structuredClone(result);
  for (const field of ["policy", "ev", "adjusted"])
    legacy.root[field] = matrixRows(legacy.root[field]);
  const clone = structuredClone(restored);
  let seed = 591;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 20; i++) {
    const initialSeed = seed,
      a = new FullSession(clone, null, random);
    while (!a.finished)
      a.node.type === "action" && a.node.player === 0
        ? a.choose(0)
        : a.advance();
    seed = initialSeed;
    const b = new FullSession(legacy, null, random);
    while (!b.finished)
      b.node.type === "action" && b.node.player === 0
        ? b.choose(0)
        : b.advance();
    assert.deepEqual(a.decisions, b.decisions);
    assert.deepEqual(JSON.parse(JSON.stringify(a.decisions)), a.decisions);
  }
  const path = "root/a:CHECK/a:CHECK/c:3c/a:CHECK/a:CHECK/c:4d";
  assert.deepEqual(nodeReach(clone, path).game, nodeReach(legacy, path).game);
  const analyzed = analyzeNode(clone, path);
  assert.ok(analyzed.frequencies.every(Number.isFinite));
  assert.ok(
    Math.abs(analyzed.frequencies.reduce((a, b) => a + b, 0) - 1) < 1e-12,
  );
  assert.ok(drillContext(clone, { path, profile: "model" }).reachable);
  const edited = editFullModel(scenario, "root/a:CHECK", g.villain[0].label, {
    CHECK: 0.75,
    "BET:1": 0.25,
  });
  const remodeled = remodelSolution(clone, edited).result;
  assert.deepEqual(
    matrixRow(remodeled.root.children[0].model, 0),
    [0.75, 0.25],
  );
  assert.deepEqual(matrixRow(clone.root.children[0].model, 0), [0.5, 0.5]);
});
