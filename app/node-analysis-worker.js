import { analyzeNode } from "./full-node-analysis.js";
import { compareNextCards } from "./full-card-analysis.js";
const cache = new Map();
self.onmessage = ({ data }) => {
  try {
    if (!Number.isSafeInteger(data.id))
      throw Error("Invalid analysis request ID");
    const analyze =
      data.type === "node"
        ? analyzeNode
        : data.type === "cards"
          ? compareNextCards
          : null;
    if (!analyze) throw Error("Unknown analysis request");
    const report = analyze(data.result, data.path, data.profile, cache);
    self.postMessage({ id: data.id, report });
  } catch (error) {
    self.postMessage({ id: data.id, error: error?.message || String(error) });
  }
};
