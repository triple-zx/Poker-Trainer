import { fullActionLabel, streetName } from "./full-game.js";
import { cardName, validate } from "./engine.js";
import { fullCandidates } from "./full-sizing.js";
import { actionKey, childPath } from "./full-model.js";
import { playerPosition } from "./positions.js";

export function fullSizingReport(container, result, t = (en) => en) {
  const chosen = result.selection;
  if (!chosen) return;
  const section = document.createElement("section");
  section.className = "report";
  const title = document.createElement("h3");
  title.textContent = t(
    "Automatic sizing · full hand",
    "自动尺度选择 · 完整手牌",
  );
  section.append(title);
  const lines = [
    t(
      `At most ${chosen.maxBets} bet and ${chosen.maxRaises} raise sizes per hero decision, including all-in. All candidate actions remain available for practice.`,
      `玩家每个决策最多保留 ${chosen.maxBets} 个下注和 ${chosen.maxRaises} 个加注尺度（含全下）。训练中仍可使用全部候选动作。`,
    ),
    t(
      `Measured fixed-opponent loss: ${chosen.loss.toFixed(5)} bb. Target ${chosen.lossTarget.toFixed(5)} bb: ${chosen.targetReached ? "met" : "not met; allow more sizes or revise the target"}.`,
      `对固定对手的实测损失：${chosen.loss.toFixed(5)} 大盲。目标 ${chosen.lossTarget.toFixed(5)} 大盲：${chosen.targetReached ? "已达到" : "未达到；可增加尺度上限或调整目标"}。`,
    ),
    t(
      `Best-response EV with all candidates: ${chosen.fullValue.toFixed(5)} bb; with retained menus: ${chosen.value.toFixed(5)} bb.`,
      `使用全部候选尺度的最佳回应 EV：${chosen.fullValue.toFixed(5)} 大盲；仅使用保留尺度：${chosen.value.toFixed(5)} 大盲。`,
    ),
    t(
      "Menus are selected across the tree using continuation EVs, then evaluated as a complete strategy restriction. This search can miss a better combination of menus. The measured loss is for the menus it chose, not an equilibrium or untested-size guarantee.",
      "基于后续行动 EV 在整棵树中选择尺度，再评估整体策略限制。搜索可能遗漏更好的尺度组合。实测损失仅针对所选尺度，不保证均衡或未测试尺度的表现。",
    ),
    t(
      "Decision scores still compare all evaluated choices with unrestricted best continuation. Frequency targets renormalize baseline probabilities over retained actions, then apply your deviation setting. Solver convergence is reported separately.",
      "决策评分仍比较所有已计算选项及不限制尺度的最佳后续行动。频率目标先将保留动作的基线概率重新归一化，再应用偏移设置。求解收敛性单独报告。",
    ),
  ];
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    section.append(p);
  }
  const candidates = document.createElement("p");
  candidates.textContent =
    t("Evaluated candidates: ", "已评估候选尺度：") +
    Object.entries(fullCandidates(result.scenario))
      .map(
        ([street, cfg]) =>
          `${street} · bet ${cfg.bet.join("/")}% · raise ${cfg.raise.join("/")}%`,
      )
      .join("; ");
  section.append(candidates);
  container.append(section);
}

export function fullExplorer(
  container,
  result,
  onModelChange,
  t = (en) => en,
  selectedPath = "root",
  onNavigate = () => {},
) {
  const section = document.createElement("section");
  section.className = "report";
  const g = validate(result.scenario),
    trail = [result.root],
    paths = ["root"];
  for (const step of selectedPath.split("/").slice(1)) {
    const node = trail.at(-1);
    const choices =
      node.type === "chance"
        ? Object.keys(node.children)
        : node.type === "action"
          ? node.actions.map((_, i) => i)
          : [];
    const choice = choices.find(
      (c) => childPath(paths.at(-1), node, c).split("/").at(-1) === step,
    );
    if (choice === undefined) break;
    paths.push(childPath(paths.at(-1), node, choice));
    trail.push(node.children[choice]);
  }
  function render() {
    onNavigate(paths.at(-1));
    section.replaceChildren();
    const node = trail.at(-1);
    const title = document.createElement("h3");
    title.textContent = "Explore the saved tree";
    const context = document.createElement("p");
    context.textContent = `${streetName(node.board)} · ${node.board.map(cardName).join(" ")} · pot ${(result.scenario.pot + node.spent[0] + node.spent[1]).toFixed(3)} bb`;
    section.append(title, context);
    if (trail.length > 1) {
      const back = document.createElement("button");
      back.textContent = "← Previous node";
      back.onclick = () => {
        trail.pop();
        paths.pop();
        render();
      };
      section.append(back);
    }
    if (node.type === "terminal") {
      const p = document.createElement("p");
      p.textContent =
        node.winner < 0 ? "Showdown or all-in runout" : "Hand ends by a fold";
      section.append(p);
      return;
    }
    const controls = document.createElement("div");
    controls.className = "toolbar";
    section.append(controls);
    if (node.type === "chance") {
      const label = document.createElement("label");
      label.textContent = "Next board card";
      const select = document.createElement("select");
      for (const c of Object.keys(node.children)) {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = cardName(Number(c));
        select.append(o);
      }
      const go = document.createElement("button");
      go.textContent = "Inspect card →";
      go.onclick = () => {
        paths.push(childPath(paths.at(-1), node, select.value));
        trail.push(node.children[select.value]);
        render();
      };
      label.append(select);
      controls.append(label, go);
      return;
    }
    const actor = document.createElement("p");
    actor.textContent =
      (node.player === 0 ? t("You", "玩家") : t("Opponent", "对手")) +
      " · " +
      (playerPosition(result.scenario, node.player) === "oop"
        ? t("out of position", "无位置")
        : t("in position", "有位置"));
    section.append(actor);
    if (node.player === 0 && node.activeActions) {
      const menu = document.createElement("p");
      menu.textContent =
        "Retained menu: " +
        node.activeActions
          .map((i) => fullActionLabel(node.actions[i], node, result.scenario))
          .join(" · ");
      section.append(menu);
    }
    node.actions.forEach((a, i) => {
      const button = document.createElement("button");
      button.textContent = fullActionLabel(a, node, result.scenario);
      button.onclick = () => {
        paths.push(childPath(paths.at(-1), node, i));
        trail.push(node.children[i]);
        render();
      };
      controls.append(button);
    });
    const table = document.createElement("table"),
      head = document.createElement("tr");
    for (const name of [
      "Combination",
      "Action",
      "Baseline",
      node.player === 0 ? "Adjusted" : "Opponent model",
      ...(node.player === 0 ? ["EV (bb)"] : []),
      ...(node.sizingEV ? ["EV with retained future menus (bb)"] : []),
    ]) {
      const th = document.createElement("th");
      th.textContent = name;
      head.append(th);
    }
    const thead = document.createElement("thead");
    thead.append(head);
    table.append(thead);
    const tbody = document.createElement("tbody");
    (node.player === 0 ? g.hero : g.villain).forEach((h, i) => {
      if (!node.policy[i]) return;
      node.actions.forEach((a, j) => {
        const row = document.createElement("tr");
        const adjusted = (node.player === 0 ? node.adjusted : node.model)?.[i];
        for (const text of [
          h.label,
          fullActionLabel(a, node, result.scenario),
          (100 * node.policy[i][j]).toFixed(1) + "%",
          adjusted ? (100 * adjusted[j]).toFixed(1) + "%" : "No model reach",
          ...(node.player === 0
            ? [node.ev[i]?.[j]?.toFixed(4) ?? "No model reach"]
            : []),
          ...(node.sizingEV
            ? [node.sizingEV[i]?.[j]?.toFixed(4) ?? "No model reach"]
            : []),
        ]) {
          const td = document.createElement("td");
          td.textContent = text;
          row.append(td);
        }
        tbody.append(row);
      });
    });
    table.append(tbody);
    const scroll = document.createElement("div");
    scroll.className = "scroll";
    scroll.append(table);
    section.append(scroll);
    if (node.player === 1 && onModelChange) {
      const editor = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = t(
        "Edit opponent at this decision",
        "编辑此决策的对手策略",
      );
      const note = document.createElement("p");
      note.textContent = t(
        "Applies only to the selected combination on this exact board and action history. Other decisions keep their current model. Updating reuses the saved baseline.",
        "仅用于此牌面和行动历史下所选手牌组合。其他决策保留当前模型，更新将复用已保存的基线。",
      );
      const comboLabel = document.createElement("label"),
        combo = document.createElement("select");
      comboLabel.textContent = t("Opponent combination", "对手手牌组合");
      g.villain.forEach((h, i) => {
        if (!node.policy[i]) return;
        const option = document.createElement("option");
        option.value = i;
        option.textContent = h.label;
        combo.append(option);
      });
      comboLabel.append(combo);
      const fields = document.createElement("div"),
        status = document.createElement("p");
      fields.className = "model-fields";
      const apply = document.createElement("button"),
        reset = document.createElement("button");
      apply.type = reset.type = "button";
      apply.textContent = t("Apply opponent edit", "应用对手策略");
      reset.textContent = t("Reset this combination", "重置此组合");
      let inputs = [];
      function populate() {
        fields.replaceChildren();
        const index = Number(combo.value),
          row = node.model?.[index] || node.policy[index];
        const percentages = row.map((p) => Math.round(p * 100000000) / 1000000);
        const largest = row.indexOf(Math.max(...row));
        percentages[largest] += 100 - percentages.reduce((a, b) => a + b, 0);
        inputs = node.actions.map((a, i) => {
          const label = document.createElement("label"),
            input = document.createElement("input");
          label.textContent =
            fullActionLabel(a, node, result.scenario) + " (%)";
          input.type = "number";
          input.min = "0";
          input.max = "100";
          input.step = "any";
          input.value = String(Number(percentages[i].toFixed(6)));
          label.append(input);
          fields.append(label);
          return input;
        });
        const locked =
          result.scenario.fullModel?.locks[paths.at(-1)]?.[
            g.villain[index].label
          ];
        reset.disabled = !locked;
        status.textContent = locked
          ? t("Custom distribution saved here.", "此处已保存自定义策略。")
          : t(
              "Enter percentages totaling 100%.",
              "输入百分比，总和须为 100%。",
            );
      }
      const submit = (clear) => {
        try {
          const values = inputs.map((input) =>
            input.value.trim() === "" ? NaN : Number(input.value) / 100,
          );
          if (
            !clear &&
            (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
              Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-8)
          )
            throw Error(
              t(
                "Percentages must be between 0 and 100 and total 100%.",
                "百分比须在 0 到 100 之间，且总和为 100%。",
              ),
            );
          onModelChange(
            paths.at(-1),
            g.villain[Number(combo.value)].label,
            clear
              ? null
              : Object.fromEntries(
                  node.actions.map((a, i) => [actionKey(a), values[i]]),
                ),
          );
          editor.disabled = true;
          status.textContent = t(
            "Updating feedback from the saved baseline…",
            "正在根据保存的基线更新反馈…",
          );
        } catch (e) {
          status.textContent = e.message;
        }
      };
      apply.onclick = () => submit(false);
      reset.onclick = () => submit(true);
      combo.onchange = populate;
      editor.append(legend, note, comboLabel, fields, status, apply, reset);
      populate();
      section.append(editor);
    }
  }
  container.append(section);
  render();
}

export function fullFrequencyReport(container, records) {
  const groups = new Map();
  for (const r of records.filter((r) => r.full))
    for (const d of r.decisions) {
      const key = JSON.stringify([
        r.config,
        r.hero,
        r.practiceTarget,
        d.board,
        d.path,
        d.choices,
      ]);
      if (!groups.has(key))
        groups.set(key, {
          name: r.scenario + " · " + r.hero + " · " + d.street,
          choices: d.choices,
          counts: d.choices.map(() => 0),
          target: d.choices.map(() => 0),
          n: 0,
        });
      const group = groups.get(key);
      group.n++;
      group.counts[d.action]++;
      d.target.forEach((p, i) => (group.target[i] += p));
    }
  if (!groups.size) return;
  const details = document.createElement("details"),
    summary = document.createElement("summary");
  summary.textContent = "Full-hand frequency practice";
  details.append(summary);
  const note = document.createElement("p");
  note.textContent =
    "Counts are separated by scenario, private hand, board, prior actions and sampling target. A single mixed action is not a frequency mistake.";
  details.append(note);
  for (const group of groups.values()) {
    const p = document.createElement("p");
    p.textContent =
      group.name +
      " · " +
      group.n +
      " decisions · " +
      group.choices
        .map(
          (c, i) =>
            `${c}: ${((100 * group.counts[i]) / group.n).toFixed(1)}% chosen / ${((100 * group.target[i]) / group.n).toFixed(1)}% target`,
        )
        .join(" · ");
    details.append(p);
  }
  container.append(details);
}
