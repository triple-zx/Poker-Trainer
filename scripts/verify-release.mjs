import { readdir, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const [directory, version, mode, ...extra] = process.argv.slice(2);
if (
  !directory ||
  !/^\d+\.\d+\.\d+$/.test(version || "") ||
  (mode !== undefined && mode !== "--windows-only") ||
  extra.length
)
  throw Error(
    "Expected package directory, version and optional --windows-only",
  );
const windowsOnly = mode === "--windows-only";
const files = (await readdir(directory))
  .filter((name) => name !== "SHA256SUMS.txt")
  .sort();
const required = [
  `Poker-Trainer-${version}-x64-Setup.exe`,
  `Poker-Trainer-${version}-x64-Portable.exe`,
];
if (
  required.some((name) => !files.includes(name)) ||
  (!windowsOnly &&
    !["arm64", "x64"].some((arch) =>
      ["dmg", "zip"].every((ext) =>
        files.includes(`Poker-Trainer-${version}-mac-${arch}.${ext}`),
      ),
    ))
)
  throw Error(
    windowsOnly
      ? "Both Windows packages are required"
      : "Both Windows and matching macOS packages are required",
  );
const checksums = [];
for (const file of files) {
  if (
    !required.includes(file) &&
    (windowsOnly ||
      !new RegExp(
        "^Poker-Trainer-" +
          version.replaceAll(".", "\\.") +
          "-mac-(arm64|x64)\\.(dmg|zip)$",
      ).test(file))
  )
    throw Error("Unexpected release asset " + file);
  const filename = path.join(directory, file);
  const info = await stat(filename);
  if (!info.isFile() || info.size < 1000000)
    throw Error("Missing or truncated desktop package");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  checksums.push(hash.digest("hex") + "  " + file);
}
await writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
console.log(
  "Verified " +
    files.length +
    (windowsOnly ? " Windows preview" : " desktop") +
    " packages and wrote SHA256SUMS.txt",
);
