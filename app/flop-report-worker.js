import { compareSavedFlops } from "./flop-report.js";
import { solutionStore } from "./solution-store.js";
self.onmessage = async ({ data }) => {
  try {
    const report = await compareSavedFlops(
      data,
      (name) => solutionStore("library:" + name),
      (progress) => self.postMessage({ type: "progress", ...progress }),
    );
    self.postMessage({ type: "complete", report });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
