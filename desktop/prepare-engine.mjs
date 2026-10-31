import { copyFile, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { binary, available } from "../native/adapter.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  stage = path.resolve(root, ".desktop-engine"),
  source = path.dirname(path.dirname(binary)),
  pin = "6dfb65b4d7ed081da509e8d8c3d82138c4708267";
function command(name, args, cwd = root) {
  const r = spawnSync(name, args, { cwd, encoding: "utf8", windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(name + ": " + r.stderr);
  return r.stdout.trim();
}
if (!(await available()))
  throw Error("Build the native solver first: node native/setup.mjs");
if (command("git", ["rev-parse", "HEAD"], source) !== pin)
  throw Error("Native source revision does not match the packaged engine");
if (
  path.dirname(stage) !== path.resolve(root) ||
  path.basename(stage) !== ".desktop-engine"
)
  throw Error("Invalid staging directory");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "source"), { recursive: true });
await mkdir(path.join(stage, "resources"), { recursive: true });
const stagedBinary = path.join(stage, path.basename(binary));
await copyFile(binary, stagedBinary);
command(
  "git",
  [
    "archive",
    "--format=tar.gz",
    "--output=" + path.join(stage, "source", "texassolver-console.tar.gz"),
    pin,
    "include",
    "src",
    "ext",
    "CMakeLists.txt",
    "LICENSE",
  ],
  source,
);
for (const name of [
  "texassolver.patch",
  "CompatMutex.h",
  "HoldemEvaluator.h",
  "Checkpoint.cpp",
  "CMakeLists.txt",
  "TEXASSOLVER-LICENSE",
])
  await copyFile(
    path.join(root, "native", name),
    path.join(stage, "source", name),
  );
await copyFile(
  path.join(root, "native", "TEXASSOLVER-LICENSE"),
  path.join(stage, "LICENSE.txt"),
);
if (process.platform === "darwin") {
  const prefix =
      process.env.LIBOMP_PREFIX || command("brew", ["--prefix", "libomp"]),
    lib = path.join(prefix, "lib", "libomp.dylib");
  await copyFile(lib, path.join(stage, "libomp.dylib"));
  const dependency = command("otool", ["-L", stagedBinary])
    .split("\n")
    .map((line) => line.trim().split(" (")[0])
    .find((line) => line.endsWith("/libomp.dylib"));
  if (!dependency)
    throw Error("Native binary does not link the expected OpenMP runtime");
  command("install_name_tool", [
    "-change",
    dependency,
    "@executable_path/libomp.dylib",
    stagedBinary,
  ]);
  command("codesign", ["--force", "--sign", "-", stagedBinary]);
  const license = await fetch(
    "https://raw.githubusercontent.com/llvm/llvm-project/main/openmp/LICENSE.TXT",
  );
  if (!license.ok) throw Error("Could not obtain the OpenMP runtime license");
  await writeFile(path.join(stage, "OpenMP-LICENSE.txt"), await license.text());
}
await writeFile(
  path.join(stage, "source", "BUILD.md"),
  `# Corresponding native source\n\nUpstream console commit: ${pin}\n\nExtract texassolver-console.tar.gz into a source folder. Apply texassolver.patch from that folder with git apply. Copy CompatMutex.h and HoldemEvaluator.h into its include folder. Use the CMakeLists.txt supplied beside this document (not the archived original) with -DTEXASSOLVER_SOURCE pointing to the extracted folder. Build Release with a C++17 compiler and OpenMP; target console_solver. The dictionary data is unnecessary for the direct evaluator used in this build.\n\nThe source patch and evaluator are included in full. The app's JavaScript source is distributed unminified in app.asar. The upstream license is included beside the executable and in this directory.\n`,
);
await writeFile(
  path.join(stage, "build.json"),
  JSON.stringify(
    {
      upstream: pin,
      platform: process.platform,
      arch: process.arch,
      sha256: createHash("sha256")
        .update(await readFile(stagedBinary))
        .digest("hex"),
      evaluator: "direct",
      source: "source/texassolver-console.tar.gz",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Desktop native engine staged with corresponding source and license.",
);
