import {
  PACKAGE_LIMIT,
  solutionPackage,
  restorePackage,
  remodelSolution,
} from "./solution-package.js";
import { matrixTransfers } from "./full-matrix.js";
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "export") {
      const blob = new Blob([JSON.stringify(solutionPackage(data.result))], {
        type: "application/json",
      });
      if (blob.size > PACKAGE_LIMIT)
        throw Error(
          "Solution package exceeds 128 MiB; reduce the tree before sharing",
        );
      self.postMessage({ type: "exported", blob });
    } else if (data.type === "remodel") {
      const restored = remodelSolution(data.result, data.scenario);
      self.postMessage(
        {
          type: "imported",
          ...restored,
        },
        matrixTransfers(restored.result?.root),
      );
    } else if (data.type === "import") {
      if (!data.file || data.file.size > PACKAGE_LIMIT)
        throw Error("Package exceeds 128 MiB");
      const parsed = JSON.parse(await data.file.text());
      if (
        (parsed.schema === 1 || parsed.type === "poker-trainer-scenario") &&
        data.file.size > 1000000
      )
        throw Error("Scenario package exceeds 1 MB");
      const restored = restorePackage(parsed);
      self.postMessage(
        { type: "imported", ...restored },
        matrixTransfers(restored.result?.root),
      );
    } else throw Error("Unsupported package operation");
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
