import { nodePolicy } from "./full-node-analysis.js";
import { childPath } from "./full-model.js";
import { matrixRows } from "./full-matrix.js";

// Only the selected history and (for a card report) its immediate children are
// needed. Do not clone the full tree or transfer the renderer's shared arenas.
export function analysisRequest(result, path, profile, type = "node") {
  if (!["node", "cards"].includes(type))
    throw Error("Unknown analysis request");
  if (!["baseline", "model"].includes(profile))
    throw Error("Unknown analysis profile");
  if (path !== "root" && !path.startsWith("root/"))
    throw Error("Invalid analysis path");
  function copy(node) {
    const out = {
      type: node.type,
      board: node.board,
      spent: node.spent,
      street: node.street,
      player: node.player,
      actions: node.actions,
      winner: node.winner,
    };
    if (node.type === "action") {
      const policy = nodePolicy(node, profile);
      if (!policy)
        throw Error("Evaluate this solution before inspecting its model");
      // A typed view would clone its whole arena, including unrelated nodes.
      const rows = matrixRows(policy).map((row) => row?.slice() ?? null);
      Object.assign(out, {
        policy: rows,
        model: rows,
        adjusted: rows,
        children: [],
      });
    } else if (node.type === "chance") out.children = {};
    return out;
  }
  let node = result.root,
    current = "root";
  const root = copy(node);
  let projected = root;
  for (const step of path.split("/").slice(1)) {
    const choices =
      node.type === "action"
        ? node.actions.map((_, i) => i)
        : node.type === "chance"
          ? Object.keys(node.children)
          : [];
    const choice = choices.find(
      (c) => childPath(current, node, c).split("/").at(-1) === step,
    );
    if (choice === undefined) throw Error("Unknown analysis history");
    current = childPath(current, node, choice);
    node = node.children[choice];
    projected.children[choice] = copy(node);
    projected = projected.children[choice];
  }
  if (type === "cards") {
    if (node.type !== "chance")
      throw Error("Choose a turn or river deal in the saved tree");
    for (const [card, child] of Object.entries(node.children))
      projected.children[card] = copy(child);
  }
  return { type, path, profile, result: { scenario: result.scenario, root } };
}
