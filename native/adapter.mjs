import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  access,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, cardName } from "../app/engine.js";
import { betAmounts } from "../app/sizing-config.js";
import { validateFull } from "../app/full-game.js";
import { fullCandidates } from "../app/full-sizing.js";
import { firstPlayer } from "../app/positions.js";
import { assertFullCapacity } from "../app/full-resources.js";
import { prepareCheckpoint, progressReader } from "./checkpoint-job.mjs";
const bundled = fileURLToPath(
  new URL("../.native/TexasSolver/", import.meta.url),
);
const sibling = existsSync(bundled)
  ? bundled
  : fileURLToPath(new URL("../../texassolver/", import.meta.url));
export const binary =
  process.env.TEXASSOLVER_BIN ||
  path.join(
    sibling,
    existsSync(path.join(sibling, "trainer-build")) ? "trainer-build" : "build",
    process.platform === "win32" ? "console_solver.exe" : "console_solver",
  );
export const resources =
  process.env.TEXASSOLVER_RESOURCES || path.join(sibling, "resources");
export async function available() {
  try {
    await access(binary);
    if (process.env.POKER_USE_TABLE_EVALUATOR === "1")
      await access(path.join(resources, "compairer/card5_dic_sorted.txt"));
    return true;
  } catch {
    return false;
  }
}
export async function checkpointSupported() {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--trainer-capabilities"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    const timeout = setTimeout(() => child.kill(), 5000);
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-1000);
    });
    child.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 && output.trim() === '{"checkpoint":1}');
    });
  });
}
export function commands(s) {
  const g = validate(s);
  if (s.game === "full") validateFull(s);
  const scale = 1000,
    sizes = betAmounts(s),
    betting = s.game === "full" ? fullCandidates(s) : null,
    ranges = [g.hero, g.villain],
    oop = firstPlayer(s);
  if (
    [s.pot, s.stack].some(
      (x) => Math.abs(x * scale - Math.round(x * scale)) > 1e-6,
    )
  )
    throw Error(
      "Native pot and stack support up to three decimal places in bb",
    );
  if (s.rake > 0 && s.cap > 0)
    throw Error(
      "TexasSolver adapter supports zero rake only. Use the reference engine for rake.",
    );
  return [
    `set_pot ${s.pot * scale}`,
    `set_effective_stack ${s.stack * scale}`,
    `set_board ${g.board.map(cardName).join(",")}`,
    `set_range_oop ${ranges[oop].map((h) => h.label + ":" + h.weight).join(",")}`,
    `set_range_ip ${ranges[1 - oop].map((h) => h.label + ":" + h.weight).join(",")}`,
    ...(s.game === "full"
      ? ["oop", "ip"].flatMap((player) =>
          ["flop", "turn", "river"].flatMap((street) => [
            `set_bet_sizes ${player},${street},allin`,
            `set_bet_sizes ${player},${street},bet,${betting[street].bet.join(",")}`,
            `set_bet_sizes ${player},${street},donk,${betting[street].bet.join(",")}`,
            `set_bet_sizes ${player},${street},raise,${betting[street].raise.join(",")}`,
          ]),
        )
      : ["set_bet_sizes oop,flop,allin"]),
    ...(s.game !== "full" && s.sizing && sizes.some((x) => x < s.stack)
      ? [
          `set_bet_sizes oop,flop,bet,${sizes
            .filter((x) => x < s.stack)
            .map((x) => Number(((x / s.pot) * 100).toPrecision(12)))
            .join(",")}`,
        ]
      : []),
    // Upstream compares bet plus sunk commitment to effective stack. Disable
    // automatic near-all-in substitution: the adapter already caps all sizes.
    `set_allin_threshold ${2 + s.pot / s.stack}`,
    "build_tree",
    `set_thread_num ${Math.min(4, os.availableParallelism(), Math.max(1, Number(process.env.TEXASSOLVER_THREADS) || 1))}`,
    `set_accuracy ${s.game === "full" ? 0.05 / s.pot : 0.001}`,
    `set_max_iteration ${s.iterations}`,
    "set_print_interval 100",
    "set_use_isomorphism 0",
    "start_solve",
    `set_dump_rounds ${s.game === "full" ? 3 : 1}`,
    "dump_result result.json",
    "",
  ].join("\n");
}
export function extract(data, s) {
  if (s.game === "full")
    return { full: true, raw: data, engine: "TexasSolver (patched console)" };
  if (s.sizing) return extractSized(data, s);
  const g = validate(s),
    bet = data.actions?.find((a) => /^BET /.test(a)),
    child = data.childrens?.[bet];
  if (
    !bet ||
    data.actions.length !== 2 ||
    !data.actions.includes("CHECK") ||
    Math.abs(Number(bet.slice(4)) / 1000 - s.stack) > 1e-5 ||
    child?.actions?.length !== 2 ||
    !child.actions.includes("FOLD") ||
    !child.actions.includes("CALL")
  )
    throw Error("Native action tree does not match the training game");
  const read = (node, h, action) => {
    const map = node.strategy?.strategy,
      values = map?.[h.label] || map?.[h.label.slice(2) + h.label.slice(0, 2)];
    if (
      !Array.isArray(values) ||
      values.length !== node.actions.length ||
      values.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
      Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-5
    )
      throw Error("Missing or invalid native strategy");
    return values[node.actions.indexOf(action)];
  };
  return {
    baseline: g.hero.map((h) => read(data, h, bet)),
    calls: g.villain.map((h) => read(child, h, "CALL")),
    engine: "TexasSolver (patched console)",
  };
}
export function extractSized(data, s) {
  const g = validate(s),
    sizes = betAmounts(s),
    actions = [
      "CHECK",
      ...sizes.map((size) =>
        data.actions?.find(
          (a) =>
            a.startsWith("BET ") &&
            Math.abs(Number(a.slice(4)) / 1000 - size) < 1e-5,
        ),
      ),
    ];
  if (
    !data.actions?.includes("CHECK") ||
    actions.some((a) => !a) ||
    data.actions?.length !== actions.length
  )
    throw Error(
      `Native sizes differ from configured sizes: expected ${sizes.join(", ")}; received ${(data.actions || []).join(", ")}`,
    );
  const read = (node, h, action) => {
    const v =
      node?.strategy?.strategy?.[h.label] ||
      node?.strategy?.strategy?.[h.label.slice(2) + h.label.slice(0, 2)];
    if (
      !Array.isArray(v) ||
      v.length !== node.actions.length ||
      v.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
      Math.abs(v.reduce((a, b) => a + b, 0) - 1) > 1e-5
    )
      throw Error("Missing native strategy");
    return v[node.actions.indexOf(action)];
  };
  const children = actions.slice(1).map((action) => {
    const child = data.childrens?.[action];
    if (
      child?.actions?.length !== 2 ||
      !child.actions.includes("CALL") ||
      !child.actions.includes("FOLD")
    )
      throw Error("Unsupported continuation");
    return child;
  });
  return {
    sized: true,
    baseline: g.hero.map((h) => actions.map((a) => read(data, h, a))),
    calls: g.villain.map((h) => children.map((c) => read(c, h, "CALL"))),
    engine: "TexasSolver (patched console)",
  };
}
export async function run(s, signal, options = {}) {
  if (s.game === "full") assertFullCapacity(s);
  const input = commands(s);
  if (!(await available()))
    throw Error("Native solver is not installed. See native/README.md.");
  signal?.throwIfAborted();
  if (options.checkpointDirectory && !(await checkpointSupported()))
    throw Error(
      "This native engine does not support checkpoints. Rebuild it with native/setup.mjs.",
    );
  const checkpoint = options.checkpointDirectory
    ? await prepareCheckpoint(
        path.resolve(options.checkpointDirectory),
        input,
        await readFile(binary),
        s,
        !!options.resume,
      )
    : null;
  const directory = await mkdtemp(path.join(os.tmpdir(), "poker-solve-"));
  const start = performance.now();
  try {
    await writeFile(path.join(directory, "input.txt"), input);
    let output = "",
      progress = null;
    const code = await new Promise((resolve, reject) => {
      let failure = null;
      const child = spawn(binary, ["-i", "input.txt", "-r", resources], {
        cwd: directory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Host callers opt in explicitly; inherited shell settings cannot
          // silently attach a normal solve to somebody else's checkpoint.
          POKER_CHECKPOINT_FILE: "",
          POKER_PAUSE_FILE: "",
          ...checkpoint?.environment,
        },
      });
      const fail = (error) => {
        failure ||= error;
        child.kill();
      };
      const cancel = () =>
        fail(
          Error(
            checkpoint
              ? "Native solve cancelled; last completed checkpoint retained"
              : "Native solve cancelled",
          ),
        );
      const pause = () => checkpoint?.pause().catch(fail);
      signal?.addEventListener("abort", cancel, { once: true });
      options.pauseSignal?.addEventListener("abort", pause, { once: true });
      if (signal?.aborted) cancel();
      if (options.pauseSignal?.aborted) pause();
      const readProgress = progressReader((value) => {
        progress = value;
        options.onProgress?.(value);
      });
      const timeout = setTimeout(
        () => {
          fail(
            Error(
              s.game === "full"
                ? "Native solve exceeded the 30-minute limit. Reduce ranges, sizes or iterations."
                : "Native solve exceeded five-minute limit",
            ),
          );
        },
        s.game === "full" ? 1800000 : 300000,
      );
      child.stdout.on("data", (b) => {
        output = (output + b.toString()).slice(-10000);
        try {
          readProgress(b);
        } catch (error) {
          fail(error);
        }
      });
      child.stderr.on("data", (b) => {
        output = (output + b.toString()).slice(-10000);
      });
      child.on("error", (e) => {
        failure ||= e;
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
        options.pauseSignal?.removeEventListener("abort", pause);
        if (failure) reject(failure);
        else if (
          code === 0 ||
          (code === 75 && checkpoint && progress?.status === "paused")
        )
          resolve(code);
        else
          reject(
            Error(
              "Native solver failed with exit code " +
                code +
                ": " +
                output.slice(-1200),
            ),
          );
      });
    });
    if (code === 75)
      return { paused: true, progress, wallMs: performance.now() - start };
    if (checkpoint && progress?.status !== "complete")
      throw Error(
        "This native engine does not support checkpoints. Rebuild it with native/setup.mjs.",
      );
    if (
      (await stat(path.join(directory, "result.json"))).size >
      256 * 1024 * 1024
    )
      throw Error("Native tree exceeds 256 MB. Reduce sizes or stacks.");
    const data = JSON.parse(
      await readFile(path.join(directory, "result.json"), "utf8"),
    );
    return {
      ...extract(data, s),
      ...(progress ? { progress } : {}),
      wallMs: performance.now() - start,
      reportedPercent: Number(
        [...output.matchAll(/Total exploitability ([\d.eE+-]+)/g)].at(-1)?.[1],
      ),
    };
  } finally {
    if (
      !path
        .resolve(directory)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "poker-solve-")
    )
      throw Error("Unsafe cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
}
