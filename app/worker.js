import { validate, equity, solve } from "./engine.js";
import { solveSized } from "./sizing.js";
import { convertFull, evaluateFull } from "./full-game.js";
import { matrixTransfers } from "./full-matrix.js";
self.onmessage = ({ data }) => {
  try {
    if (data.scenario.game === "full") {
      if (!data.nativeProfile?.full)
        throw Error("Full-hand training requires the native engine");
      const tree = convertFull(data.nativeProfile.raw, data.scenario);
      // This worker owns its cloned native export; drop it before evaluating
      // the validated tree so both large representations need not stay live.
      data.nativeProfile.raw = null;
      const result = evaluateFull(tree, data.scenario);
      self.postMessage(
        { type: "result", result },
        matrixTransfers(result.root),
      );
      return;
    }
    const g = validate(data.scenario),
      eq = data.checkpoint || [];
    if (
      !Array.isArray(eq) ||
      eq.length > g.pairs.length ||
      eq.some((e) => !Number.isFinite(e) || e < 0 || e > 1)
    )
      throw Error("Invalid checkpoint");
    for (let k = eq.length; k < g.pairs.length; k++) {
      const p = g.pairs[k];
      eq.push(equity(g.hero[p.i].cards, g.villain[p.j].cards, g.board));
      self.postMessage({
        type: "progress",
        eq: [...eq],
        done: k + 1,
        total: g.pairs.length,
      });
    }
    self.postMessage({
      type: "result",
      result: (data.scenario.sizing ? solveSized : solve)(
        data.scenario,
        eq,
        data.nativeProfile,
      ),
    });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
