import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, cardName } from "../app/engine.js";
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
    "build",
    process.platform === "win32" ? "console_solver.exe" : "console_solver",
  );
export const resources =
  process.env.TEXASSOLVER_RESOURCES || path.join(sibling, "resources");
export async function available() {
  try {
    await access(binary);
    await access(path.join(resources, "compairer/card5_dic_sorted.txt"));
    return true;
  } catch {
    return false;
  }
}
export function commands(s) {
  const g = validate(s);
  if (s.rake > 0 && s.cap > 0)
    throw Error(
      "TexasSolver adapter supports zero rake only. Use the reference engine for rake.",
    );
  return [
    `set_pot ${s.pot}`,
    `set_effective_stack ${s.stack}`,
    `set_board ${g.board.map(cardName).join(",")}`,
    `set_range_oop ${g.hero.map((h) => h.label + ":" + h.weight).join(",")}`,
    `set_range_ip ${g.villain.map((h) => h.label + ":" + h.weight).join(",")}`,
    "set_bet_sizes oop,flop,allin",
    "set_allin_threshold 1",
    "build_tree",
    `set_thread_num ${Math.min(4, os.availableParallelism())}`,
    "set_accuracy 0.001",
    `set_max_iteration ${Math.min(s.iterations, 10000)}`,
    "set_print_interval 100",
    "set_use_isomorphism 0",
    "start_solve",
    "set_dump_rounds 1",
    "dump_result result.json",
    "",
  ].join("\n");
}
export function extract(data, s) {
  const g = validate(s),
    bet = data.actions?.find((a) => /^BET /.test(a)),
    child = data.childrens?.[bet];
  if (
    !bet ||
    data.actions.length !== 2 ||
    !data.actions.includes("CHECK") ||
    Math.abs(Number(bet.slice(4)) - s.stack) > 1e-5 ||
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
export async function run(s, signal) {
  const input = commands(s);
  if (!(await available()))
    throw Error("Native solver is not installed. See native/README.md.");
  const directory = await mkdtemp(path.join(os.tmpdir(), "poker-solve-"));
  const start = performance.now();
  try {
    await writeFile(path.join(directory, "input.txt"), input);
    let output = "";
    await new Promise((resolve, reject) => {
      const child = spawn(binary, ["-i", "input.txt", "-r", resources], {
        cwd: directory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        signal,
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(Error("Native solve exceeded five-minute limit"));
      }, 300000);
      child.stdout.on("data", (b) => {
        output = (output + b.toString()).slice(-10000);
      });
      child.stderr.on("data", (b) => {
        output = (output + b.toString()).slice(-10000);
      });
      child.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolve()
          : reject(Error("Native solver failed with exit code " + code));
      });
    });
    const data = JSON.parse(
      await readFile(path.join(directory, "result.json"), "utf8"),
    );
    return {
      ...extract(data, s),
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
