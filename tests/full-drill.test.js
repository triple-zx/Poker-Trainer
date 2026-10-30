import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, cards } from "../app/engine.js";
import { initialState, transition, nextStreet } from "../app/full-game.js";
import { FullSession, drillContext } from "../app/full-session.js";

function fixture() {
  const scenario = {
    ...DEFAULT,
    game: "full",
    hero: "AhKh,9h8h",
    villain: "QcQd",
    pot: 10,
    stack: 15,
  };
  const root = initialState(scenario);
  const add = (node, actions, policies) => {
    node.actions = actions;
    node.policy = policies;
    node.adjusted = structuredClone(policies);
    node.model = structuredClone(policies);
    node.ev = policies.map((row) => (row ? actions.map((_, i) => i) : null));
    node.children = actions.map((action) => transition(scenario, node, action));
    return node.children;
  };
  const [opponent] = add(
    root,
    [{ kind: "CHECK" }, { kind: "BET", amount: 5 }],
    [
      [0.25, 0.75],
      [0.75, 0.25],
    ],
  );
  root.adjusted = [
    [0.8, 0.2],
    [0.2, 0.8],
  ];
  const [chance] = add(opponent, [{ kind: "CHECK" }], [[1]]);
  const turnCard = cards("3d")[0];
  const turn = nextStreet(chance, turnCard);
  chance.children = { [turnCard]: turn };
  const [turnOpponent] = add(turn, [{ kind: "CHECK" }], [[1], [1]]);
  const [facingBet] = add(turnOpponent, [{ kind: "BET", amount: 5 }], [[1]]);
  const [, riverChance] = add(
    facingBet,
    [{ kind: "FOLD" }, { kind: "CALL" }, { kind: "RAISE", amount: 10 }],
    [
      [0.1, 0.6, 0.3],
      [0.1, 0.6, 0.3],
    ],
  );
  facingBet.ev = [
    [0, 1, 3],
    [1, 2, 4],
  ];
  const riverCard = cards("9h")[0];
  const river = nextStreet(riverChance, riverCard);
  riverChance.children = { [riverCard]: river };
  add(
    river,
    [{ kind: "CHECK" }, { kind: "BET", amount: 10 }],
    [[0.5, 0.5], null],
  );
  const path = "root/a:CHECK/a:CHECK/c:3d/a:CHECK/a:BET:5";
  return {
    result: { full: true, ready: true, scenario, root },
    path,
    facingBet,
    river,
  };
}

test("turn drill samples action-conditioned hands, replays context and grades one choice only", () => {
  const { result, path } = fixture();
  const sampled = [];
  for (let i = 0; i < 100; i++) {
    const session = new FullSession(result, null, () => (i + 0.5) / 100, {
      path,
      profile: "model",
    });
    sampled.push(session.deal.i);
    assert.equal(session.decisions.length, 0);
    assert.equal(session.intro.length, 6);
    assert.deepEqual(
      session.intro.map((e) => e.board.length),
      [3, 3, 3, 4, 4, 4],
    );
    assert.equal(session.intro.at(-1).pot, 15);
    assert.equal(session.intro.at(-1).text, "Opponent · Bet 5 bb");
    assert.deepEqual(session.deal.runout, []);
    assert.equal(session.advance(), null);
    session.choose(2); // Raise remains offered even when another size/menu is preferred.
    assert.equal(session.finished, true);
    assert.equal(session.decisions.length, 1);
    assert.equal(session.decisions[0].choices.length, 3);
    assert.equal(session.decisions[0].loss, 0);
    assert.equal(session.node.board.length, 4);
    assert.equal(session.advance(), null);
    assert.equal(session.events.length, 7);
    assert.throws(() => session.choose(0), /Invalid/);
  }
  assert.equal(sampled.filter((i) => i === 0).length, 80);
  const baseline = new FullSession(result, null, () => 0.5, {
    path,
    profile: "baseline",
  });
  assert.equal(baseline.deal.i, 1);
  baseline.choose(1);
  assert.equal(baseline.decisions[0].loss, 2);
});

test("river drills condition on board removal without playing or scoring the earlier streets", () => {
  const { result, path, river } = fixture();
  for (const roll of [0, 0.5, 0.999]) {
    const session = new FullSession(result, null, () => roll, {
      path: path + "/a:CALL/c:9h",
      profile: "baseline",
    });
    assert.equal(session.node, river);
    assert.equal(session.deal.i, 0); // 9h8h cannot coexist with the river.
    assert.equal(session.decisions.length, 0);
    assert.equal(session.intro.at(-1).text, "River");
    session.choose(0);
    assert.equal(session.finished, true);
    assert.equal(session.decisions.length, 1);
    assert.equal(session.decisions[0].street, "River");
    assert.equal(session.decisions[0].loss, 1);
    assert.ok(!session.events.some((e) => /win|Split/.test(e.text)));
  }
});

test("drills reject opponent/chance nodes, unreachable profiles and missing feedback", () => {
  const { result, path, facingBet } = fixture();
  assert.throws(
    () => drillContext(result, { path: "root/a:CHECK", profile: "model" }),
    /your decisions/,
  );
  assert.throws(
    () =>
      drillContext(result, { path: "root/a:CHECK/a:CHECK", profile: "model" }),
    /your decisions/,
  );
  result.root.adjusted = [
    [0, 1],
    [0, 1],
  ];
  assert.throws(
    () => drillContext(result, { path, profile: "model" }),
    /zero probability/,
  );
  assert.equal(
    drillContext(result, { path, profile: "baseline" }).node,
    facingBet,
  );
  facingBet.ev[0] = null;
  assert.throws(
    () => drillContext(result, { path, profile: "baseline" }),
    /feedback/,
  );
  assert.throws(
    () =>
      new FullSession({ ...result, ready: false }, null, Math.random, {
        path,
        profile: "baseline",
      }),
    /complete solution/,
  );
});

test("in-position drills replay the opponent opening and retain logical hero scoring", () => {
  const scenario = {
    ...DEFAULT,
    game: "full",
    heroPosition: "ip",
    hero: "AhKh",
    villain: "QcQd",
    pot: 10,
    stack: 15,
  };
  const root = initialState(scenario);
  root.actions = [{ kind: "CHECK" }];
  root.policy = root.model = [[1]];
  const hero = transition(scenario, root, root.actions[0]);
  root.children = [hero];
  hero.actions = [{ kind: "CHECK" }, { kind: "BET", amount: 5 }];
  hero.policy = hero.adjusted = [[0.5, 0.5]];
  hero.ev = [[4, 5]];
  hero.children = hero.actions.map((a) => transition(scenario, hero, a));
  const session = new FullSession(
    { full: true, ready: true, scenario, root },
    null,
    () => 0.5,
    { path: "root/a:CHECK", profile: "model" },
  );
  assert.equal(session.node.player, 0);
  assert.equal(session.intro.at(-1).text, "Opponent · Check");
  session.choose(1);
  assert.equal(session.finished, true);
  assert.equal(session.decisions[0].loss, 0);
  assert.equal(session.node.player, 1);
  assert.deepEqual(session.node.spent, [5, 0]);
});
