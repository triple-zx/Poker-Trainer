import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const [directory, version] = process.argv.slice(2);
if (!directory || !/^\d+\.\d+\.\d+$/.test(version || ""))
  throw Error("Expected package directory and version");
const files = (await readdir(directory)).sort();
const required = [
  `Poker-Trainer-${version}-x64-Setup.exe`,
  `Poker-Trainer-${version}-x64-Portable.exe`,
];
if (
  required.some((name) => !files.includes(name)) ||
  !files.some((name) => name.includes(version) && name.endsWith(".dmg")) ||
  !files.some((name) => name.includes(version) && name.endsWith(".zip"))
)
  throw Error("Both Windows and macOS packages are required");
const checksums = [];
for (const file of files) {
  if (
    !required.includes(file) &&
    !new RegExp(
      "^Poker-Trainer-" +
        version.replaceAll(".", "\\.") +
        "-mac-(arm64|x64)\\.(dmg|zip)$",
    ).test(file)
  )
    throw Error("Unexpected release asset " + file);
  const filename = path.join(directory, file);
  if (!(await stat(filename)).isFile() || (await stat(filename)).size < 1000000)
    throw Error("Missing or truncated desktop package");
  checksums.push(
    createHash("sha256")
      .update(await readFile(filename))
      .digest("hex") +
      "  " +
      file,
  );
}
await writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
console.log(
  "Verified " + files.length + " desktop packages and wrote SHA256SUMS.txt",
);
