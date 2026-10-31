import { cardName } from "./engine.js";
import { CATEGORIES } from "./analytics.js";
import { fullActionLabel } from "./full-game.js";
import { tendencySummary } from "./tendency-ui.js";
import { showRangeOrigins } from "./preflop-ranges-ui.js";

const el = (tag, text, parent) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
const pct = (p) =>
  p > 0 && p < 0.00005 ? "<0.01%" : (100 * p).toFixed(2) + "%";
export function flopReportPanel(container, library, state, t) {
  container.replaceChildren();
  const signature = JSON.stringify(library);
  if (state.librarySignature !== signature) state.report = null;
  state.librarySignature = signature;
  const details = el("details", undefined, container);
  details.className = "report";
  el("summary", t("Compare saved flops", "比较已保存的翻牌"), details);
  el(
    "p",
    t(
      "Select complete full-hand solutions saved in your local library. This compares a selected set of flops, not exhaustive flop coverage. Equal or custom weights are sample weights, not card-deal probabilities. Different ranges, positions, pot/stack, sizing or opponent assumptions get separate averages. Your current scenario is unchanged.",
      "选择本地场景库中已保存的完整手牌解。此处比较所选翻牌样本，并非穷举全部翻牌。等权或自定义权重是样本权重，不是发牌概率。范围、位置、底池/筹码、尺度或对手假设不同的场景分别计算平均值；当前场景保持不变。",
    ),
    details,
  );
  const controls = el("fieldset", undefined, details);
  el("legend", t("Choose the comparison", "选择比较内容"), controls);
  const profileLabel = el(
      "label",
      t("Flop comparison profile", "翻牌比较策略"),
      controls,
    ),
    profile = el("select", undefined, profileLabel);
  for (const [value, label] of [
    ["model", t("Adjusted hero + fixed opponent", "调整后的玩家 + 固定对手")],
    ["baseline", t("Baseline for both players", "双方基线策略")],
  ])
    el("option", label, profile).value = value;
  profile.value = state.profile;
  const weightLabel = el(
      "label",
      t("Flop weighting", "翻牌权重方式"),
      controls,
    ),
    mode = el("select", undefined, weightLabel);
  for (const [value, label] of [
    ["equal", t("Equal weight per selected flop", "所选翻牌等权")],
    ["custom", t("Custom relative weights", "自定义相对权重")],
  ])
    el("option", label, mode).value = value;
  mode.value = state.weightMode;
  const names = Object.keys(library)
    .filter((name) => library[name]?.scenario?.game === "full")
    .sort();
  const scroll = el("div", undefined, controls);
  scroll.className = "scroll";
  const table = el("table", undefined, scroll),
    head = el("tr", undefined, el("thead", undefined, table));
  for (const text of [
    t("Select saved scenario", "选择已保存场景"),
    t("Flop", "翻牌"),
    t("Relative weight", "相对权重"),
  ])
    el("th", text, head);
  const body = el("tbody", undefined, table),
    choices = [];
  for (const name of names) {
    const row = el("tr", undefined, body),
      label = el("label", undefined, el("td", undefined, row)),
      check = el("input", undefined, label);
    check.type = "checkbox";
    label.className = "scenario-choice";
    check.checked = state.selected.has(name);
    el("span", name, label);
    el("td", library[name].scenario.flop, row);
    const input = el("input", undefined, el("td", undefined, row));
    input.type = "number";
    input.min = "0";
    input.max = "1000000";
    input.step = "any";
    input.value = state.weights.get(name) ?? "1";
    input.setAttribute(
      "aria-label",
      name + " · " + t("relative weight", "相对权重"),
    );
    input.disabled = mode.value !== "custom" || !check.checked;
    choices.push({ name, check, input });
  }
  if (names.length < 2)
    el(
      "p",
      t(
        "Save at least two full-hand scenarios to your library. Scenario-only entries need a saved complete solution before comparison.",
        "请先将至少两个完整手牌场景保存到本地库。只有设置的场景须先完成求解并保存，才能参与比较。",
      ),
      controls,
    );
  const run = el(
    "button",
    t("Build flop comparison", "生成翻牌比较"),
    controls,
  );
  run.type = "button";
  const cancel = el("button", t("Cancel comparison", "取消比较"), details);
  cancel.type = "button";
  cancel.disabled = true;
  const status = el("p", "", details);
  status.setAttribute("aria-live", "polite");
  const output = el("div", undefined, details);
  let worker = null;
  const invalidate = () => {
    state.report = null;
    output.replaceChildren();
    status.textContent = "";
  };
  for (const { name, check, input } of choices) {
    check.onchange = () => {
      if (check.checked) state.selected.add(name);
      else state.selected.delete(name);
      input.disabled = mode.value !== "custom" || !check.checked;
      invalidate();
    };
    input.oninput = () => {
      state.weights.set(name, input.value);
      invalidate();
    };
  }
  profile.onchange = () => {
    state.profile = profile.value;
    invalidate();
  };
  mode.onchange = () => {
    state.weightMode = mode.value;
    choices.forEach(
      ({ check, input }) =>
        (input.disabled = mode.value !== "custom" || !check.checked),
    );
    invalidate();
  };
  const finish = () => {
    worker?.terminate();
    worker = null;
    controls.disabled = false;
    cancel.disabled = true;
  };
  cancel.onclick = () => {
    finish();
    status.textContent = t(
      "Comparison cancelled. Saved scenarios are unchanged.",
      "比较已取消，已保存场景保持不变。",
    );
  };
  const show = () => {
    output.replaceChildren();
    if (!state.report) return;
    const report = state.report;
    el(
      "p",
      t(
        `${report.selectedSolutions} saved solutions · ${report.groups.length} separate comparison ${report.groups.length === 1 ? "group" : "groups"}. Weights are normalized within each group. No cross-group average is shown.`,
        `共 ${report.selectedSolutions} 个已保存解 · ${report.groups.length} 个独立比较组。权重在每组内归一化，不显示跨组平均值。`,
      ),
      output,
    );
    el(
      "p",
      t(
        "Opening frequencies follow the selected profile. Best-response EV always uses optimal continuation against the configured fixed opponent, not the displayed mixed strategy's payoff. The 0.001 bb baseline gap target is separate from sizing loss; incomplete convergence remains visible.",
        "开局频率采用所选策略。最佳回应 EV 始终针对配置的固定对手及最佳后续行动，并非所显示混合策略的收益。基线差距目标 0.001 大盲与尺度简化损失分开；未收敛的结果仍会明确显示。",
      ),
      output,
    );
    report.groups.forEach((group, i) => {
      const section = el("section", undefined, output);
      const s = group.rows[0].scenario,
        actor = group.player === 0 ? t("You", "玩家") : t("Opponent", "对手");
      const actionLabel = (action) =>
        fullActionLabel(
          action,
          { player: group.player, spent: [0, 0], street: [0, 0] },
          s,
          t,
        );
      el(
        "h3",
        t(
          `Group ${i + 1} · ${group.flops} selected ${group.flops === 1 ? "flop" : "flops"}`,
          `第 ${i + 1} 组 · ${group.flops} 个所选翻牌`,
        ),
        section,
      );
      el(
        "p",
        `${t("Your weighted equity", "玩家加权权益")} ${pct(group.hero.equity)} · ${t("Opponent weighted equity", "对手加权权益")} ${pct(group.villain.equity)} · ${t("Weighted best-response EV", "加权最佳回应 EV")} ${group.modelEV.toFixed(4)} bb`,
        section,
      );
      el(
        "p",
        actor +
          " · " +
          group.actions
            .map((a) => actionLabel(a) + " " + pct(a.frequency))
            .join(" · "),
        section,
      );
      el(
        "p",
        t(
          `Largest baseline gap: ${group.maxGap.toFixed(5)} bb · ${group.unconverged} of ${group.rows.length} solves above the 0.001 bb target.`,
          `最大基线差距：${group.maxGap.toFixed(5)} 大盲 · ${group.rows.length} 个解中有 ${group.unconverged} 个超过 0.001 大盲目标。`,
        ),
        section,
      );
      const assumptions = el("details", undefined, section);
      el(
        "summary",
        t("Shared settings and opponent assumptions", "共同设置与对手假设"),
        assumptions,
      );
      for (const text of [
        `${t("Hero position", "玩家位置")}: ${s.heroPosition === "ip" ? t("In position", "有位置") : t("Out of position", "无位置")} · ${t("Pot", "底池")} ${s.pot} bb · ${t("Stack", "筹码")} ${s.stack} bb · ${t("Rake / cap", "抽水 / 上限")} ${s.rake}% / ${s.cap} bb`,
        `${t("Hero range", "玩家范围")}: ${s.hero} · ${t("Opponent range", "对手范围")}: ${s.villain}`,
        `${t("Calling tendency", "跟注倾向")}: ${s.tendency} · ${t("Combo call overrides", "组合跟注覆盖")}: ${JSON.stringify(s.overrides)} · ${t("Deviation", "偏移程度")}: ${s.deviation}`,
        tendencySummary(s, t),
        `${t("Bet / raise candidates by street", "各街下注 / 加注候选")}: ` +
          Object.entries(group.settings.candidates)
            .map(
              ([street, sizes]) =>
                `${t(street, { flop: "翻牌", turn: "转牌", river: "河牌" }[street])} ${sizes.bet.join("/")}% · ${sizes.raise.join("/")}%`,
            )
            .join("; "),
        s.fullSizing
          ? t(
              `Sizing: ${s.fullSizing.mode} · maximum bets ${s.fullSizing.maxBets}, raises ${s.fullSizing.maxRaises} · loss target ${s.fullSizing.lossTarget} bb.`,
              `尺度：${s.fullSizing.mode} · 最多下注尺度 ${s.fullSizing.maxBets}，加注尺度 ${s.fullSizing.maxRaises} · 损失目标 ${s.fullSizing.lossTarget} 大盲。`,
            )
          : t("Sizing selection is off.", "尺度筛选已关闭。"),
        t(
          `Board-specific detailed opponent edits: ${Object.keys(s.fullModel?.locks || {}).length}. Different edit sets or their tree identities are kept separate.`,
          `特定牌面的对手详细编辑：${Object.keys(s.fullModel?.locks || {}).length} 处。编辑内容或所属策略树不同的解分别归组。`,
        ),
      ])
        if (text) el("p", text, assumptions);
      showRangeOrigins(el("div", undefined, assumptions), s.rangeOrigins, t);
      const scroll = el("div", undefined, section);
      scroll.className = "scroll";
      const table = el("table", undefined, scroll),
        head = el("tr", undefined, el("thead", undefined, table));
      for (const text of [
        t("Saved scenario / flop", "已保存场景 / 翻牌"),
        t("Group weight", "组内权重"),
        t("Your equity", "玩家权益"),
        t("Opponent equity", "对手权益"),
        actor + " · " + t("opening strategy", "开局策略"),
        t("Best-response EV (bb)", "最佳回应 EV（大盲）"),
        t("Baseline gap / iterations", "基线差距 / 迭代次数"),
      ])
        el("th", text, head);
      const body = el("tbody", undefined, table);
      for (const row of group.rows) {
        const tr = el("tr", undefined, body);
        for (const text of [
          row.name + " · " + row.board.map(cardName).join(" "),
          pct(row.share),
          pct(row.hero.equity),
          pct(row.villain.equity),
          row.actions
            .map((a, j) => actionLabel(a) + " " + pct(row.frequencies[j]))
            .join(" · "),
          row.modelEV.toFixed(4),
          row.gap.toFixed(5) + " bb / " + row.iterations.toLocaleString(),
        ])
          el("td", text, tr);
      }
      const composition = el("details", undefined, section);
      el("summary", t("Compare hand strength", "比较手牌强度"), composition);
      el(
        "p",
        t(
          "Made hands include the board. Draws can overlap and do not guarantee winning outs. Averages use the same selected-flop weights.",
          "成牌包含公共牌。听牌可能重叠，并不保证补牌获胜。平均值使用相同的所选翻牌权重。",
        ),
        composition,
      );
      const strength = (range) =>
        range.categories
          .map((p, j) => (p ? `${t(...CATEGORIES[j])} ${pct(p)}` : ""))
          .filter(Boolean)
          .join(" · ") +
        ` · ${t("Flush draw", "同花听牌")} ${pct(range.flushDraw)} · ${t("Straight draw", "顺子听牌")} ${pct(range.straightDraw)}`;
      for (const [label, row] of [
        [t("Weighted average", "加权平均"), group],
        ...group.rows.map((row) => [row.name, row]),
      ]) {
        el("h4", label, composition);
        el("p", t("You", "玩家") + " · " + strength(row.hero), composition);
        el(
          "p",
          t("Opponent", "对手") + " · " + strength(row.villain),
          composition,
        );
      }
    });
  };
  run.onclick = () => {
    const entries = choices
      .filter(({ check }) => check.checked)
      .map(({ name, input }) => ({
        name,
        scenario: library[name].scenario,
        weight: Number(input.value),
      }));
    if (entries.length < 2) {
      status.textContent = t(
        "Select at least two saved solutions.",
        "请至少选择两个已保存解。",
      );
      return;
    }
    if (
      mode.value === "custom" &&
      entries.some(
        (e) =>
          !Number.isFinite(e.weight) || e.weight <= 0 || e.weight > 1000000,
      )
    ) {
      status.textContent = t(
        "Custom weights must be greater than zero and at most 1,000,000.",
        "自定义权重须大于零且不超过 1,000,000。",
      );
      return;
    }
    invalidate();
    controls.disabled = true;
    cancel.disabled = false;
    try {
      const job = new Worker(
        new URL("./flop-report-worker.js", import.meta.url),
        {
          type: "module",
        },
      );
      worker = job;
      job.onmessage = ({ data }) => {
        if (worker !== job) return;
        if (data.type === "progress")
          status.textContent = t(
            `Reading saved solution ${Math.min(data.completed + 1, data.total)} / ${data.total}${data.name ? ": " + data.name : ""}`,
            `读取已保存解 ${Math.min(data.completed + 1, data.total)} / ${data.total}${data.name ? "：" + data.name : ""}`,
          );
        else if (data.type === "complete") {
          state.report = data.report;
          finish();
          show();
          status.textContent = t(
            "Comparison ready. No solver run was started.",
            "比较已完成，未启动求解器。",
          );
        } else {
          finish();
          status.textContent = data.message;
        }
      };
      job.onerror = (event) => {
        if (worker !== job) return;
        finish();
        status.textContent =
          event.message || t("Comparison failed.", "比较失败。");
      };
      worker.postMessage({
        entries,
        profile: profile.value,
        weightMode: mode.value,
      });
    } catch (e) {
      finish();
      status.textContent = e.message;
    }
  };
  details.open = state.open || false;
  details.ontoggle = () => {
    if (details.isConnected) state.open = details.open;
  };
  show();
  return () => {
    if (details.isConnected) state.open = details.open;
    finish();
  };
}
