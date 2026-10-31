import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

test("release packaging requires both platforms and hashes only expected versioned assets", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "poker-release-test-"),
  );
  t.after(async () => {
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("poker-release-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  const run = (...options) =>
    spawnSync(
      process.execPath,
      ["scripts/verify-release.mjs", directory, "0.3.0", ...options],
      { encoding: "utf8", windowsHide: true },
    );
  assert.notEqual(run().status, 0);
  const payload = Buffer.alloc(1000001, 42);
  const names = [
    "x64-Setup.exe",
    "x64-Portable.exe",
    "mac-arm64.dmg",
    "mac-arm64.zip",
  ].map((x) => "Poker-Trainer-0.3.0-" + x);
  await writeFile(path.join(directory, names[0]), payload);
  assert.notEqual(run("--windows-only").status, 0);
  await writeFile(path.join(directory, names[1]), payload);
  assert.notEqual(run().status, 0, "Default gate still requires macOS");
  assert.equal(run("--windows-only").status, 0);
  assert.equal(
    run("--windows-only").status,
    0,
    "Checksum generation is repeatable",
  );
  assert.notEqual(run("--skip-validation").status, 0);
  assert.notEqual(run("--windows-only", "extra").status, 0);
  await writeFile(path.join(directory, names[1]), Buffer.alloc(100));
  assert.match(run("--windows-only").stderr, /truncated desktop package/);
  for (const name of names)
    await writeFile(path.join(directory, name), payload);
  assert.match(run("--windows-only").stderr, /Unexpected release asset/);
  await rm(path.join(directory, names[3]));
  const wrongArch = "Poker-Trainer-0.3.0-mac-x64.zip";
  await writeFile(path.join(directory, wrongArch), payload);
  assert.notEqual(run().status, 0, "macOS pair must match architecture");
  await rm(path.join(directory, wrongArch));
  await writeFile(path.join(directory, names[3]), payload);
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  const checksums = await readFile(
    path.join(directory, "SHA256SUMS.txt"),
    "utf8",
  );
  assert.equal(checksums.trim().split("\n").length, 4);
  assert.ok(
    checksums.includes(
      createHash("sha256").update(payload).digest("hex") + "  " + names[0],
    ),
  );
  await rm(path.join(directory, "SHA256SUMS.txt"));
  await writeFile(
    path.join(directory, "Poker-Trainer-0.2.0-x64-Setup.exe"),
    payload,
  );
  const mismatch = run();
  assert.notEqual(mismatch.status, 0);
  assert.match(
    mismatch.stderr,
    /Unexpected release asset Poker-Trainer-0\.2\.0/,
  );
});
