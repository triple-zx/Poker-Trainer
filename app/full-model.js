import { validate, cardName } from "./engine.js";
import { fullCandidates } from "./full-sizing.js";

export const actionKey = (a) =>
  a.kind + (a.amount === undefined ? "" : ":" + a.amount);
export function childPath(path, node, choice) {
  return (
    path +
    (node.type === "chance"
      ? "/c:" + cardName(Number(choice))
      : "/a:" + actionKey(node.actions[choice]))
  );
}
// Range order matters: saved policy rows use these exact indices.
export function modelBasis(s) {
  const g = validate(s);
  return JSON.stringify({
    board: g.board ?? s.flop,
    ranges: [g.hero, g.villain].map((range) =>
      range.map((h) => [h.cards, h.weight]),
    ),
    pot: s.pot,
    stack: s.stack,
    rake: s.rake,
    cap: s.cap,
    candidates: fullCandidates(s),
  });
}
const object = (x) => x && typeof x === "object" && !Array.isArray(x);
export function validateFullModel(s) {
  if (!s.fullModel) return;
  const m = s.fullModel;
  if (
    !object(m) ||
    !object(m.locks) ||
    Object.keys(m.locks).length > 64 ||
    JSON.stringify(m).length > 50000
  )
    throw Error("Opponent edits support up to 64 decisions and 50 KB");
  if (m.basis !== modelBasis(s))
    throw Error(
      "Opponent edits belong to a different tree. Clear node edits or restore the previous board, ranges and sizes.",
    );
  for (const [path, rows] of Object.entries(m.locks)) {
    if (!path.startsWith("root/") || !object(rows) || !Object.keys(rows).length)
      throw Error("Invalid opponent decision edit");
    for (const row of Object.values(rows)) {
      if (
        !object(row) ||
        !Object.keys(row).length ||
        Object.values(row).some((p) => !Number.isFinite(p) || p < 0 || p > 1) ||
        Math.abs(Object.values(row).reduce((a, b) => a + b, 0) - 1) > 1e-8
      )
        throw Error("Each opponent action distribution must total 100%");
    }
  }
}
// Resolve only edited paths; no strings or extra maps on the other tree nodes.
export function modelLocks(root, s) {
  validateFullModel(s);
  const locks = new WeakMap(),
    g = validate(s);
  for (const [path, rows] of Object.entries(s.fullModel?.locks || {})) {
    let node = root;
    for (const step of path.split("/").slice(1)) {
      if (node?.type === "chance") {
        const card = Object.keys(node.children).find(
          (c) => "c:" + cardName(Number(c)) === step,
        );
        node = node.children[card];
      } else if (node?.type === "action") {
        node =
          node.children[
            node.actions.findIndex((a) => "a:" + actionKey(a) === step)
          ];
      } else node = null;
    }
    if (node?.type !== "action" || node.player !== 1)
      throw Error(
        "Opponent edit refers to an unknown or non-opponent decision",
      );
    const mapped = new Map();
    for (const [combo, row] of Object.entries(rows)) {
      const index = g.villain.findIndex((h) => h.label === combo);
      if (index < 0 || !node.policy[index])
        throw Error("Opponent edit uses an unavailable private combination");
      if (
        Object.keys(row).length !== node.actions.length ||
        node.actions.some((a) => !Object.hasOwn(row, actionKey(a)))
      )
        throw Error(
          "Opponent edit must specify every legal action at this decision",
        );
      mapped.set(
        index,
        node.actions.map((a) => row[actionKey(a)]),
      );
    }
    locks.set(node, mapped);
  }
  return locks;
}
export function editFullModel(s, path, combo, policy) {
  const next = structuredClone(s);
  next.fullModel ||= { basis: modelBasis(s), locks: {} };
  const locks = next.fullModel.locks;
  if (policy) {
    locks[path] ||= {};
    locks[path][combo] = policy;
  } else if (locks[path]) {
    delete locks[path][combo];
    if (!Object.keys(locks[path]).length) delete locks[path];
  }
  if (!Object.keys(locks).length) delete next.fullModel;
  validateFullModel(next);
  return next;
}
