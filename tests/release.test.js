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
  const run = () =>
    spawnSync(
      process.execPath,
      ["scripts/verify-release.mjs", directory, "0.3.0"],
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
  for (const name of names)
    await writeFile(path.join(directory, name), payload);
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
  await writeFile(
    path.join(directory, "Poker-Trainer-0.2.0-x64-Setup.exe"),
    payload,
  );
  assert.notEqual(run().status, 0);
});
