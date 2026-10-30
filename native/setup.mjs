import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, copyFile, access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  source = path.join(root, ".native", "TexasSolver");
const pin = "6dfb65b4d7ed081da509e8d8c3d82138c4708267";
function command(executable, args, cwd = root) {
  const r = spawnSync(executable, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(executable + " failed: " + r.status);
}
await mkdir(path.dirname(source), { recursive: true });
const fingerprint = createHash("sha256");
for (const name of ["texassolver.patch", "CompatMutex.h", "HoldemEvaluator.h"])
  fingerprint.update(await readFile(path.join(root, "native", name)));
const expected = fingerprint.digest("hex");
const marker = path.join(source, ".trainer-patch");
let exists = false;
try {
  await access(path.join(source, ".git"));
  exists = true;
} catch {}
if (!exists) {
  command("git", [
    "clone",
    "--branch",
    "console",
    "https://github.com/bupticybee/TexasSolver.git",
    source,
  ]);
  command("git", ["checkout", pin], source);
  command(
    "git",
    ["apply", path.join(root, "native", "texassolver.patch")],
    source,
  );
  await copyFile(
    path.join(root, "native", "CompatMutex.h"),
    path.join(source, "include", "CompatMutex.h"),
  );
  await copyFile(
    path.join(root, "native", "HoldemEvaluator.h"),
    path.join(source, "include", "HoldemEvaluator.h"),
  );
  await writeFile(marker, expected);
} else {
  let installed = "";
  try {
    installed = await readFile(marker, "utf8");
  } catch {}
  if (installed !== expected)
    throw Error(
      "Native source does not match this release. Rename .native and run setup again; existing files are preserved.",
    );
  console.log("Reusing the matching native source.");
}
const buildDirectory = path.join(source, "trainer-build");
const platformFlags = [];
if (process.platform === "darwin") {
  let prefix = process.env.LIBOMP_PREFIX;
  if (!prefix) {
    const found = spawnSync("brew", ["--prefix", "libomp"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (found.status === 0) prefix = found.stdout.trim();
  }
  if (!prefix)
    throw Error(
      "Install libomp with Homebrew, or set LIBOMP_PREFIX to its installation folder",
    );
  await access(path.join(prefix, "include", "omp.h"));
  await access(path.join(prefix, "lib", "libomp.dylib"));
  platformFlags.push(
    "-DOpenMP_CXX_FLAGS=-Xpreprocessor -fopenmp",
    "-DOpenMP_CXX_LIB_NAMES=omp",
    `-DOpenMP_CXX_INCLUDE_DIR=${path.join(prefix, "include")}`,
    `-DOpenMP_omp_LIBRARY=${path.join(prefix, "lib", "libomp.dylib")}`,
  );
}
command("cmake", [
  "-S",
  path.join(root, "native"),
  "-B",
  buildDirectory,
  `-DTEXASSOLVER_SOURCE=${source.replaceAll("\\", "/")}`,
  "-DCMAKE_BUILD_TYPE=Release",
  "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
  ...platformFlags,
  ...(process.platform === "win32" ? ["-G", "MinGW Makefiles"] : []),
]);
command("cmake", [
  "--build",
  buildDirectory,
  "--target",
  "console_solver",
  "--parallel",
  "4",
]);
console.log("Native solver ready. Restart the trainer.");
