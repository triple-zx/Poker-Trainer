import { spawnSync } from "node:child_process";
import { mkdir, copyFile, access } from "node:fs/promises";
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
} else
  console.log(
    "Reusing existing native source. Remove or rename .native manually to start over.",
  );
command("cmake", [
  "-S",
  source,
  "-B",
  path.join(source, "build"),
  "-DCMAKE_BUILD_TYPE=Release",
  "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
  ...(process.platform === "win32" ? ["-G", "MinGW Makefiles"] : []),
]);
command("cmake", [
  "--build",
  path.join(source, "build"),
  "--target",
  "console_solver",
  "--parallel",
  "4",
]);
console.log("Native solver ready. Restart the trainer.");
