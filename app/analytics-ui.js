import {
  CATEGORIES,
  summarizeRange,
  calibration,
  recordActions,
} from "./analytics.js";
const percent = (x) => (100 * x).toFixed(1) + "%";
export function equityReport(g, eq, t, esc) {
  return `<section class="report"><h2>${t("Range equity & card removal", "范围权益与阻断")}</h2><p class="hint">${t("Equity averages all legal runouts. Frequencies use the joint distribution after card removal. Draw patterns describe the five known cards; listed outs are not guaranteed wins and are not adjusted for the hidden hand.", "权益对所有合法发牌取平均。频率使用移除冲突牌后的联合分布。听牌基于五张已知牌；列出的补牌不保证获胜，也未扣除隐藏手牌。")}</p>${[
    "hero",
    "villain",
  ]
    .map((side) => {
      const r = summarizeRange(g, eq, side);
      return `<h3>${side === "hero" ? t("Your range", "玩家范围") : t("Opponent range", "对手范围")} · ${percent(r.equity)} ${t("equity", "权益")}</h3><p>${r.categories
        .map((p, i) => (p ? `${t(...CATEGORIES[i])} ${percent(p)}` : ""))
        .filter(Boolean)
        .join(
          " · ",
        )}</p><p>${t("Flush draw", "同花听牌")} ${percent(r.flushDraw)} · ${t("Straight draw", "顺子听牌")} ${percent(r.straightDraw)}</p><details><summary>${t("Combination details and blockers", "组合详情与阻断")}</summary><div class="scroll"><table><thead><tr>${[t("Combo", "组合"), t("Deal share", "发牌占比"), t("Equity", "权益"), t("Made hand", "成牌"), t("Draw pattern", "听牌"), t("Removed opposing weight", "移除的对方权重")].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${r.hands.map((h) => `<tr><td>${h.label}</td><td>${percent(h.mass)}</td><td>${h.equity === null ? "—" : percent(h.equity)}</td><td>${t(...CATEGORIES[h.category])}</td><td>${[h.flushDraw ? t("Flush draw", "同花听牌") : "", h.straightOuts ? `${h.straightOuts} ${t("straight outs", "顺子补牌")}` : "", h.backdoorFlush ? t("Backdoor flush", "后门同花") : ""].filter(Boolean).join(" · ") || "—"}</td><td>${percent(h.blockedWeight)}${h.blockedCombos.length ? ` · ${esc(h.blockedCombos.join(", "))}` : ""}</td></tr>`).join("")}</tbody></table></div></details>`;
    })
    .join("")}</section>`;
}
export function frequencyReport(records, t, esc) {
  const groups = calibration(records);
  if (!groups.length) return "";
  return `<details class="report"><summary>${t("Mixed-frequency practice by scenario and hand", "按场景与手牌查看混合频率")}</summary><p>${t("Each row keeps one complete configuration and sampling mode separate. Observed versus average target frequency is a repeated-decision measure, separate from EV loss. Small samples can vary widely; no single mixed action is graded wrong for its frequency.", "每行独立统计完整配置与采样模式。实际频率与平均目标频率用于重复决策评估，独立于 EV 损失。小样本波动较大；不会因单次混合行动频率而判错。")}</p><div class="scroll"><table><thead><tr>${[t("Scenario / hand", "场景 / 手牌"), t("Hands", "手数"), t("Mean EV loss", "平均 EV 损失"), t("Action · observed / target", "行动 · 实际 / 目标")].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${groups.map((g) => `<tr><td>${esc(g.scenario)} · ${esc(g.hero)}${g.targeted ? " · " + t("Targeted", "定向") : ""}</td><td>${g.count}</td><td>${g.meanLoss.toFixed(4)} bb</td><td>${g.observed.map((v, a) => `${a === 0 ? t("Check", "过牌") : g.actions ? `${g.actions[a]} bb` : t("All-in", "全下")}: ${percent(v)} / ${percent(g.expected[a])}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></details>`;
}
export function replayHand(container, record, t, cardHTML, cards) {
  const amounts = recordActions(record);
  const label = (a) => (a === 0 ? t("Check", "过牌") : `${amounts[a]} bb`);
  const panel = document.createElement("div");
  panel.className = "replay";
  container.append(panel);
  let step = 0;
  const draw = () => {
    panel.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = t("Hand replay", "手牌复盘") + ` · ${step + 1}/3`;
    const board = document.createElement("div");
    board.innerHTML = cardHTML(
      cards(record.board).slice(0, step === 2 ? 5 : 3),
    );
    const hero = document.createElement("p");
    hero.innerHTML = t("You", "玩家") + " " + cardHTML(cards(record.hero));
    const opponent = document.createElement("p");
    opponent.innerHTML =
      t("Opponent", "对手") +
      " " +
      cardHTML(step === 2 ? cards(record.villain) : [null, null]);
    const info = document.createElement("p");
    info.textContent =
      step === 0
        ? t(
            "Review the flop before revealing the decision.",
            "先思考翻牌局面，再揭示决策。",
          )
        : `${t("Chosen action", "已选行动")}: ${label(record.action)}`;
    panel.append(title, board, hero, opponent, info);
    if (step === 2) {
      const feedback = document.createElement("p");
      feedback.textContent = `${t("EV loss", "EV 损失")}: ${record.loss.toFixed(4)} bb${record.action > 0 && typeof record.called === "boolean" ? " · " + (record.called ? t("Opponent called", "对手跟注") : t("Opponent folded", "对手弃牌")) : ""}`;
      panel.append(feedback);
      const values = document.createElement("p");
      values.textContent =
        t("Action EVs", "各行动 EV") +
        ": " +
        record.ev.map((v, a) => `${label(a)} → ${v.toFixed(4)} bb`).join(" · ");
      panel.append(values);
    }
    const controls = document.createElement("div");
    controls.className = "replay-controls";
    for (const [label, change, disabled] of [
      [t("Previous", "上一步"), -1, step === 0],
      [t("Next", "下一步"), 1, step === 2],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.disabled = disabled;
      button.onclick = () => {
        step += change;
        draw();
      };
      controls.append(button);
    }
    panel.append(controls);
  };
  draw();
}
