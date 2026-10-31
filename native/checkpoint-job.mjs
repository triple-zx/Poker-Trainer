import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
} from "node:fs/promises";
import path from "node:path";

export function checkpointKey(input, executable) {
  // An increased iteration budget may continue the same absolute DCFR sequence.
  // Every other command and the exact executable remain part of the identity.
  return createHash("sha256")
    .update(executable)
    .update(input.replace(/^set_max_iteration \d+\n/m, ""))
    .digest("hex");
}

export function progressReader(onProgress) {
  let pending = "";
  return (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop().slice(-4096);
    for (const line of lines) {
      if (!line.startsWith("TRAINER_PROGRESS ")) continue;
      const value = JSON.parse(line.slice(17));
      if (
        ![value.iteration, value.target, value.saved].every(
          Number.isSafeInteger,
        ) ||
        value.saved < 0 ||
        value.iteration < value.saved ||
        value.target < value.iteration ||
        !["running", "paused", "complete"].includes(value.status)
      )
        throw Error("Invalid native checkpoint progress");
      onProgress(value);
    }
  };
}

export async function savedCheckpoint(directory) {
  try {
    const record = JSON.parse(
      await readFile(path.join(directory, "job.json"), "utf8"),
    );
    if (record.schema !== 1 || !/^[a-f0-9]{64}$/.test(record.key))
      throw Error("Invalid saved solver job");
    await access(path.join(directory, "state.bin"));
    return record;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function prepareCheckpoint(
  directory,
  input,
  executable,
  scenario,
  resume,
) {
  const key = checkpointKey(input, executable);
  await mkdir(directory, { recursive: true });
  const existing = resume ? await savedCheckpoint(directory) : null;
  if (resume && (!existing || existing.key !== key))
    throw Error(
      "No compatible native checkpoint. Restore its scenario and engine, or start a new computation.",
    );
  const record = { schema: 1, key, scenario: structuredClone(scenario) };
  if (!resume) {
    // A fresh computation explicitly replaces the single saved job. A failed
    // resume never deletes it. Paths are fixed beneath the host-owned folder.
    await rm(path.join(directory, "state.bin"), { force: true });
  }
  await rm(path.join(directory, "pause"), { force: true });
  await writeFile(path.join(directory, "job.json.tmp"), JSON.stringify(record));
  await rename(
    path.join(directory, "job.json.tmp"),
    path.join(directory, "job.json"),
  );
  return {
    environment: {
      POKER_CHECKPOINT_FILE: path.join(directory, "state.bin"),
      POKER_CHECKPOINT_KEY: key,
      POKER_PAUSE_FILE: path.join(directory, "pause"),
      POKER_RESUME_CHECKPOINT: resume ? "1" : "0",
      POKER_CHECKPOINT_INTERVAL: "100",
    },
    pause: () => writeFile(path.join(directory, "pause"), "pause"),
  };
}
