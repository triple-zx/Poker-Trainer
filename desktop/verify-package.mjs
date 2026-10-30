import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
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
const executable = candidates.find(existsSync);
if (!executable) throw Error("Packaged application not found");
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
  !result.stdout.includes('"nativeSolve":true')
)
  throw Error("Packaged app smoke test failed");
