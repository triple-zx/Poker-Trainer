import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { DEFAULT } from "../app/engine.js";
import {
  commands,
  binary,
  resources,
  run,
  checkpointSupported,
} from "./adapter.mjs";
import { checkpointKey, progressReader } from "./checkpoint-job.mjs";
import { convertFull, evaluateFull } from "../app/full-game.js";

const root = path.resolve(".native");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, "checkpoint-verification-"));
const executable = await readFile(binary);
assert.equal(
  await checkpointSupported(),
  true,
  "Point TEXASSOLVER_BIN at the new engine",
);
const scenario = {
  ...DEFAULT,
  game: "full",
  hero: "AhKh",
  villain: "QcQd",
  pot: 4,
  stack: 3,
  iterations: 240,
  betting: Object.fromEntries(
    ["flop", "turn", "river"].map((street) => [
      street,
      { bet: [50], raise: [100] },
    ]),
  ),
};
// Disable early accuracy stopping here so all paths must reach exactly 240.
const input = commands(scenario).replace(
  /^set_accuracy .*$/m,
  "set_accuracy -1000000",
);
const key = checkpointKey(input, executable);
const state = path.join(directory, "保存 state.bin");
const pauseFile = path.join(directory, "pause.request");
const reports = [];
async function raw(
  label,
  {
    text = input,
    checkpoint = false,
    resume = false,
    interrupt,
    env = {},
  } = {},
) {
  const work = path.join(directory, label);
  await mkdir(work);
  await writeFile(path.join(work, "input.txt"), text);
  const progress = [];
  const started = performance.now();
  const outcome = await new Promise((resolve, reject) => {
    const child = spawn(binary, ["-i", "input.txt", "-r", resources], {
      cwd: work,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        POKER_CHECKPOINT_FILE: checkpoint ? state : "",
        POKER_CHECKPOINT_KEY: key,
        POKER_CHECKPOINT_INTERVAL: "40",
        POKER_PAUSE_FILE: pauseFile,
        POKER_RESUME_CHECKPOINT: resume ? "1" : "0",
        ...env,
      },
    });
    let output = "",
      interrupted = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Checkpoint verification timed out"));
    }, 120000);
    const parse = progressReader((value) => {
      progress.push(value);
      if (
        !interrupted &&
        value.iteration >= 80 &&
        value.status === "running" &&
        interrupt
      ) {
        interrupted = true;
        if (interrupt === "kill") child.kill();
        else writeFileSync(pauseFile, "pause");
      }
    });
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-3000);
      parse(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output = (output + chunk).slice(-3000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
  const report = {
    label,
    code: outcome.code,
    wallMs: performance.now() - started,
    progress,
  };
  reports.push(report);
  console.log(JSON.stringify(report));
  return {
    ...outcome,
    progress,
    result:
      outcome.code === 0
        ? JSON.parse(await readFile(path.join(work, "result.json"), "utf8"))
        : null,
  };
}
const continuous = await raw("continuous");
assert.equal(continuous.code, 0, continuous.output);
const paused = await raw("pause", { checkpoint: true, interrupt: "pause" });
assert.equal(paused.code, 75, paused.output);
assert.equal(paused.progress.at(-1).status, "paused");
assert.ok(
  paused.progress.at(-1).iteration >= 80 &&
    paused.progress.at(-1).iteration < 240,
);
assert.equal(paused.progress.at(-1).saved, paused.progress.at(-1).iteration);
await rm(pauseFile);
const resumed = await raw("resume", { checkpoint: true, resume: true });
assert.equal(resumed.code, 0, resumed.output);
assert.equal(resumed.progress.at(-1).iteration, 240);
assert.equal(resumed.progress[0].iteration, paused.progress.at(-1).iteration);
assert.deepEqual(
  resumed.result,
  continuous.result,
  "Pause/resume must preserve every exported probability exactly",
);
const killed = await raw("kill", { checkpoint: true, interrupt: "kill" });
assert.notEqual(killed.code, 0);
const recovered = await raw("recover", { checkpoint: true, resume: true });
assert.equal(recovered.code, 0, recovered.output);
assert.equal(recovered.progress[0].iteration, 80);
assert.deepEqual(
  recovered.result,
  continuous.result,
  "Process-loss recovery must preserve every exported probability exactly",
);
const goodState = await readFile(state);
const failures = [
  ["wrong-key", { env: { POKER_CHECKPOINT_KEY: "f".repeat(64) } }],
  ["different-range", { text: input.replace("AhKh:1", "AhKh:0.5") }],
  ["different-tree", { text: input.replace("set_pot 4000", "set_pot 5000") }],
  [
    "smaller-budget",
    { text: input.replace("set_max_iteration 240", "set_max_iteration 100") },
  ],
];
for (const [label, options] of failures) {
  const failed = await raw(label, {
    checkpoint: true,
    resume: true,
    ...options,
  });
  assert.notEqual(failed.code, 0, label);
  assert.match(failed.output, /Checkpoint/);
  assert.deepEqual(
    await readFile(state),
    goodState,
    "Rejected resumes must preserve saved state",
  );
}
const corrupt = Buffer.from(goodState);
corrupt[corrupt.length - 1] ^= 1;
await writeFile(state, corrupt);
const rejected = await raw("corrupt", { checkpoint: true, resume: true });
assert.notEqual(rejected.code, 0);
assert.match(rejected.output, /checksum|Invalid checkpoint/);
await writeFile(state, goodState.subarray(0, goodState.length - 100));
const truncated = await raw("truncated", { checkpoint: true, resume: true });
assert.notEqual(truncated.code, 0);
assert.match(truncated.output, /Truncated checkpoint/);
await writeFile(state, goodState);
// Public adapter pause/resume uses its own trusted folder and configuration key.
const adapterDirectory = path.join(directory, "adapter");
const pause = new AbortController();
const viaAdapter = await run(scenario, undefined, {
  checkpointDirectory: adapterDirectory,
  pauseSignal: pause.signal,
  onProgress: (p) => {
    if (p.iteration >= 100) pause.abort();
  },
});
assert.equal(viaAdapter.paused, true);
const adapterResult = await run(scenario, undefined, {
  checkpointDirectory: adapterDirectory,
  resume: true,
});
assert.equal(adapterResult.progress.status, "complete");
const adapterReference = await run(scenario);
assert.deepEqual(
  adapterResult.raw,
  adapterReference.raw,
  "Pausing at an accuracy-check boundary must preserve early stopping",
);
const completedReload = await run(scenario, undefined, {
  checkpointDirectory: adapterDirectory,
  resume: true,
});
assert.equal(
  completedReload.progress.iteration,
  adapterResult.progress.iteration,
);
assert.deepEqual(
  completedReload.raw,
  adapterResult.raw,
  "Completed baseline reload must not add iterations",
);
const evaluated = evaluateFull(
  convertFull(adapterResult.raw, scenario),
  scenario,
);
assert.ok(Number.isFinite(evaluated.gap));
const report = {
  schema: 1,
  platform: process.platform,
  arch: process.arch,
  scenario,
  iterations: 240,
  exactPolicyEquality: true,
  checkpointBytes: (await stat(state)).size,
  verifiedNodes: evaluated.nodes,
  gap: evaluated.gap,
  runs: reports,
};
const mixed = {
  ...scenario,
  heroPosition: "ip",
  hero: "AhKh:.75,9h8h:.5",
  villain: "QcQd:.6,JhTh:.4",
  stack: 1,
};
const mixedInput = commands(mixed).replace(
  /^set_accuracy .*$/m,
  "set_accuracy -1000000",
);
const mixedReference = await raw("mixed-ip-continuous", { text: mixedInput });
assert.equal(mixedReference.code, 0, mixedReference.output);
const mixedPaused = await raw("mixed-ip-pause", {
  text: mixedInput,
  checkpoint: true,
  interrupt: "pause",
});
assert.equal(mixedPaused.code, 75, mixedPaused.output);
await rm(pauseFile);
const mixedResumed = await raw("mixed-ip-resume", {
  text: mixedInput,
  checkpoint: true,
  resume: true,
});
assert.equal(mixedResumed.code, 0, mixedResumed.output);
assert.deepEqual(mixedReference.result, mixedResumed.result);
report.mixedInPosition = {
  exactPolicyEquality: true,
  hero: mixed.hero,
  villain: mixed.villain,
  pausedAt: mixedPaused.progress.at(-1).saved,
};
await writeFile(
  "docs/benchmarks/checkpoints.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    verified: true,
    nodes: evaluated.nodes,
    checkpointBytes: report.checkpointBytes,
    directory,
  }),
);
