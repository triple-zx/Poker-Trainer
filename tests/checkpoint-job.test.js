import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkpointKey,
  progressReader,
  prepareCheckpoint,
  savedCheckpoint,
} from "../native/checkpoint-job.mjs";
import { commands } from "../native/adapter.mjs";
import { DEFAULT } from "../app/engine.js";

test("checkpoint identity permits more iterations but binds native commands and executable", () => {
  const first = commands(DEFAULT),
    executable = Buffer.from("engine-one");
  assert.equal(
    checkpointKey(first, executable),
    checkpointKey(commands({ ...DEFAULT, iterations: 100000 }), executable),
  );
  assert.match(
    commands({ ...DEFAULT, iterations: 100000 }),
    /set_max_iteration 100000\n/,
  );
  for (const input of [
    commands({ ...DEFAULT, stack: 14 }),
    commands({ ...DEFAULT, hero: "AhKh:.5" }),
  ])
    assert.notEqual(
      checkpointKey(first, executable),
      checkpointKey(input, executable),
    );
  assert.notEqual(
    checkpointKey(first, executable),
    checkpointKey(first, Buffer.from("engine-two")),
  );
});

test("progress handles split output and rejects impossible or malformed counts", () => {
  const values = [],
    read = progressReader((value) => values.push(value));
  read(Buffer.from("native chatter\nTRAINER_PRO"));
  read(
    Buffer.from(
      'GRESS {"iteration":100,"target":200,"saved":100,"status":"running"}\r\n',
    ),
  );
  assert.deepEqual(values, [
    { iteration: 100, target: 200, saved: 100, status: "running" },
  ]);
  for (const bad of [
    { iteration: 20, target: 10, saved: 0, status: "running" },
    { iteration: 10, target: 20, saved: 11, status: "paused" },
    { iteration: 10.5, target: 20, saved: 10, status: "running" },
    { iteration: 10, target: 20, saved: 10, status: "fake" },
  ])
    assert.throws(
      () =>
        progressReader(() => {})(
          "TRAINER_PROGRESS " + JSON.stringify(bad) + "\n",
        ),
      /Invalid/,
    );
});

test("saved jobs survive failed resume and require a complete state file", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "poker-checkpoint-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = commands(DEFAULT),
    executable = Buffer.from("test-engine");
  assert.equal(await savedCheckpoint(directory), null);
  const job = await prepareCheckpoint(
    directory,
    input,
    executable,
    DEFAULT,
    false,
  );
  assert.equal(await savedCheckpoint(directory), null);
  const payload = Buffer.from("test state");
  await writeFile(path.join(directory, "state.bin"), payload);
  assert.deepEqual((await savedCheckpoint(directory)).scenario, DEFAULT);
  await job.pause();
  assert.equal(await readFile(path.join(directory, "pause"), "utf8"), "pause");
  await assert.rejects(
    prepareCheckpoint(
      directory,
      input,
      Buffer.from("different"),
      DEFAULT,
      true,
    ),
    /compatible/,
  );
  assert.deepEqual(await readFile(path.join(directory, "state.bin")), payload);
  const resumed = await prepareCheckpoint(
    directory,
    input,
    executable,
    DEFAULT,
    true,
  );
  assert.equal(resumed.environment.POKER_RESUME_CHECKPOINT, "1");
  await assert.rejects(readFile(path.join(directory, "pause")), {
    code: "ENOENT",
  });
  assert.deepEqual(await readFile(path.join(directory, "state.bin")), payload);
  await prepareCheckpoint(directory, input, executable, DEFAULT, false);
  assert.equal(await savedCheckpoint(directory), null);
});
