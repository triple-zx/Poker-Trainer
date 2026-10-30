import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const file of [
  "server.mjs",
  ...["app", "native", "scripts"].flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => /\.(mjs|js)$/.test(f))
      .map((f) => dir + "/" + f),
  ),
]) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
