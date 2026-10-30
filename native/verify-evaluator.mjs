import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { resources } from "./adapter.mjs";
const directory = await mkdtemp(path.join(os.tmpdir(), "poker-evaluator-"));
const executable = path.join(
  directory,
  process.platform === "win32" ? "verify.exe" : "verify",
);
function command(name, args) {
  const result = spawnSync(name, args, { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Evaluator verification failed");
}
try {
  command(process.env.CXX || "g++", [
    "-std=c++17",
    "-O3",
    fileURLToPath(new URL("./evaluator-test.cpp", import.meta.url)),
    "-o",
    executable,
  ]);
  command(executable, [path.join(resources, "compairer/card5_dic_sorted.txt")]);
} finally {
  if (
    !path
      .resolve(directory)
      .startsWith(path.resolve(os.tmpdir()) + path.sep + "poker-evaluator-")
  )
    throw Error("Unsafe cleanup path");
  await rm(directory, { recursive: true, force: true });
}
