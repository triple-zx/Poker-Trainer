import { analyzeNode, weightedMatrix } from "./full-node-analysis.js";
import { CATEGORIES } from "./analytics.js";
import { fullActionLabel } from "./full-game.js";

const percent = (x) => (100 * x).toFixed(1) + "%";
function element(tag, text, parent) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  parent?.append(el);
  return el;
}
export function nodeRangePanel(container, result, path, options) {
  const { t, profile, open, cache, onOpen, onProfile } = options;
  const details = element("details", undefined, container);
  details.className = "node-ranges";
  element(
    "summary",
    t(
      "Ranges at this decision · equity, hands and blockers",
      "此决策的范围 · 权益、牌型和阻断",
    ),
    details,
  );
  const label = element(
    "label",
    t("Range analysis profile", "范围分析策略"),
    details,
  );
  const select = element("select", undefined, label);
  for (const [value, text] of [
    ["model", t("Adjusted hero + fixed opponent", "调整后的玩家 + 固定对手")],
    ["baseline", t("Baseline for both players", "双方基线策略")],
  ]) {
    const option = element("option", text, select);
    option.value = value;
  }
  select.value = profile;
  const content = element("div", undefined, details);
  let rendered = false;
  function render() {
    content.replaceChildren();
    rendered = true;
    try {
      const report = analyzeNode(result, path, select.value, cache);
      const explanation = element("details", undefined, content);
      element(
        "summary",
        t(
          "How weights, equity and blockers are calculated",
          "权重、权益和阻断的计算方法",
        ),
        explanation,
      );
      element(
        "p",
        t(
          "Weights follow both players' earlier actions and the exact board under the selected profile. Equity averages every remaining legal runout before future betting. Decision EV scores still use the fixed opponent model and best continuation.",
          "权重由所选策略下双方此前的动作和具体公共牌决定。权益平均计算所有剩余合法发牌，不含后续下注。决策 EV 评分仍基于固定对手模型和最佳后续行动。",
        ),
        explanation,
      );
      if (!report.reachable) {
        element(
          "p",
          t(
            "This history has zero probability under this profile. Conditional ranges and equity are undefined; inspect the other profile or an earlier decision.",
            "此行动历史在所选策略下的概率为零，条件范围和权益无定义；可查看另一策略或更早的决策。",
          ),
          content,
        );
        return;
      }
      const reach =
        report.reach < 0.0005
          ? report.reach
            ? (100 * report.reach).toExponential(2) + "%"
            : "<1e-300%"
          : percent(report.reach);
      element(
        "p",
        t(
          `Probability of this exact action/board history from the configured flop: ${reach}.`,
          `从配置的翻牌到此具体行动和公共牌历史的概率：${reach}。`,
        ),
        content,
      );
      if (report.frequencies) {
        const actor =
          report.node.player === 0 ? t("You", "玩家") : t("Opponent", "对手");
        element(
          "p",
          actor +
            " · " +
            report.frequencies
              .map(
                (p, i) =>
                  `${fullActionLabel(report.node.actions[i], report.node, result.scenario)} ${percent(p)}`,
              )
              .join(" · "),
          content,
        );
      }
      element(
        "p",
        t(
          "Blockers show the share of the opponent's board-compatible, action-weighted range removed by a private hand before applying private-card collisions. This is card removal, not a measured EV effect. Draw outs are raw rank patterns and may be held by the opponent; the river has no draws.",
          "阻断表示在移除私牌冲突前，某手牌移除的对方范围权重占比；该范围已按公共牌及此前动作加权。这是牌张移除，不代表实测 EV 效果。听牌补牌为原始点数模式，可能在对手手中；河牌无听牌。",
        ),
        explanation,
      );
      for (const side of ["hero", "villain"]) {
        const summary = report[side];
        element(
          "h4",
          (side === "hero"
            ? t("Your conditional range", "玩家条件范围")
            : t("Opponent conditional range", "对手条件范围")) +
            " · " +
            percent(summary.equity) +
            " " +
            t("equity", "权益"),
          content,
        );
        element(
          "p",
          summary.categories
            .map((p, i) =>
              p > 0 ? `${t(...CATEGORIES[i])} ${percent(p)}` : "",
            )
            .filter(Boolean)
            .join(" · "),
          content,
        );
        if (report.node.board.length < 5)
          element(
            "p",
            `${t("Flush draw", "同花听牌")} ${percent(summary.flushDraw)} · ${t("Straight draw", "顺子听牌")} ${percent(summary.straightDraw)}`,
            content,
          );
        const scroll = element("div", undefined, content);
        scroll.className = "scroll";
        const table = element("table", undefined, scroll),
          head = element("tr", undefined, element("thead", undefined, table));
        for (const text of [
          t("Combination", "组合"),
          t("Reach share", "到达占比"),
          t("Equity", "权益"),
          t("Made hand", "成牌"),
          t("Draw pattern", "听牌"),
          t("Blocked opposing weight", "阻断的对手权重"),
        ])
          element("th", text, head);
        const body = element("tbody", undefined, table);
        for (const h of summary.hands) {
          const row = element("tr", undefined, body);
          const draws = [
            h.flushDraw ? t("Flush draw", "同花听牌") : "",
            h.straightOuts
              ? `${h.straightOuts} ${t("straight outs", "顺子补牌")}`
              : "",
            h.backdoorFlush ? t("Backdoor flush", "后门同花") : "",
          ]
            .filter(Boolean)
            .join(" · ");
          for (const text of [
            h.label,
            percent(h.mass),
            h.equity === null ? "—" : percent(h.equity),
            h.boardBlocked
              ? t("Blocked by board", "与公共牌冲突")
              : t(...CATEGORIES[h.category]),
            draws || "—",
            h.boardBlocked
              ? "—"
              : percent(h.blockedWeight) +
                (h.blockedCombos.length
                  ? " · " + h.blockedCombos.join(", ")
                  : ""),
          ])
            element("td", text, row);
        }
        const matrixDetails = element("details", undefined, content);
        element(
          "summary",
          t("Weighted 13×13 range matrix", "加权 13×13 范围矩阵"),
          matrixDetails,
        );
        element(
          "p",
          t(
            "Each cell shows its share of this conditional range, summed over exact combinations. Hover for the combinations and their weights.",
            "每格显示该牌型在条件范围中的占比，由具体组合相加而得；悬停可查看组合及权重。",
          ),
          matrixDetails,
        );
        const grid = element("div", undefined, matrixDetails);
        grid.className = "grid node-matrix";
        for (const cell of weightedMatrix(summary.hands)) {
          const span = element(
            "span",
            cell.label + (cell.mass ? "\n" + percent(cell.mass) : ""),
            grid,
          );
          span.className = "cell" + (cell.mass ? " in" : "");
          span.title =
            cell.combos
              .map((h) => h.label + " " + percent(h.mass))
              .join(" · ") || cell.label;
        }
      }
    } catch (e) {
      element("p", e.message, content);
    }
  }
  // The explorer rebuilds both range and next-card reports with this profile.
  select.onchange = () => {
    onOpen(details.open);
    onProfile(select.value);
  };
  details.ontoggle = () => {
    if (!details.isConnected) return;
    onOpen(details.open);
    if (details.open && !rendered) render();
  };
  details.open = open;
  if (open) render();
}
