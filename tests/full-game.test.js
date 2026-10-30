import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards, equity } from "../app/engine.js";
import {
  initialState,
  transition,
  nextStreet,
  boardEquity,
  evaluateFull,
  validateFull,
  convertFull,
} from "../app/full-game.js";
import { commands } from "../native/adapter.mjs";
import { FullSession } from "../app/full-session.js";
import { editFullModel, modelLocks } from "../app/full-model.js";
const s = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh",
  villain: "QcQd",
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((k) => [k, { bet: [33, 75], raise: [100] }]),
  ),
};
test("full-hand actions enforce calls, check-raises, minimum raises and street resets", () => {
  let state = initialState(s);
  assert.throws(() => transition(s, state, { kind: "CALL" }));
  state = transition(s, state, { kind: "CHECK" });
  state = transition(s, state, { kind: "BET", amount: 3 });
  assert.throws(() => transition(s, state, { kind: "CHECK" }));
  assert.throws(() => transition(s, state, { kind: "RAISE", amount: 5 }));
  state = transition(s, state, { kind: "RAISE", amount: 6 });
  assert.deepEqual(state.spent, [6, 3]);
  state = transition(s, state, { kind: "CALL" });
  assert.equal(state.type, "chance");
  state = nextStreet(state, cards("Td")[0]);
  assert.deepEqual(state.street, [0, 0]);
  assert.deepEqual(state.spent, [6, 6]);
  assert.equal(state.player, 0);
  state = transition(s, state, { kind: "BET", amount: 9 });
  state = transition(s, state, { kind: "CALL" });
  assert.equal(state.type, "terminal");
  assert.equal(state.winner, -1);
});
test("full trees request all streets and validate resource bounds", () => {
  assert.match(commands(s), /set_bet_sizes ip,river,raise,100/);
  assert.match(commands(s), /set_dump_rounds 3/);
  assert.throws(() => validateFull({ ...s, stack: 100 }));
  assert.throws(() => validateFull({ ...s, betting: {} }));
  assert.throws(() => convertFull({}, s));
});
test("all-in equity agrees with exhaustive flop enumeration and handles a river tie", () => {
  const h = cards("AhKh"),
    v = cards("QcQd"),
    b = cards(s.flop);
  assert.ok(Math.abs(boardEquity(h, v, b) - equity(h, v, b)) < 1e-12);
  assert.equal(
    boardEquity(cards("2c3c"), cards("4d5d"), cards("AsKsQsJsTs")),
    0.5,
  );
});
test("best response aggregates hidden hands before choosing an action", () => {
  const scenario = { ...s, hero: "AhKh", villain: "QcQd,AcAd", stack: 15 };
  // One river infoset: hero must choose the same action against both hidden hands.
  const board = cards("As7d2c8h9s");
  const root = {
    type: "action",
    player: 0,
    board,
    spent: [0, 0],
    actions: [{ kind: "CHECK" }, { kind: "BET", amount: 15 }],
    policy: [[0.5, 0.5]],
    children: [
      { type: "terminal", board, spent: [0, 0], winner: -1 },
      {
        type: "action",
        player: 1,
        board,
        spent: [15, 0],
        actions: [{ kind: "CALL" }, { kind: "FOLD" }],
        policy: [
          [1, 0],
          [1, 0],
        ],
        children: [
          { type: "terminal", board, spent: [15, 15], winner: -1 },
          { type: "terminal", board, spent: [15, 0], winner: 0 },
        ],
      },
    ],
  };
  const r = evaluateFull({ root, nodes: 5 }, scenario);
  assert.deepEqual(root.ev[0], [5, 5]);
  assert.equal(r.modelEV, 5); // Clairvoyant per-pair maximization would incorrectly give 12.5.
  const edited = editFullModel(scenario, "root/a:BET:15", "QcQd", {
    CALL: 0,
    FOLD: 1,
  });
  const updated = evaluateFull({ root, nodes: 5 }, edited);
  assert.equal(updated.gap, r.gap);
  assert.deepEqual(root.children[1].model, [
    [0, 1],
    [1, 0],
  ]);
  assert.deepEqual(root.ev[0], [5, -2.5]);
  root.children[1].policy[0] = null;
  assert.throws(() => modelLocks(root, edited), /unavailable/);
});
test("training pauses for each later-street decision and reveals no unused cards on a fold", () => {
  const make = (state, runout) => {
    if (state.type === "terminal") return state;
    if (state.type === "chance") {
      const c = runout[state.board.length - 3];
      return {
        ...state,
        children: { [c]: make(nextStreet(state, c), runout) },
      };
    }
    const actions = [{ kind: "CHECK" }];
    return {
      ...state,
      actions,
      policy: [[1]],
      ev: [[0]],
      adjusted: [[1]],
      children: [make(transition(s, state, actions[0]), runout)],
    };
  };
  const seed = new FullSession(
    { full: true, ready: true, scenario: s, root: initialState(s) },
    null,
    () => 0.5,
  );
  const root = make(initialState(s), seed.deal.runout);
  const session = new FullSession(
    { full: true, ready: true, scenario: s, root },
    null,
    () => 0.5,
  );
  for (const street of ["Flop", "Turn", "River"]) {
    assert.equal(session.advance(), null);
    session.choose(0);
    while (
      !session.finished &&
      !(session.node.type === "action" && session.node.player === 0)
    )
      session.advance();
    assert.equal(session.decisions.at(-1).street, street);
  }
  assert.equal(session.finished, true);
  assert.equal(session.node.board.length, 5);
  assert.equal(session.decisions.length, 3);
  const folded = new FullSession(
    {
      full: true,
      ready: true,
      scenario: s,
      root: { ...initialState(s), type: "terminal", winner: 0 },
    },
    null,
    () => 0.5,
  );
  folded.advance();
  assert.equal(folded.node.board.length, 3);
  assert.equal(folded.events.at(-1).board.length, 3);
});
