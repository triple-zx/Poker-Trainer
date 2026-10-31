import { engineInfo, nativeSolve } from "./runtime.js";
import { practiceGroups, recordActions } from "./analytics.js";
import { equityReport, frequencyReport, replayHand } from "./analytics-ui.js";
import { solveSized, betAmounts } from "./sizing.js";
import { actionLabel, sizingReport } from "./sizing-ui.js";
import { validateFull } from "./full-game.js";
import { startFullTraining, fullReplay } from "./full-training-ui.js";
import { drillContext } from "./full-session.js";
import { assertFullCapacity, estimateFullResources } from "./full-resources.js";
import {
  renderTendencyClasses,
  readTendencies,
  fillTendencies,
  tendencySummary,
} from "./tendency-ui.js";
import { solutionStore } from "./solution-store.js";
import { flopReportPanel } from "./flop-report-ui.js";
import { rangeWorkspace, showRangeOrigins } from "./preflop-ranges-ui.js";
import {
  sameScenario,
  scenarioPackage,
  PACKAGE_LIMIT,
} from "./solution-package.js";
import {
  fullExplorer,
  fullFrequencyReport,
  fullSizingReport,
} from "./full-analysis-ui.js";
import { fullCandidates } from "./full-sizing.js";
import { modelBasis, editFullModel } from "./full-model.js";
import { playerPosition } from "./positions.js";
import {
  DEFAULT,
  cards,
  validate,
  solve,
  sample,
  cardName,
  rank7,
  importPackage,
  RANKS,
} from "./engine.js";
const solveScenario = (s, ...args) =>
  (s.sizing ? solveSized : solve)(s, ...args);
const $ = (s) => document.querySelector(s),
  form = $("#form"),
  key = "poker-trainer-v1";
let library = {};
const flopViewState = {
  profile: "model",
  weightMode: "equal",
  selected: new Set(),
  weights: new Map(),
};
let disposeFlopReport = () => {};
let lang = "en",
  result = null,
  checkpoint = [],
  jobScenario = null,
  worker = null,
  hand = null,
  records = [],
  filter = false,
  controller = null,
  runId = 0;
let fullTraining = null;
let packageJob = null;
let fullModel = null,
  cachedBaseline = null;
let rangeOrigins = null;
let explorerPath = "root";
const t = (en, zh) => (lang === "en" ? en : zh);
const msg = (en, zh = en) => ($("#status").textContent = t(en, zh));
renderTendencyClasses($("#tendency-classes"), t);
const ranges = rangeWorkspace($("#ranges"), {
  t,
  download,
  scenario: () => ({
    flop: form.elements.flop.value,
    game: form.elements.game.value,
  }),
  onApply: (side, applied) => {
    if (hand)
      throw Error(
        t(
          "Finish the hand before changing ranges.",
          "请先完成本手再修改范围。",
        ),
      );
    form.elements[side].value = applied.text;
    fullModel = null;
    if (side === "villain") {
      form.elements.overrides.value = "{}";
      form.elements.nodeOverrides.value = "{}";
    }
    form.elements[side].dispatchEvent(new Event("input", { bubbles: true }));
    rangeOrigins = { ...rangeOrigins, [side]: applied.document };
    showRangeOrigins($("#range-origins"), rangeOrigins, t);
    updateCandidatePreview();
    save();
  },
});
function read() {
  const fd = new FormData(form),
    s = Object.fromEntries(fd);
  for (const k of [
    "pot",
    "stack",
    "rake",
    "cap",
    "tendency",
    "deviation",
    "iterations",
  ])
    s[k] = Number(s[k]);
  s.overrides = JSON.parse(s.overrides || "{}");
  if (s.game === "full") {
    const tendencies = readTendencies(form);
    if (tendencies) s.fullTendencies = tendencies;
    if (fullModel) s.fullModel = structuredClone(fullModel);
    s.engine = "native";
    if (s.fullSizingMode !== "off")
      s.fullSizing = {
        mode: s.fullSizingMode,
        maxBets: Number(s.fullMaxBets),
        maxRaises: Number(s.fullMaxRaises),
        lossTarget: Number(s.fullSizingLoss),
      };
    s.betting = Object.fromEntries(
      ["flop", "turn", "river"].map((street) => [
        street,
        {
          bet: s[street + "Bets"].split(",").map(Number),
          raise: s[street + "Raises"].split(",").map(Number),
        },
      ]),
    );
  }
  if (s.game !== "full" || s.heroPosition === "oop") delete s.heroPosition;
  if (s.game !== "full" && s.sizingMode !== "allin")
    s.sizing = {
      mode: s.sizingMode,
      candidates: s.sizingCandidates.split(",").map(Number),
      maxSizes: Number(s.sizingLimit),
      lossTarget: Number(s.sizingLoss),
      nodeOverrides: JSON.parse(s.nodeOverrides || "{}"),
    };
  for (const field of [
    "sizingMode",
    "sizingCandidates",
    "sizingLimit",
    "sizingLoss",
    "nodeOverrides",
    "fullSizingMode",
    "fullMaxBets",
    "fullMaxRaises",
    "fullSizingLoss",
    "bluffTendency",
    "raiseTendency",
  ])
    delete s[field];
  for (const field of Object.keys(s))
    if (field.startsWith("class_")) delete s[field];
  for (const street of ["flop", "turn", "river"]) {
    delete s[street + "Bets"];
    delete s[street + "Raises"];
  }
  if (rangeOrigins) s.rangeOrigins = structuredClone(rangeOrigins);
  validate(s);
  if (s.game === "full") validateFull(s);
  betAmounts(s);
  return s;
}
function fill(s) {
  rangeOrigins = s.rangeOrigins ? structuredClone(s.rangeOrigins) : null;
  fillTendencies(form, s);
  fullModel = s.fullModel ? structuredClone(s.fullModel) : null;
  const iterations = form.elements.iterations;
  if (
    !Array.from(iterations.options).some(
      (o) => Number(o.value) === s.iterations,
    )
  ) {
    const option = document.createElement("option");
    option.value = String(s.iterations);
    option.textContent = Number(s.iterations).toLocaleString();
    iterations.append(option);
  }
  form.elements.game.value = s.game || "bounded";
  form.elements.heroPosition.value = s.heroPosition || "oop";
  form.elements.fullSizingMode.value = s.fullSizing?.mode || "off";
  form.elements.fullMaxBets.value = s.fullSizing?.maxBets || 1;
  form.elements.fullMaxRaises.value = s.fullSizing?.maxRaises || 1;
  form.elements.fullSizingLoss.value = s.fullSizing?.lossTarget ?? 0.01;
  for (const street of ["flop", "turn", "river"]) {
    form.elements[street + "Bets"].value = (
      s.betting?.[street]?.bet || [33, 75]
    ).join(",");
    form.elements[street + "Raises"].value = (
      s.betting?.[street]?.raise || [100]
    ).join(",");
  }
  form.elements.sizingMode.value = s.sizing?.mode || "allin";
  form.elements.sizingCandidates.value = (
    s.sizing?.candidates || [33, 75]
  ).join(",");
  form.elements.sizingLimit.value = s.sizing?.maxSizes || 2;
  form.elements.sizingLoss.value = s.sizing?.lossTarget ?? 0.01;
  form.elements.nodeOverrides.value = JSON.stringify(
    s.sizing?.nodeOverrides || {},
  );
  $("#engine").value = s.engine || "reference";
  for (const [k, v] of Object.entries(s))
    if (form.elements[k])
      form.elements[k].value = k === "overrides" ? JSON.stringify(v) : v;
  formatControls();
  updateCandidatePreview();
}
function formatControls() {
  showRangeOrigins($("#range-origins"), rangeOrigins, t);
  const full = form.elements.game.value === "full";
  $("#opponent-tendencies").hidden = !full;
  $("#opponent-tendencies").disabled = !full;
  form.elements.heroPosition.disabled = !full;
  if (!full) form.elements.heroPosition.value = "oop";
  positionLabels();
  $("#model-edits").hidden = !full;
  $("#model-edit-count").textContent = t(
    `${Object.keys(fullModel?.locks || {}).length} opponent decisions edited`,
    `已编辑 ${Object.keys(fullModel?.locks || {}).length} 个对手决策`,
  );
  $("#clear-model").disabled = !fullModel;
  $("#full-settings").hidden = !full;
  $("#bounded-settings").hidden = full;
  $("#engine").disabled = full;
  if (full) $("#engine").value = "native";
  for (const name of ["fullMaxBets", "fullMaxRaises", "fullSizingLoss"])
    form.elements[name].disabled =
      !full || form.elements.fullSizingMode.value === "off";
}
function positionLabels() {
  const s = { heroPosition: form.elements.heroPosition.value };
  const hero = playerPosition(s, 0) === "ip",
    opponent = !hero;
  $("#hero-range-label").textContent = hero
    ? t("Hero · IP", "玩家 · 有位置")
    : t("Hero · OOP", "玩家 · 无位置");
  $("#opponent-range-label").textContent = opponent
    ? t("Opponent · IP", "对手 · 有位置")
    : t("Opponent · OOP", "对手 · 无位置");
  $("#hero-seat").textContent = hero
    ? t("YOU · IN POSITION", "玩家 · 有位置")
    : t("YOU · OUT OF POSITION", "玩家 · 无位置");
  $("#opponent-seat").textContent = opponent
    ? t("OPPONENT · IN POSITION", "对手 · 有位置")
    : t("OPPONENT · OUT OF POSITION", "对手 · 无位置");
}
function save() {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        scenario: jobScenario || read(),
        equities:
          (jobScenario || result?.scenario)?.game === "full"
            ? undefined
            : checkpoint,
        result: !!result && !result.full,
        nativeProfile: result?.nativeProfile,
        records,
        lang,
      }),
    );
  } catch {
    msg(
      "Progress could not be saved. Export a backup.",
      "无法保存进度，请导出备份。",
    );
  }
}
function show(tab) {
  if (
    hand &&
    (tab === "analysis" ||
      tab === "history" ||
      tab === "ranges" ||
      (fullTraining && tab === "setup"))
  ) {
    msg(
      "Finish the hand before opening this view.",
      "请先完成本手再打开此页面。",
    );
    return;
  }
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== tab));
  document.body.dataset.view = tab;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "analysis") analysis();
  if (tab === "history") history();
  if (tab === "ranges") ranges.render();
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => show(b.dataset.tab)));
function translate() {
  ranges.render();
  showRangeOrigins($("#range-origins"), rangeOrigins, t);
  renderTendencyClasses($("#tendency-classes"), t);
  if (result) reportStatus();
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document
    .querySelectorAll("[data-en]")
    .forEach((e) => (e.textContent = e.dataset[lang]));
  $("#language").textContent = lang === "en" ? "中文" : "English";
  positionLabels();
  refreshTarget();
  analysis();
  history();
  updateCandidatePreview();
}
$("#language").onclick = () => {
  lang = lang === "en" ? "zh" : "en";
  translate();
  save();
};
async function start(s, resume = false) {
  try {
    if (s.game === "full") assertFullCapacity(s);
  } catch (e) {
    msg(e.message);
    return;
  }
  if (
    s.game === "full" &&
    cachedBaseline &&
    cachedBaseline.scenario.iterations === s.iterations &&
    modelBasis(cachedBaseline.scenario) === modelBasis(s)
  ) {
    transferPackage("remodel", { result: cachedBaseline, scenario: s });
    return;
  }
  fullTraining?.cancel();
  fullTraining = null;
  const token = ++runId;
  controller?.abort();
  controller = null;
  if (worker) worker.terminate();
  result = null;
  hand = null;
  refreshActions();
  jobScenario = structuredClone(s);
  if (!resume) checkpoint = [];
  $("#compute").disabled = true;
  $("#pause").disabled = false;
  $("#resume").disabled = true;
  $("#check").disabled = $("#shove").disabled = true;
  let nativeProfile = null;
  if (s.engine === "native") {
    controller = new AbortController();
    msg("TexasSolver is computing the baseline…", "TexasSolver 正在计算基线…");
    const started = Date.now(),
      tick = setInterval(() => {
        if (token === runId)
          msg(
            `Computing ${s.game === "full" ? "flop, turn and river" : "the baseline"} · ${Math.floor((Date.now() - started) / 1000)} seconds elapsed. You can stop and restart this run.`,
            `正在计算 · 已用时 ${Math.floor((Date.now() - started) / 1000)} 秒。可停止并重新开始。`,
          );
      }, 1000);
    try {
      const data = await nativeSolve(s, controller.signal);
      if (token !== runId) return;
      nativeProfile = data;
    } catch (e) {
      if (token === runId) {
        stop();
        msg(e.message);
      }
      return;
    } finally {
      clearInterval(tick);
    }
  }
  if (token !== runId) return;
  worker = new Worker("./worker.js", { type: "module" });
  msg(
    s.game === "full"
      ? "Validating every street and evaluating decision EVs…"
      : "Computing all legal runouts…",
    "正在验证发牌与决策 EV…",
  );
  const g = validate(s);
  $("#progress").max = g.pairs.length;
  $("#progress").value = checkpoint.length;
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      checkpoint = data.eq;
      $("#progress").value = data.done;
      msg(
        `${data.done}/${data.total} hand pairs · ${data.total * 990} runouts · estimated result memory < 1 MB`,
        `${data.done}/${data.total} 手牌对 · ${data.total * 990} 种发牌 · 预计结果内存 < 1 MB`,
      );
      save();
    }
    if (data.type === "result") {
      result = data.result;
      if (result.full) cachedBaseline = result;
      if (result.full)
        solutionStore("current", result).catch((e) =>
          msg("Solution could not be saved: " + e.message),
        );
      stop();
      save();
      reportStatus();
      refreshTarget();
      analysis();
    }
    if (data.type === "error") {
      stop();
      msg(data.message);
    }
  };
  worker.onerror = (e) => {
    stop();
    msg(e.message || "Worker failed");
  };
  worker.postMessage({ scenario: s, checkpoint, nativeProfile });
}
function stop() {
  runId++;
  controller?.abort();
  controller = null;
  worker?.terminate();
  worker = null;
  packageJob = null;
  $("#export-solution").disabled = !result?.full;
  $("#import").disabled = false;
  $("#deal").disabled = false;
  $("#compute").disabled = false;
  $("#pause").disabled = true;
  $("#resume").disabled = !jobScenario || !!result;
}
function reportStatus() {
  const met = result.gap <= 0.001;
  msg(
    `${result.full ? "Flop, turn and river · " + result.nodes.toLocaleString() + " verified nodes" : "Coverage complete"} · measured gap ${result.gap.toFixed(5)} bb · 0.001 bb precision target ${met ? "met" : "not met; increase iterations"}. Loss versus untested sizes is unknown.`,
    `覆盖完整 · 实测差距 ${result.gap.toFixed(5)} 大盲 · ${met ? "达到" : "未达到，请增加迭代"} 0.001 大盲精度目标。未测试尺度的损失未知。`,
  );
  if (result.full && result.selection)
    $("#status").textContent += t(
      ` Retained-menu loss ${result.selection.loss.toFixed(5)} bb · target ${result.selection.targetReached ? "met" : "not met"} against the fixed opponent.`,
      ` 保留尺度的损失 ${result.selection.loss.toFixed(5)} 大盲 · 对固定对手${result.selection.targetReached ? "达到" : "未达到"}损失目标。`,
    );
}
form.onsubmit = (e) => {
  e.preventDefault();
  try {
    const s = read();
    start(s);
  } catch (e) {
    msg(e.message);
  }
};
$("#pause").onclick = () => {
  if (packageJob) {
    stop();
    analysis();
    msg(
      "Package operation cancelled. The previous scenario is unchanged.",
      "已取消文件操作，原场景未更改。",
    );
    return;
  }
  stop();
  save();
  msg(
    jobScenario?.game === "full"
      ? "Stopped. Resume restarts full-tree precomputation; no native iteration checkpoint is saved."
      : "Paused. Completed hand pairs are saved; resume continues from the last pair.",
    jobScenario?.game === "full"
      ? "已停止。继续将重新计算完整树，不保留原生迭代检查点。"
      : "已暂停。已完成的手牌对已保存，可继续计算。",
  );
};
$("#resume").onclick = () => {
  if (jobScenario) {
    fill(jobScenario);
    start(jobScenario, true);
  }
};
form.addEventListener("input", (e) => {
  if (e.target.id === "import") return;
  if (rangeOrigins && ["hero", "villain", "flop"].includes(e.target.name)) {
    if (e.target.name === "flop") rangeOrigins = null;
    else {
      delete rangeOrigins[e.target.name];
      if (!Object.keys(rangeOrigins).length) rangeOrigins = null;
    }
  }
  formatControls();
  fullTraining?.cancel();
  fullTraining = null;
  worker?.terminate();
  worker = null;
  result = null;
  hand = null;
  checkpoint = [];
  jobScenario = null;
  stop();
  refreshActions();
  $("#check").disabled = $("#shove").disabled = true;
  $("#deal").disabled = false;
  msg(
    "Settings changed. Precompute before training.",
    "设置已更改，训练前请重新计算。",
  );
});
$("#clear-model").onclick = () => {
  fullModel = null;
  form.dispatchEvent(new Event("input", { bubbles: true }));
};
function download(obj, filename = "poker-scenario.json") {
  const url = URL.createObjectURL(
      obj instanceof Blob
        ? obj
        : new Blob([JSON.stringify(obj, null, 2)], {
            type: "application/json",
          }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#export").onclick = () => {
  try {
    const s = read();
    download(
      scenarioPackage(
        s,
        result && sameScenario(s, jobScenario) ? result.eq : undefined,
      ),
    );
    msg(
      "Exported without personal training records.",
      "已导出，不含个人训练记录。",
    );
  } catch (e) {
    msg(e.message);
  }
};
function transferPackage(type, payload) {
  if (packageJob)
    throw Error("Wait for the current operation or cancel it first");
  if (hand)
    throw Error("Finish the hand before importing or exporting a solution");
  stop();
  const token = runId;
  packageJob = type;
  worker = new Worker("./package-worker.js", { type: "module" });
  $("#compute").disabled = true;
  $("#pause").disabled = false;
  $("#resume").disabled = true;
  $("#export-solution").disabled = true;
  $("#import").disabled = true;
  $("#deal").disabled = true;
  msg(
    type === "export"
      ? "Preparing the solved scenario without personal records…"
      : "Checking all saved branches and recalculating feedback; no solver run is needed…",
    type === "export"
      ? "正在导出已求解场景，不含个人记录…"
      : "正在检查完整分支并重新计算反馈，无需运行求解器…",
  );
  worker.onerror = (e) => {
    if (token !== runId) return;
    stop();
    analysis();
    msg(e.message || "Package operation failed");
  };
  worker.onmessage = async ({ data }) => {
    if (token !== runId) return;
    stop();
    if (data.type === "error") {
      analysis();
      msg(data.message);
      return;
    }
    if (data.type === "exported") {
      download(data.blob, "poker-solved-scenario.json");
      msg(
        "Solved scenario exported without personal training records.",
        "已导出求解结果，不含个人训练记录。",
      );
      return;
    }
    fullTraining?.cancel();
    fullTraining = null;
    hand = null;
    checkpoint = [];
    jobScenario = data.scenario;
    result = data.result;
    if (result?.full) cachedBaseline = result;
    if (type !== "remodel") explorerPath = "root";
    fill(jobScenario);
    $("#check").disabled = $("#shove").disabled = true;
    $("#resume").disabled = !!result;
    refreshTarget();
    analysis();
    save();
    const imported = result;
    if (imported) {
      reportStatus();
      try {
        await solutionStore("current", imported);
      } catch (e) {
        if (result === imported)
          msg("Imported, but could not save locally: " + e.message);
      }
    } else
      msg(
        "Scenario imported. Precompute before training.",
        "场景已导入，训练前请预计算。",
      );
  };
  worker.postMessage({ type, ...payload });
}
$("#export-solution").onclick = () => {
  try {
    if (!result?.full || !sameScenario(read(), result.scenario))
      throw Error(
        "Precompute these settings before exporting a solved scenario",
      );
    transferPackage("export", { result });
  } catch (e) {
    msg(e.message);
  }
};
$("#import").onchange = (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > PACKAGE_LIMIT) throw Error("Package exceeds 128 MiB");
    transferPackage("import", { file });
  } catch (e) {
    msg(e.message);
  } finally {
    $("#import").value = "";
  }
};
function cardHTML(cs) {
  return cs
    .map((c) => {
      if (c === null)
        return '<span class="card back" aria-label="Hidden card">?</span>';
      const n = cardName(c);
      return `<span class="card ${"dh".includes(n[1]) ? "red" : ""}">${n[0]}${{ c: "♣", d: "♦", h: "♥", s: "♠" }[n[1]]}</span>`;
    })
    .join("");
}
function beginFullTraining(sampling, target = "", drill = null) {
  try {
    const sourceResult = result;
    if (drill) drillContext(result, drill);
    reportStatus();
    fullTraining?.cancel();
    fullTraining = startFullTraining(result, sampling, {
      cardHTML,
      practiceTarget: target,
      drill,
      onFinish(record) {
        records.unshift(record);
        records = records.slice(0, 1000);
        hand = null;
        fullTraining = null;
        save();
        history();
        reportStatus();
        if (drill) {
          const repeat = document.createElement("button");
          repeat.textContent = t("Repeat this decision", "再次练习此决策");
          repeat.onclick = () => {
            if (result !== sourceResult) {
              msg(
                "Choose a decision from the current solution.",
                "请从当前解中选择决策。",
              );
              return;
            }
            beginFullTraining(null, target, drill);
          };
          $("#feedback").append(repeat);
        }
      },
      onError(e) {
        hand = null;
        fullTraining = null;
        $("#deal").disabled = false;
        msg(e.message);
      },
    });
    hand = {};
    $("#sampling-note").textContent = drill
      ? t(
          `Decision drill · conditional ${drill.profile === "baseline" ? "baseline" : "adjusted hero + fixed opponent"} range. Earlier actions are context only; feedback follows your one choice. The full-hand sampling selector does not apply.`,
          `单次决策训练 · 按${drill.profile === "baseline" ? "基线" : "玩家调整策略 + 固定对手"}条件范围采样。此前行动仅作背景，只评分本次选择。完整手牌采样选择器不适用。`,
        )
      : target
        ? t(
            "Targeted practice · all applicable streets",
            "定向训练 · 所有适用街道",
          )
        : t("Full range · all applicable streets", "完整范围 · 所有适用街道");
    show("train");
  } catch (e) {
    hand = null;
    $("#deal").disabled = false;
    msg(e.message);
  }
}
$("#deal").onclick = () => {
  if (!result) {
    msg("Precompute a scenario first.", "请先预计算场景。");
    show("setup");
    return;
  }
  const g = validate(result.scenario);
  reportStatus();
  const target = $("#target").value;
  let sampling = g;
  if (target !== "") {
    const indices = target.includes(":")
        ? practiceGroups(g).find((group) => group.key === target)?.indices || []
        : [Number(target)],
      pairs = g.pairs.filter((p) => indices.includes(p.i)),
      mass = pairs.reduce((a, p) => a + p.weight, 0);
    if (!mass) {
      msg("Selected hand has no legal deals.", "所选手牌没有合法发牌。");
      return;
    }
    sampling = {
      ...g,
      pairs: pairs.map((p) => ({ ...p, weight: p.weight / mass })),
    };
  }
  if (result.full) {
    beginFullTraining(sampling, target);
    return;
  }
  hand = {
    ...sample(sampling),
    targeted: target !== "",
    practiceTarget: target,
  };
  $("#action-history").replaceChildren();
  $("#sampling-note").textContent = hand.targeted
    ? t(
        "Targeted practice: this changes the configured sampling distribution.",
        "定向训练：已改变原配置的采样分布。",
      )
    : t("Sampling from the full configured ranges.", "从完整配置范围采样。");
  $("#hero-cards").innerHTML = cardHTML(g.hero[hand.i].cards);
  $("#opponent").innerHTML = cardHTML([null, null]);
  $("#board").innerHTML = cardHTML(g.board);
  $("#pot-display").textContent =
    t("Pot", "底池") +
    ` ${result.scenario.pot} bb · ` +
    t("Stack", "筹码") +
    ` ${result.scenario.stack} bb`;
  $("#feedback").textContent = "";
  $("#check").disabled = $("#shove").disabled = false;
  $("#deal").disabled = true;
  refreshActions();
};
function act(action) {
  if (
    !hand ||
    !result ||
    (result.sized && !result.actions.map((_, i) => i).includes(action))
  )
    return;
  const s = result.scenario,
    g = validate(s),
    h = g.hero[hand.i],
    v = g.villain[hand.j],
    called =
      action > 0 &&
      Math.random() <
        (result.sized
          ? result.model[hand.j][action - 1]
          : result.model[hand.j]),
    ev = result.ev[hand.i],
    loss = Math.max(...ev) - ev[action],
    board = [...g.board, ...hand.runout],
    a = rank7([...h.cards, ...board]),
    b = rank7([...v.cards, ...board]);
  const outcome =
    action > 0 && !called
      ? t("Opponent folded", "对手弃牌")
      : a === b
        ? t("Split pot", "平分底池")
        : a > b
          ? t("You win", "你获胜")
          : t("Opponent wins", "对手获胜");
  $("#opponent").innerHTML = cardHTML(v.cards);
  const revealedBoard = action > 0 && !called ? g.board : board;
  $("#board").innerHTML = cardHTML(revealedBoard);
  const feedback = result.sized
    ? `${outcome}. ${t("EV loss", "EV 损失")}: ${loss.toFixed(4)} bb · ${actionLabel(result, action, t)} EV ${ev[action].toFixed(4)} bb · ${t("Target frequency", "目标频率")} ${(100 * result.adjusted[hand.i][action]).toFixed(1)}%`
    : `${outcome}. ${t("EV loss", "EV 损失")}: ${loss.toFixed(3)} bb. ${t("Check / shove EV", "过牌 / 全下 EV")}: ${ev[0].toFixed(3)} / ${ev[1].toFixed(3)} bb. ${t("Target shove frequency", "目标全下频率")}: ${(result.adjusted[hand.i] * 100).toFixed(1)}%.`;
  $("#feedback").textContent = feedback;
  records.unshift({
    date: new Date().toISOString(),
    scenario: s.name,
    config: structuredClone(s),
    hero: h.label,
    villain: v.label,
    board: revealedBoard.map(cardName).join(" "),
    action,
    actionLabel: actionLabel(result, action, t),
    loss,
    ev,
    target: result.adjusted[hand.i],
    bookmark: false,
    targeted: hand.targeted,
    practiceTarget: hand.practiceTarget,
    actions: result.sized ? result.actions : [0, s.stack],
    called,
  });
  records = records.slice(0, 1000);
  hand = null;
  refreshActions();
  $("#check").disabled = $("#shove").disabled = true;
  $("#deal").disabled = false;
  save();
  history();
}
$("#check").onclick = () => act(0);
$("#shove").onclick = () => act(1);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function matrix(range) {
  const ranks = [...RANKS].reverse(),
    labels = range.map((h) => {
      const a = cardName(h.cards[0]),
        b = cardName(h.cards[1]),
        sorted = [a[0], b[0]].sort(
          (a, b) => RANKS.indexOf(b) - RANKS.indexOf(a),
        );
      return sorted.join("") + (a[0] === b[0] ? "" : a[1] === b[1] ? "s" : "o");
    });
  return (
    '<div class="grid">' +
    ranks
      .flatMap((a, i) =>
        ranks.map((b, j) => {
          const label = i === j ? a + b : i < j ? a + b + "s" : b + a + "o";
          return `<span class="cell ${labels.includes(label) ? "in" : ""}">${label}</span>`;
        }),
      )
      .join("") +
    "</div>"
  );
}
function analysis() {
  disposeFlopReport();
  disposeFlopReport = flopReportPanel(
    $("#flop-comparison"),
    library,
    flopViewState,
    t,
  );
  const el = $("#analysis-content");
  if (!result) {
    el.textContent = t(
      "Precompute a scenario to inspect strategies and ranges.",
      "请预计算场景以查看策略和范围。",
    );
    return;
  }
  const s = result.scenario,
    g = validate(s);
  if (result.full) {
    el.innerHTML =
      `<div class="report"><h2>${esc(s.name)}</h2><p>Flop → turn → river · ${result.nodes.toLocaleString()} verified nodes · ${result.coverage.toLocaleString()} compatible ordered runouts</p><p class="metric">${result.gap.toFixed(5)} bb</p><p>Independently measured baseline Nash gap within the configured tree. Every offered action has an evaluated continuation. EV loss uses the best continuation against the fixed opponent model. Untested sizes and trees with more raises remain outside this comparison.</p><p>Calling tendency preserves the relative weights of non-call actions. Detailed opponent edits replace the complete action distribution for one combination at one decision. The deviation slider blends the baseline with the best response; it is not a robustness guarantee.</p>${result.root.player === 1 ? `<p>${t("You are in position. The opponent acts first; explore their action to inspect your response EVs.", "玩家有位置，对手先行动；选择对手动作以查看回应 EV。")} ${t("Range best-response EV against this model", "对此模型的范围最佳回应 EV")}: ${result.modelEV.toFixed(4)} bb</p>` : ""}${result.root.player === 0 ? `<table><thead><tr><th>Hero</th><th>Root action EVs</th></tr></thead><tbody>${g.hero.map((h, i) => `<tr><td>${h.label}</td><td>${result.root.ev?.[i]?.map((v, a) => `${esc(result.root.actions[a].kind)}${result.root.actions[a].amount ? " " + result.root.actions[a].amount + " bb" : ""}: ${v.toFixed(4)}`).join(" · ") || "No compatible deals"}</td></tr>`).join("")}</tbody></table>` : ""}</div>` +
      equityReport(g, result.eq, t, esc);
    el.insertAdjacentHTML(
      "beforeend",
      `<details class="report"><summary>${t("Range matrices", "范围矩阵")}</summary><h3>${t("You", "玩家")}</h3>${matrix(g.hero)}<h3>${t("Opponent", "对手")}</h3>${matrix(g.villain)}</details>`,
    );
    fullSizingReport(el, result, t);
    if (s.fullTendencies) {
      const summary = document.createElement("p");
      summary.textContent = tendencySummary(s, t);
      el.append(summary);
    }
    fullExplorer(
      el,
      result,
      (path, combo, policy) => {
        if (packageJob) throw Error("Wait for the current update to finish");
        const scenario = editFullModel(result.scenario, path, combo, policy);
        transferPackage("remodel", { result, scenario });
      },
      t,
      explorerPath,
      (path) => {
        explorerPath = path;
      },
      (drill) =>
        beginFullTraining(
          null,
          `decision:${drill.profile}:${drill.path}`,
          drill,
        ),
    );
    return;
  }
  if (result.sized) {
    el.innerHTML =
      sizingReport(result, g, t, esc, matrix) +
      equityReport(g, result.eq, t, esc);
    return;
  }
  el.innerHTML = `<div class="report"><p class="eyebrow">${t("COMPUTATION REPORT", "计算报告")}</p><h2>${esc(s.name)}</h2><p>${t("Full runout enumeration within the restricted game", "受限游戏内完整枚举发牌")}: ${result.coverage.toLocaleString()} · ${s.iterations.toLocaleString()} ${t("iteration budget", "迭代预算")} · ${esc(result.engine)}</p><p class="metric">${result.gap.toFixed(5)} bb</p><p>${t("Sum of unilateral deviation incentives at the average baseline. With zero rake this is a Nash gap; with rake it is a profile diagnostic, not a convergence guarantee.", "平均基线策略下，双方单方面偏移激励之和。无抽水时为纳什差距；有抽水时仅为策略诊断，不保证收敛。")}</p><p>${t("Runout sampling error: zero. Bet restriction loss: unknown. No robustness bound for deviation blending.", "发牌采样误差为零。下注限制损失未知。策略混合无稳健性界限。")}</p><div class="scroll"><table><thead><tr><th>${t("Hero combo · weight", "玩家组合 · 权重")}</th><th>${t("Baseline shove", "基线全下")}</th><th>${t("Adjusted shove", "调整后全下")}</th><th>${t("Check EV", "过牌 EV")}</th><th>${t("Shove EV", "全下 EV")}</th></tr></thead><tbody>${g.hero.map((h, i) => `<tr><td>${h.label} · ${h.weight}</td><td>${(100 * result.baseline[i]).toFixed(1)}%</td><td>${(100 * result.adjusted[i]).toFixed(1)}%</td><td>${result.ev[i][0].toFixed(3)}</td><td>${result.ev[i][1].toFixed(3)}</td></tr>`).join("")}</tbody></table></div>${matrix(g.hero)}<p class="hint">${t("Highlighted cells contain configured combinations, not full hand classes. Weights are shown in the tables.", "高亮单元格包含已配置组合，并非整个手牌类别。权重见表格。")}</p><table><thead><tr><th>${t("Opponent combo · weight", "对手组合 · 权重")}</th><th>${t("Baseline call", "基线跟注")}</th><th>${t("Modeled call", "模型跟注")}</th></tr></thead><tbody>${g.villain.map((h, i) => `<tr><td>${h.label} · ${h.weight}</td><td>${(100 * result.calls[i]).toFixed(1)}%</td><td>${(100 * result.model[i]).toFixed(1)}%</td></tr>`).join("")}</tbody></table>${matrix(g.villain)}</div>`;
  el.insertAdjacentHTML("beforeend", equityReport(g, result.eq, t, esc));
}
function history() {
  const loss = records.reduce((a, r) => a + r.loss, 0);
  $("#stats").textContent =
    `${records.length} ${t("hands/drills", "手牌/决策训练")} · ${t("Mean total EV loss per entry", "每条记录平均总 EV 损失")} ${records.length ? (loss / records.length).toFixed(3) : "—"} bb · ${records.reduce((n, r) => n + (r.full ? r.decisions.length : 1), 0)} ${t("decisions", "次决策")}`;
  const el = $("#records");
  el.innerHTML = frequencyReport(
    records.filter((r) => !r.full),
    t,
    esc,
  );
  fullFrequencyReport(el, records);
  records.forEach((r, i) => {
    if (filter && r.loss < 0.01 && !r.bookmark) return;
    const div = document.createElement("div");
    div.className = "record";
    const text = document.createElement("p");
    text.textContent = `${r.scenario} · ${r.hero} / ${r.villain} · ${r.board} · ${r.drill ? t("Decision drill · ", "单次决策训练 · ") : ""}${r.full ? r.decisions.length + t(r.decisions.length === 1 ? " decision" : " decisions", " 次决策") : r.action ? t("Bet", "下注") + " " + recordActions(r)[r.action] + " bb" : t("Check", "过牌")} · ${r.loss.toFixed(3)} bb`;
    const button = document.createElement("button");
    button.textContent = r.bookmark ? "★" : "☆";
    button.setAttribute("aria-label", t("Toggle bookmark", "切换书签"));
    button.onclick = () => {
      records[i].bookmark = !records[i].bookmark;
      save();
      history();
    };
    const replay = document.createElement("button");
    replay.textContent = t("Replay details", "复盘详情");
    replay.onclick = () => {
      (r.full ? fullReplay : replayHand)(
        div,
        r,
        ...(r.full ? [cardHTML, cards] : [t, cardHTML, cards]),
      );
      replay.disabled = true;
    };
    div.append(button, replay, text);
    el.append(div);
  });
  if (!el.childNodes.length)
    el.textContent = t(
      "No hands here yet. Your next decision starts the journal.",
      "尚无记录。开始训练以记录决策。",
    );
}
$("#mistakes").onclick = () => {
  filter = true;
  history();
};
$("#all-history").onclick = () => {
  filter = false;
  history();
};
fill({
  ...DEFAULT,
  game: "full",
  iterations: 1000,
  fullSizing: { mode: "fast", maxBets: 1, maxRaises: 1, lossTarget: 0.01 },
});
try {
  const raw = localStorage.getItem(key);
  if (raw) {
    const saved = JSON.parse(raw),
      p = importPackage({ ...saved, equities: undefined });
    fill(p.scenario);
    jobScenario = p.scenario;
    checkpoint = jobScenario.game === "full" ? [] : saved.equities || [];
    if (
      !Array.isArray(checkpoint) ||
      checkpoint.length > validate(jobScenario).pairs.length ||
      checkpoint.some((e) => !Number.isFinite(e) || e < 0 || e > 1)
    )
      throw Error("Invalid saved checkpoint");
    records = Array.isArray(saved.records)
      ? saved.records
          .filter(
            (r) =>
              Number.isFinite(r.loss) &&
              r.loss >= 0 &&
              typeof r.hero === "string" &&
              typeof r.board === "string",
          )
          .slice(0, 1000)
      : [];
    lang = saved.lang === "zh" ? "zh" : "en";
    if (
      jobScenario.game !== "full" &&
      saved.result &&
      checkpoint.length === validate(jobScenario).pairs.length
    )
      result = solveScenario(jobScenario, checkpoint, saved.nativeProfile);
    $("#resume").disabled = !!result || !jobScenario;
    msg(result ? "Saved solution restored." : "Saved scenario restored.");
  }
} catch {
  msg(
    "Saved data could not be loaded. A fresh example is ready.",
    "无法加载已保存数据，已准备新示例。",
  );
}
translate();
if (jobScenario?.game === "full") {
  const expected = structuredClone(jobScenario),
    token = runId;
  solutionStore("current")
    .then((saved) => {
      if (
        token !== runId ||
        !saved?.full ||
        !sameScenario(saved.scenario, expected)
      )
        return;
      result = saved;
      cachedBaseline = saved;
      $("#resume").disabled = true;
      refreshTarget();
      analysis();
      reportStatus();
    })
    .catch((e) => msg("Saved solution could not be loaded: " + e.message));
}

engineInfo()
  .then((info) => {
    if (!jobScenario && info.native) $("#engine").value = "native";
    if (!info.native)
      $("#engine").querySelector('[value="native"]').disabled = true;
  })
  .catch(() => {});

function refreshTarget() {
  refreshActions();
  const select = $("#target");
  const previous = select.value;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t(
    "All hands · configured distribution",
    "所有手牌 · 配置分布",
  );
  select.append(all);
  if (result)
    validate(result.scenario).hero.forEach((h, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = h.label;
      select.append(o);
    });
  if (result)
    for (const group of practiceGroups(validate(result.scenario))) {
      const option = document.createElement("option");
      option.value = group.key;
      option.textContent = t(...group.label);
      select.append(option);
    }
  if ([...select.options].some((o) => o.value === previous))
    select.value = previous;
}
function refreshLibrary() {
  const select = $("#library");
  select.replaceChildren();
  Object.keys(library).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    select.append(o);
  });
}
try {
  const raw = localStorage.getItem(key + "-library");
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      library = parsed;
  }
} catch {}
refreshLibrary();
refreshTarget();
$("#save-scenario").onclick = async () => {
  $("#save-scenario").disabled = true;
  try {
    const scenario = read();
    library = {
      ...library,
      [scenario.name]: {
        schema: 1,
        scenario,
        equities: result?.full ? null : result?.eq || null,
        nativeProfile: result?.nativeProfile || null,
      },
    };
    localStorage.setItem(key + "-library", JSON.stringify(library));
    flopViewState.report = null;
    refreshLibrary();
    $("#library").value = scenario.name;
    msg("Saving the complete solution…", "正在保存完整解…");
    if (result?.full && sameScenario(scenario, result.scenario))
      await solutionStore("library:" + scenario.name, result);
    msg("Scenario saved to your local library.", "场景已保存到本地库。");
  } catch (e) {
    msg(e.message);
  } finally {
    $("#save-scenario").disabled = false;
  }
};
$("#load-scenario").onclick = async () => {
  try {
    const saved = library[$("#library").value];
    if (!saved) throw Error("Choose a saved scenario");
    const p = importPackage(saved);
    stop();
    hand = null;
    jobScenario = p.scenario;
    checkpoint = p.equities || [];
    result =
      p.scenario.game === "full"
        ? await solutionStore("library:" + p.scenario.name)
        : p.equities
          ? solveScenario(jobScenario, checkpoint, saved.nativeProfile)
          : null;
    if (result && !sameScenario(result.scenario, jobScenario)) result = null;
    if (result?.full) cachedBaseline = result;
    fill(jobScenario);
    $("#deal").disabled = false;
    $("#check").disabled = $("#shove").disabled = true;
    refreshTarget();
    analysis();
    save();
    if (result?.full)
      solutionStore("current", result).catch((e) =>
        msg("Solution could not be saved: " + e.message),
      );
    msg("Scenario loaded.", "场景已加载。");
  } catch (e) {
    msg(e.message);
  }
};

function refreshActions() {
  $("#export-solution").disabled = !result?.full || !!packageJob;
  if (result?.full) {
    $("#check").hidden = $("#shove").hidden = true;
    if (!fullTraining) $("#sized-actions").replaceChildren();
    return;
  }
  const sized = !!result?.sized;
  $("#check").hidden = $("#shove").hidden = sized;
  const box = $("#sized-actions");
  box.replaceChildren();
  if (sized)
    for (const a of result.actions.map((_, i) => i)) {
      const button = document.createElement("button");
      button.textContent = actionLabel(result, a, t);
      button.disabled = !hand;
      button.onclick = () => act(a);
      box.append(button);
    }
}
function updateCandidatePreview() {
  const resources = $("#resource-preview");
  resources.replaceChildren();
  resources.hidden = form.elements.game.value !== "full";
  try {
    const s = read(),
      g = validate(s);
    $("#size-preview").textContent =
      t("Candidate bets (bb): ", "候选下注（大盲）：") +
      betAmounts(s).join(", ") +
      t(" · Exact runouts: ", " · 精确发牌数：") +
      g.pairs.length * 990;
    if (s.game === "full") {
      $("#full-size-preview").textContent =
        t("Full-hand candidates · ", "完整手牌候选尺度 · ") +
        Object.entries(fullCandidates(s))
          .map(
            ([street, cfg]) =>
              `${street}: bets ${cfg.bet.join("/")}% · raises ${cfg.raise.join("/")}%`,
          )
          .join(" · ") +
        t(" · legal all-ins included", " · 包括合法全下");
      const estimate = estimateFullResources(s);
      const heading = document.createElement("h3");
      heading.textContent = t("Before solving", "计算前检查");
      resources.append(heading);
      const lines = [
        t(
          `Full tree: ${estimate.nodes.toLocaleString()} / ${estimate.nodeLimit.toLocaleString()} nodes · ${estimate.withinNodeBudget ? "within the app's node capacity" : "too large to precompute"}.`,
          `完整树：${estimate.nodes.toLocaleString()} / ${estimate.nodeLimit.toLocaleString()} 个节点 · ${estimate.withinNodeBudget ? "未超出应用节点容量" : "过大，无法预计算"}。`,
        ),
        t(
          `${estimate.publicBoards[1]} compatible turn cards · ${estimate.publicBoards[2].toLocaleString()} ordered turn–river boards · ${estimate.pairRunouts.toLocaleString()} private-pair/runout combinations.`,
          `${estimate.publicBoards[1]} 张兼容转牌 · ${estimate.publicBoards[2].toLocaleString()} 种有序转牌/河牌牌面 · ${estimate.pairRunouts.toLocaleString()} 种私牌对/发牌组合。`,
        ),
        t(
          `Baseline probabilities alone: ${(estimate.compactPolicyBytes / 1048576).toFixed(2)} MiB in compact numeric form. Total RAM and runtime are not yet predicted: the solver, tree objects, feedback and exports require additional memory. This is not an 8 GB hardware guarantee.`,
          `仅基线概率的紧凑数值数据：${(estimate.compactPolicyBytes / 1048576).toFixed(2)} MiB。尚未预测总内存和运行时间；求解器、树对象、反馈和导出需要额外内存。这不保证在 8 GB 电脑上运行。`,
        ),
        t(
          "Fewer candidate sizes, shorter stacks or Fast instead of Deep can reduce the tree. Lower retained-menu limits do not reduce baseline precomputation. Imported solutions avoid solving, but still need memory to load.",
          "减少候选尺度、降低有效筹码或将 Deep 改为 Fast 可缩小树。降低保留尺度上限不会减少基线计算量。导入已有解可跳过求解，但加载仍需要内存。",
        ),
      ];
      for (const line of lines) {
        const p = document.createElement("p");
        p.textContent = line;
        resources.append(p);
      }
    }
  } catch (e) {
    $("#size-preview").textContent = e.message;
    $("#full-size-preview").textContent = e.message;
    resources.textContent = e.message;
  }
}
form.addEventListener("input", updateCandidatePreview);
