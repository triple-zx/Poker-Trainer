import { engineInfo, nativeSolve } from "./runtime.js";
import { practiceGroups, recordActions } from "./analytics.js";
import { equityReport, frequencyReport, replayHand } from "./analytics-ui.js";
import { solveSized, betAmounts } from "./sizing.js";
import { actionLabel, sizingReport } from "./sizing-ui.js";
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
const t = (en, zh) => (lang === "en" ? en : zh);
const msg = (en, zh = en) => ($("#status").textContent = t(en, zh));
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
  if (s.sizingMode !== "allin")
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
  ])
    delete s[field];
  validate(s);
  betAmounts(s);
  return s;
}
function fill(s) {
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
}
function save() {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        scenario: jobScenario || read(),
        equities: checkpoint,
        result: !!result,
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
  if (hand && (tab === "analysis" || tab === "history")) {
    msg("Finish the hand before opening analysis.", "请先完成本手再查看分析。");
    return;
  }
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== tab));
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "analysis") analysis();
  if (tab === "history") history();
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => show(b.dataset.tab)));
function translate() {
  if (result) reportStatus();
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document
    .querySelectorAll("[data-en]")
    .forEach((e) => (e.textContent = e.dataset[lang]));
  $("#language").textContent = lang === "en" ? "中文" : "English";
  refreshTarget();
  analysis();
  history();
}
$("#language").onclick = () => {
  lang = lang === "en" ? "zh" : "en";
  translate();
  save();
};
async function start(s, resume = false) {
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
    }
  }
  if (token !== runId) return;
  worker = new Worker("./worker.js", { type: "module" });
  msg("Computing all legal runouts…", "正在计算全部合法发牌…");
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
  $("#compute").disabled = false;
  $("#pause").disabled = true;
  $("#resume").disabled = !jobScenario || !!result;
}
function reportStatus() {
  const met = result.gap <= 0.001;
  msg(
    `Coverage complete · measured gap ${result.gap.toFixed(5)} bb · 0.001 bb precision target ${met ? "met" : "not met; increase iterations"}. Loss versus untested sizes is unknown.`,
    `覆盖完整 · 实测差距 ${result.gap.toFixed(5)} 大盲 · ${met ? "达到" : "未达到，请增加迭代"} 0.001 大盲精度目标。未测试尺度的损失未知。`,
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
  stop();
  save();
  msg(
    "Paused. Completed hand pairs are saved; resume continues from the last pair.",
    "已暂停。已完成的手牌对已保存，可继续计算。",
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
function download(obj) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "poker-scenario.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#export").onclick = () => {
  try {
    const s = read();
    download({
      schema: 1,
      scenario: s,
      equities:
        result && JSON.stringify(s) === JSON.stringify(jobScenario)
          ? result.eq
          : undefined,
    });
    msg(
      "Exported without personal training records.",
      "已导出，不含个人训练记录。",
    );
  } catch (e) {
    msg(e.message);
  }
};
$("#import").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1000000) throw Error("Package exceeds 1 MB");
    const p = importPackage(JSON.parse(await file.text()));
    stop();
    result = null;
    hand = null;
    checkpoint = [];
    jobScenario = null;
    fill(p.scenario);
    refreshActions();
    $("#deal").disabled = false;
    $("#check").disabled = $("#shove").disabled = true;
    msg(
      "Scenario imported. Recompute to verify any supplied equities before training.",
      "场景已导入。训练前重新计算以验证权益。",
    );
    save();
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
$("#deal").onclick = () => {
  if (!result) {
    msg("Precompute a scenario first.", "请先预计算场景。");
    show("setup");
    return;
  }
  const g = validate(result.scenario);
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
  hand = {
    ...sample(sampling),
    targeted: target !== "",
    practiceTarget: target,
  };
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
    (result.sized && !result.activeActions.includes(action))
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
    loss =
      Math.max(
        ...(result.sized ? result.activeActions.map((a) => ev[a]) : ev),
      ) - ev[action],
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
    `${records.length} ${t("hands", "手")} · ${t("Mean EV loss", "平均 EV 损失")} ${records.length ? (loss / records.length).toFixed(3) : "—"} bb · ${t("Observed bet rate (across recorded contexts)", "已记录场景下注率")} ${records.length ? ((100 * records.filter((r) => r.action > 0).length) / records.length).toFixed(1) : "—"}%`;
  const el = $("#records");
  el.innerHTML = frequencyReport(records, t, esc);
  records.forEach((r, i) => {
    if (filter && r.loss < 0.01 && !r.bookmark) return;
    const div = document.createElement("div");
    div.className = "record";
    const text = document.createElement("p");
    text.textContent = `${r.scenario} · ${r.hero} / ${r.villain} · ${r.board} · ${r.action ? t("Bet", "下注") + " " + recordActions(r)[r.action] + " bb" : t("Check", "过牌")} · ${r.loss.toFixed(3)} bb`;
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
      replayHand(div, r, t, cardHTML, cards);
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
fill(DEFAULT);
try {
  const raw = localStorage.getItem(key);
  if (raw) {
    const saved = JSON.parse(raw),
      p = importPackage(saved);
    fill(p.scenario);
    jobScenario = p.scenario;
    checkpoint = p.equities || [];
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
$("#save-scenario").onclick = () => {
  try {
    const scenario = read();
    library = {
      ...library,
      [scenario.name]: {
        schema: 1,
        scenario,
        equities: result?.eq || null,
        nativeProfile: result?.nativeProfile || null,
      },
    };
    localStorage.setItem(key + "-library", JSON.stringify(library));
    refreshLibrary();
    $("#library").value = scenario.name;
    msg("Scenario saved to your local library.", "场景已保存到本地库。");
  } catch (e) {
    msg(e.message);
  }
};
$("#load-scenario").onclick = () => {
  try {
    const saved = library[$("#library").value];
    if (!saved) throw Error("Choose a saved scenario");
    const p = importPackage(saved);
    stop();
    hand = null;
    jobScenario = p.scenario;
    checkpoint = p.equities || [];
    result = p.equities
      ? solveScenario(jobScenario, checkpoint, saved.nativeProfile)
      : null;
    fill(jobScenario);
    $("#deal").disabled = false;
    $("#check").disabled = $("#shove").disabled = true;
    refreshTarget();
    analysis();
    save();
    msg("Scenario loaded.", "场景已加载。");
  } catch (e) {
    msg(e.message);
  }
};

function refreshActions() {
  const sized = !!result?.sized;
  $("#check").hidden = $("#shove").hidden = sized;
  const box = $("#sized-actions");
  box.replaceChildren();
  if (sized)
    for (const a of result.activeActions) {
      const button = document.createElement("button");
      button.textContent = actionLabel(result, a, t);
      button.disabled = !hand;
      button.onclick = () => act(a);
      box.append(button);
    }
}
form.addEventListener("input", () => {
  try {
    const s = read(),
      g = validate(s);
    $("#size-preview").textContent =
      t("Candidate bets (bb): ", "候选下注（大盲）：") +
      betAmounts(s).join(", ") +
      t(" · Exact runouts: ", " · 精确发牌数：") +
      g.pairs.length * 990;
  } catch (e) {
    $("#size-preview").textContent = e.message;
  }
});
