import { validate, sample, rank7 } from "./engine.js";
import { fullActionLabel, streetName } from "./full-game.js";
import { nodeReach } from "./full-node-analysis.js";
import { matrixRow } from "./full-matrix.js";

export function drillContext(result, drill) {
  const context = nodeReach(result, drill.path, drill.profile);
  if (context.node.type !== "action" || context.node.player !== 0)
    throw Error("Choose one of your decisions for a drill");
  if (!context.reachable)
    throw Error(
      "This history has zero probability under the selected range profile",
    );
  for (const { i } of context.game.pairs) {
    const ev = matrixRow(context.node.ev, i),
      target = matrixRow(context.node.adjusted, i);
    if (
      !ev ||
      ev.length !== context.node.actions.length ||
      ev.some((v) => !Number.isFinite(v)) ||
      !target
    )
      throw Error(
        "This decision has no evaluated fixed-opponent feedback for every reachable hand",
      );
  }
  return context;
}

export class FullSession {
  constructor(result, sampling, rng = Math.random, drill = null) {
    if (!result.full || !result.ready)
      throw Error("A complete solution is required");
    this.result = result;
    this.g = validate(result.scenario);
    this.rng = rng;
    this.drill = drill ? { path: drill.path, profile: drill.profile } : null;
    const context = drill ? drillContext(result, drill) : null;
    if (context) {
      let draw = rng(),
        pair = context.game.pairs.at(-1);
      for (const p of context.game.pairs) {
        draw -= p.weight;
        if (draw < 0) {
          pair = p;
          break;
        }
      }
      this.deal = { ...pair, runout: [] };
    } else this.deal = sample(sampling || this.g, rng);
    this.node = result.root;
    this.events = [];
    this.decisions = [];
    this.finished = false;
    this.events.push(
      this.snapshot(streetName(this.node.board) + " · action begins"),
    );
    if (context) {
      for (const { node, choice } of context.history) {
        this.node = node.children[choice];
        this.events.push(
          this.snapshot(
            node.type === "chance"
              ? streetName(this.node.board)
              : (node.player === 0 ? "You · " : "Opponent · ") +
                  fullActionLabel(node.actions[choice], node, result.scenario),
          ),
        );
      }
    }
    this.intro = [...this.events];
  }
  snapshot(text, node = this.node) {
    return {
      text,
      board: [...node.board],
      spent: [...node.spent],
      pot: this.result.scenario.pot + node.spent[0] + node.spent[1],
    };
  }
  choose(a) {
    const node = this.node;
    if (
      this.finished ||
      node.type !== "action" ||
      !Number.isInteger(a) ||
      !node.actions[a]
    )
      throw Error("Invalid training action");
    const action = node.actions[a],
      label = fullActionLabel(action, node, this.result.scenario);
    if (node.player === 0) {
      const ev = matrixRow(node.ev, this.deal.i);
      if (!ev) throw Error("This decision has no evaluated opponent reach");
      this.decisions.push({
        path: this.events.map((e) => e.text),
        street: streetName(node.board),
        board: [...node.board],
        action: a,
        label,
        choices: node.actions.map((x) =>
          fullActionLabel(x, node, this.result.scenario),
        ),
        ev: [...ev],
        loss: Math.max(...ev) - ev[a],
        target: [...matrixRow(node.adjusted, this.deal.i)],
        retained: node.activeActions ? [...node.activeActions] : null,
      });
    }
    this.node = node.children[a];
    const event = this.snapshot(
      (node.player === 0 ? "You · " : "Opponent · ") + label,
    );
    this.events.push(event);
    if (this.drill) this.finished = true;
    return event;
  }
  advance() {
    if (this.finished) return null;
    const node = this.node;
    if (node.type === "action") {
      if (node.player === 0) return null;
      const policy = matrixRow(node.model || node.policy, this.deal.j);
      let draw = this.rng(),
        a = policy.length - 1;
      for (let i = 0; i < policy.length; i++) {
        draw -= policy[i];
        if (draw < 0) {
          a = i;
          break;
        }
      }
      return this.choose(a);
    }
    if (node.type === "chance") {
      const c = this.deal.runout[node.board.length - 3];
      this.node = node.children[c];
      if (!this.node) throw Error("Missing precomputed street");
      const event = this.snapshot(streetName(this.node.board));
      this.events.push(event);
      return event;
    }
    if (node.winner < 0 && node.board.length < 5) {
      this.node = {
        ...node,
        board: [...node.board, this.deal.runout[node.board.length - 3]],
      };
      const event = this.snapshot(
        streetName(this.node.board) + " · all-in runout",
      );
      this.events.push(event);
      return event;
    }
    let winner = node.winner;
    if (winner < 0) {
      const a = rank7([...this.g.hero[this.deal.i].cards, ...node.board]);
      const b = rank7([...this.g.villain[this.deal.j].cards, ...node.board]);
      winner = a === b ? -1 : a > b ? 0 : 1;
    }
    this.finished = true;
    const event = this.snapshot(
      winner < 0 ? "Split pot" : winner === 0 ? "You win" : "Opponent wins",
    );
    this.events.push(event);
    return event;
  }
}
