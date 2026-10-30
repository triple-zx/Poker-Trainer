import { validate, equity, solve } from "./engine.js";
import { solveSized } from "./sizing.js";
import { convertFull, evaluateFull } from "./full-game.js";
self.onmessage = ({ data }) => {
  try {
    if (data.scenario.game === "full") {
      if (!data.nativeProfile?.full)
        throw Error("Full-hand training requires the native engine");
      self.postMessage({
        type: "result",
        result: evaluateFull(
          convertFull(data.nativeProfile.raw, data.scenario),
          data.scenario,
        ),
      });
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
