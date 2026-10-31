import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, validate } from "../app/engine.js";
import { parsePreflopRange, rangeText } from "../app/preflop-ranges.js";
import { packMatrix } from "../app/full-matrix.js";
import { analyzeNode } from "../app/full-node-analysis.js";
import { compareNextCards } from "../app/full-card-analysis.js";
import { analysisRequest } from "../app/analysis-request.js";
import { createAnalysisClient } from "../app/analysis-client.js";

function fixture() {
  const scenario = {
    ...DEFAULT,
    game: "full",
    flop: "7c6d2h",
    hero: rangeText(parsePreflopRange("AA,KK,QQ,JJ")),
    villain: rangeText(parsePreflopRange("KK,QQ,JJ,TT")),
  };
  const game = validate(scenario),
    ranges = [game.hero, game.villain];
  const terminal = (board) => ({
    type: "terminal",
    board,
    spent: [0, 0],
    winner: -1,
  });
  function street(board) {
    const end =
      board.length === 5
        ? terminal(board)
        : {
            type: "chance",
            board,
            spent: [0, 0],
            children: Object.fromEntries(
              Array.from({ length: 52 }, (_, c) => c)
                .filter((c) => !board.includes(c))
                .map((c) => [c, street([...board, c])]),
            ),
          };
    function action(player, check) {
      const rows = ranges[player].map((_, i) => [
        0.2 + (i % 4) * 0.1,
        0.8 - (i % 4) * 0.1,
      ]);
      return {
        type: "action",
        player,
        board,
        spent: [0, 0],
        street: [0, 0],
        actions: [{ kind: "CHECK" }, { kind: "BET", amount: 1 }],
        policy: packMatrix(rows, 2),
        model: packMatrix(
          rows.map((r) => r.toReversed()),
          2,
        ),
        adjusted: packMatrix(
          rows.map(() => [0.6, 0.4]),
          2,
        ),
        children: [check, terminal(board)],
      };
    }
    return action(0, action(1, end));
  }
  return { scenario, root: street(game.board) };
}
const displayed = (report) => {
  const { node, history, ...summary } = report;
  return {
    ...summary,
    node: {
      type: node.type,
      board: node.board,
      player: node.player,
      actions: node.actions,
      spent: node.spent,
      street: node.street,
    },
    history: history.map(({ node, choice }) => ({
      type: node.type,
      board: node.board,
      choice,
    })),
  };
};
test("analysis projections preserve both profiles, later-street reach and complete next-card reports without cloning the saved tree", () => {
  const result = fixture(),
    flop = "root/a:CHECK/a:CHECK",
    turn = flop + "/c:2c",
    river = turn + "/a:CHECK/a:CHECK/c:3d";
  // Unrelated descendants and private cached EV buffers must not enter a request.
  result.root.ev = new Float64Array(1000000);
  result.root.children[1].unused = () => {
    throw Error("Unrelated branch cloned");
  };
  for (const profile of ["baseline", "model"]) {
    const cache = new Map();
    for (const path of ["root", turn, river]) {
      const request = structuredClone(analysisRequest(result, path, profile));
      assert.ok(JSON.stringify(request).length < 40000);
      assert.ok(Array.isArray(request.result.root.policy));
      assert.equal(request.result.root.ev, undefined);
      const original = analyzeNode(result, path, profile);
      const projected = analyzeNode(request.result, path, profile, cache);
      assert.deepEqual(displayed(projected), displayed(original));
    }
    for (const path of [flop, turn + "/a:CHECK/a:CHECK"]) {
      const request = structuredClone(
        analysisRequest(result, path, profile, "cards"),
      );
      assert.deepEqual(
        compareNextCards(request.result, path, profile, cache),
        compareNextCards(result, path, profile),
      );
    }
  }
  result.root.adjusted = packMatrix(gameRows(24, [0, 1]), 2);
  const empty = analysisRequest(result, turn, "model");
  assert.equal(analyzeNode(empty.result, turn, "model").reachable, false);
  assert.throws(() => analysisRequest(result, "root/nope", "model"), /Unknown/);
  assert.throws(
    () => analysisRequest(result, "root", "model", "cards"),
    /Choose/,
  );
  assert.throws(() => analysisRequest(result, "bad", "model"), /Invalid/);
  assert.throws(() => analysisRequest(result, "root", "wrong"), /Unknown/);
  assert.throws(
    () => analysisRequest(result, "root", "model", "unknown"),
    /Unknown/,
  );
});
const gameRows = (count, row) =>
  Array.from({ length: count }, () => row.slice());

function harness() {
  const workers = [];
  const client = createAnalysisClient(() => {
    const worker = {
      sent: [],
      terminated: false,
      postMessage(data) {
        this.sent.push(data);
      },
      terminate() {
        this.terminated = true;
      },
      reply(report, id = this.sent.at(-1).id) {
        this.onmessage({ data: { id, report } });
      },
    };
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}
test("analysis worker queue isolates cancellation and ignores stale or mismatched replies", async () => {
  const { client, workers } = harness();
  const a = client.request({ type: "node" }),
    b = client.request({ type: "cards" });
  const rejected = assert.rejects(a.promise, { name: "AbortError" });
  a.cancel();
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  let done = false;
  b.promise.then(() => {
    done = true;
  });
  workers[0].reply("stale");
  workers[1].reply("wrong ID", -1);
  await Promise.resolve();
  assert.equal(done, false);
  workers[1].reply("correct");
  assert.equal(await b.promise, "correct");
  const c = client.request({ type: "node" }),
    d = client.request({ type: "cards" });
  const cancelled = assert.rejects(d.promise, { name: "AbortError" });
  d.cancel();
  await cancelled;
  assert.equal(
    workers[1].terminated,
    false,
    "Queued cancellation preserves active work/cache",
  );
  workers[1].reply("active");
  assert.equal(await c.promise, "active");
  client.dispose();
  assert.equal(workers[1].terminated, true);
  await assert.rejects(client.request({}).promise, { name: "AbortError" });
});
test("analysis failures and navigation cancellation reject every pending request and permit recovery", async () => {
  const { client, workers } = harness();
  const first = client.request({}),
    next = client.request({});
  const failed = assert.rejects(first.promise, /crashed/);
  workers[0].onerror({ message: "crashed" });
  await failed;
  assert.equal(workers[0].terminated, true);
  workers[1].reply("recovered");
  assert.equal(await next.promise, "recovered");
  const a = client.request({}),
    b = client.request({});
  const rejects = [a, b].map((job) =>
    assert.rejects(job.promise, { name: "AbortError" }),
  );
  client.cancelAll();
  await Promise.all(rejects);
  assert.equal(
    workers.length,
    2,
    "Navigation does not start an outgoing queued request",
  );
  const fresh = client.request({});
  workers[2].reply("new view");
  assert.equal(await fresh.promise, "new view");
  client.dispose();
  const denied = createAnalysisClient(() => {
    throw Error("Worker unavailable");
  });
  await assert.rejects(denied.request({}).promise, /Worker unavailable/);
  denied.dispose();
});

test("an idle worker crash is replaced and report errors do not strand the queue", async () => {
  const { client, workers } = harness();
  const first = client.request({});
  workers[0].reply("ready");
  await first.promise;
  workers[0].onerror({ message: "idle crash" });
  assert.equal(workers[0].terminated, true);
  const bad = client.request({}),
    next = client.request({});
  const rejected = assert.rejects(bad.promise, /Analysis failed/);
  workers[1].onmessage({ data: { id: workers[1].sent[0].id, error: "" } });
  await rejected;
  workers[1].reply("next");
  assert.equal(await next.promise, "next");
  client.dispose();
  const uncloneable = createAnalysisClient(() => ({
    postMessage() {
      throw Error("Could not clone");
    },
    terminate() {},
  }));
  await assert.rejects(uncloneable.request({}).promise, /Could not clone/);
  uncloneable.dispose();
});
