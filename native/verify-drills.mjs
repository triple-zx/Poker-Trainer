// Reuse a portable native fixture; no C++ solve or network request is started.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { restorePackage } from "../app/solution-package.js";
import { childPath } from "../app/full-model.js";
import { FullSession, drillContext } from "../app/full-session.js";
const files = process.argv.slice(2);
if (!files.length)
  files.push(
    ".native/full-sized-scenario.json",
    ".native/full-hand-ip-v3.json",
  );
const reports = [];
for (const file of files) {
  const result = restorePackage(
    JSON.parse(await readFile(file, "utf8")),
  ).result;
  const found = new Map();
  function visit(node, path = "root") {
    if (node.type === "terminal" || found.size === 6) return;
    if (node.type === "action" && node.player === 0) {
      for (const kind of ["BET", "RAISE"]) {
        const key = node.board.length + ":" + kind;
        const action = node.actions.findIndex((a) => a.kind === kind);
        if (action < 0 || found.has(key)) continue;
        try {
          drillContext(result, { path, profile: "baseline" });
          found.set(key, {
            path,
            action,
            kind,
            street: node.board.length,
            choices: node.actions.length,
          });
        } catch {} // Some histories have zero probability or no fixed-model feedback.
      }
    }
    for (const [choice, child] of Object.entries(node.children))
      visit(child, childPath(path, node, choice));
  }
  visit(result.root);
  assert.equal(
    found.size,
    6,
    "Need a sampleable bet and raise decision on each street",
  );
  let decisions = 0;
  for (const selected of found.values()) {
    for (let roll = 0; roll < 20; roll++) {
      for (let action = 0; action < selected.choices; action++) {
        const session = new FullSession(result, null, () => (roll + 0.5) / 20, {
          path: selected.path,
          profile: "baseline",
        });
        const board = [...session.node.board];
        assert.equal(session.decisions.length, 0);
        assert.equal(session.deal.runout.length, 0);
        assert.equal(
          session.g.hero[session.deal.i].cards.some((c) => board.includes(c)),
          false,
        );
        session.choose(action);
        assert.equal(session.finished, true);
        assert.equal(session.decisions.length, 1);
        assert.deepEqual(session.node.board, board);
        assert.equal(session.advance(), null);
        assert.ok(Number.isFinite(session.decisions[0].loss));
        assert.ok(session.decisions[0].loss >= -1e-9);
        decisions++;
      }
    }
  }
  reports.push({
    file,
    position: result.scenario.heroPosition || "oop",
    nodes: result.nodes,
    gap: result.gap,
    nativeSolves: 0,
    decisions,
    selected: [...found.values()],
  });
}
await writeFile(
  "docs/benchmarks/decision-drills.json",
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(JSON.stringify(reports, null, 2));
