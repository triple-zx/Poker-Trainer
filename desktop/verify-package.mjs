import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extractFile } from "@electron/asar";
import path from "node:path";
const folder = path.resolve("release");
const candidates =
  process.platform === "win32"
    ? [path.join(folder, "win-unpacked", "Poker Trainer.exe")]
    : readdirSync(folder)
        .filter((name) => name.startsWith("mac"))
        .map((name) =>
          path.join(
            folder,
            name,
            "Poker Trainer.app",
            "Contents",
            "MacOS",
            "Poker Trainer",
          ),
        );
const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : candidates.find(existsSync);
if (!executable) throw Error("Packaged application not found");
const resources =
  process.platform === "win32"
    ? path.join(path.dirname(executable), "resources")
    : path.resolve(path.dirname(executable), "../Resources");
const archive = path.join(resources, "app.asar");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (
  JSON.parse(extractFile(archive, "package.json").toString()).version !==
  version
)
  throw Error("Packaged version does not match the release source");
const sourceFiles = [
  ...readdirSync("app", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(process.cwd(), path.join(entry.parentPath, entry.name)),
    ),
  "desktop/main.mjs",
  "desktop/preload.cjs",
  "desktop/protocol.mjs",
  "native/adapter.mjs",
  "native/checkpoint-job.mjs",
];
for (const file of sourceFiles)
  if (
    !readFileSync(file).equals(extractFile(archive, file.replaceAll("\\", "/")))
  )
    throw Error("Packaged source differs: " + file);
const nativeRoot = path.join(resources, "native-engine");
const nativeManifest = JSON.parse(
  readFileSync(path.join(nativeRoot, "build.json"), "utf8"),
);
const digest = createHash("sha256")
  .update(
    readFileSync(
      path.join(
        nativeRoot,
        process.platform === "win32" ? "console_solver.exe" : "console_solver",
      ),
    ),
  )
  .digest("hex");
if (nativeManifest.sha256 !== digest)
  throw Error("Packaged native engine hash mismatch");
for (const name of [
  "Checkpoint.cpp",
  "CompatMutex.h",
  "HoldemEvaluator.h",
  "CMakeLists.txt",
  "texassolver.patch",
  "TEXASSOLVER-LICENSE",
])
  if (
    !readFileSync(path.join("native", name)).equals(
      readFileSync(path.join(nativeRoot, "source", name)),
    )
  )
    throw Error("Packaged native source differs: " + name);
const result = spawnSync(executable, ["--smoke-test"], {
  encoding: "utf8",
  windowsHide: true,
  timeout: 60000,
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) throw result.error;
if (
  result.status !== 0 ||
  !result.stdout.includes('"desktopLoaded":true') ||
  !result.stdout.includes('"native":true') ||
  !result.stdout.includes('"nativeSolve":true') ||
  !result.stdout.includes('"nativeCheckpoints":true') ||
  !result.stdout.includes('"packageWorker":true') ||
  !result.stdout.includes('"flopReportWorker":true') ||
  !result.stdout.includes('"nodeReportWorker":true') ||
  !result.stdout.includes('"version":' + JSON.stringify(version))
)
  throw Error("Packaged app smoke test failed");
