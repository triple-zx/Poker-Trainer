import {
  PACKAGE_LIMIT,
  solutionPackage,
  restorePackage,
} from "./solution-package.js";
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
    } else if (data.type === "import") {
      if (!data.file || data.file.size > PACKAGE_LIMIT)
        throw Error("Package exceeds 128 MiB");
      const parsed = JSON.parse(await data.file.text());
      if (parsed.schema === 1 && data.file.size > 1000000)
        throw Error("Scenario package exceeds 1 MB");
      self.postMessage({ type: "imported", ...restorePackage(parsed) });
    } else throw Error("Unsupported package operation");
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
