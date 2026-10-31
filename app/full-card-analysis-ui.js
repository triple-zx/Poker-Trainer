import { analysisRequest } from "./analysis-request.js";
import { analysisTask } from "./analysis-task-ui.js";
import { CATEGORIES } from "./analytics.js";
import { fullActionLabel } from "./full-game.js";

const percent = (p) =>
  p === null
    ? "—"
    : p > 0 && p < 0.00005
      ? "<0.01%"
      : (100 * p).toFixed(2) + "%";
const element = (tag, text, parent) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  parent?.append(el);
  return el;
};
export function nextCardPanel(container, result, path, options) {
  const { t, profile, open, analysis, onOpen, onProfile, onInspect } = options;
  const details = element("details", undefined, container);
  details.className = "node-ranges";
  element(
    "summary",
    t("Compare every next card", "比较所有下一张公共牌"),
    details,
  );
  const label = element(
      "label",
      t("Card comparison profile", "公共牌比较策略"),
      details,
    ),
    select = element("select", undefined, label);
  for (const [value, text] of [
    ["model", t("Adjusted hero + fixed opponent", "调整后的玩家 + 固定对手")],
    ["baseline", t("Baseline for both players", "双方基线策略")],
  ])
    element("option", text, select).value = value;
  select.value = profile;
  const content = element("div", undefined, details);
  function render(report) {
    content.replaceChildren();
    try {
      element(
        "p",
        t(
          "This report covers every legal next card at this exact action history. Weights follow both players' earlier actions and private-card removal under the selected profile. Frequencies describe the first player to act on the next street. Equity averages remaining legal runouts before betting; it is not decision EV. No new solver run is needed.",
          "此报告覆盖该具体行动历史下所有合法的下一张公共牌。权重按所选策略下双方此前动作及私牌移除计算。频率描述下一街先行动玩家的策略。权益平均计算下注前的剩余合法发牌，并非决策 EV。无需重新求解。",
        ),
        content,
      );
      if (!report.reachable) {
        element(
          "p",
          t(
            "This history has zero probability under this profile. Card weights, equity and strategy averages are undefined. Choose the other profile or an earlier history.",
            "此历史在所选策略下概率为零，公共牌权重、权益和平均策略均无定义。请选择另一策略或更早的历史。",
          ),
          content,
        );
        return;
      }
      element(
        "p",
        t(
          `${report.rows.length} legal cards covered · ${report.positiveCards} with positive probability · total conditional probability ${percent(report.probabilityMass)}. Zero-probability cards are excluded from weighted averages.`,
          `覆盖 ${report.rows.length} 张合法牌 · 其中 ${report.positiveCards} 张概率为正 · 条件概率合计 ${percent(report.probabilityMass)}。零概率牌不计入加权平均。`,
        ),
        content,
      );
      const actor =
        report.player === 0 ? t("You", "玩家") : t("Opponent", "对手");
      // Use the actual child state for all-in labels.
      const labels = new Map();
      const node = options.node;
      report.rows.forEach((row) =>
        row.actions.forEach((action) => {
          labels.set(
            action.kind + ":" + (action.amount ?? ""),
            fullActionLabel(
              action,
              node.children[row.card],
              result.scenario,
              t,
            ),
          );
        }),
      );
      const actionLabel = (a) => labels.get(a.kind + ":" + (a.amount ?? ""));
      element(
        "h4",
        t("Probability-weighted overview", "按概率加权的总览"),
        content,
      );
      element(
        "p",
        `${t("Your equity", "玩家权益")} ${percent(report.weighted.hero.equity)} · ${t("Opponent equity", "对手权益")} ${percent(report.weighted.villain.equity)}`,
        content,
      );
      element(
        "p",
        actor +
          " · " +
          report.weighted.actions
            .map((a) => `${actionLabel(a)} ${percent(a.frequency)}`)
            .join(" · "),
        content,
      );
      const sortLabel = element(
          "label",
          t("Sort cards by", "公共牌排序"),
          content,
        ),
        sort = element("select", undefined, sortLabel);
      for (const [value, text] of [
        ["card", t("Card", "牌张")],
        ["equity", t("Your equity · highest first", "玩家权益 · 从高到低")],
        ["bet", t("Bet frequency · highest first", "下注频率 · 从高到低")],
      ])
        element("option", text, sort).value = value;
      const scroll = element("div", undefined, content);
      scroll.className = "scroll card-comparison";
      const table = element("table", undefined, scroll),
        head = element("tr", undefined, element("thead", undefined, table));
      for (const text of [
        t("Next card", "下一张牌"),
        t("Card probability", "牌张概率"),
        t("Your equity", "玩家权益"),
        t("Opponent equity", "对手权益"),
        actor + " · " + t("opening strategy", "开局策略"),
        t("Explore", "查看"),
      ])
        element("th", text, head);
      const body = element("tbody", undefined, table);
      const showRows = () => {
        body.replaceChildren();
        const rows = [...report.rows];
        const value = (r) =>
          sort.value === "equity"
            ? (r.hero?.equity ?? -1)
            : r.frequencies
              ? r.actions.reduce(
                  (sum, a, i) =>
                    sum + (a.kind === "BET" ? r.frequencies[i] : 0),
                  0,
                )
              : -1;
        if (sort.value !== "card")
          rows.sort((a, b) => value(b) - value(a) || a.card - b.card);
        for (const row of rows) {
          const tr = element("tr", undefined, body);
          for (const text of [
            row.name,
            percent(row.probability),
            percent(row.hero?.equity ?? null),
            percent(row.villain?.equity ?? null),
            row.frequencies
              ? row.actions
                  .map(
                    (a, i) =>
                      `${actionLabel(a)} ${percent(row.frequencies[i])}`,
                  )
                  .join(" · ")
              : t("No profile reach", "所选策略无法到达"),
          ])
            element("td", text, tr);
          const button = element(
            "button",
            t(`Inspect ${row.name}`, `查看 ${row.name}`),
            element("td", undefined, tr),
          );
          button.onclick = () => onInspect(row.card);
        }
      };
      sort.onchange = showRows;
      showRows();
      const composition = element("details", undefined, content);
      element(
        "summary",
        t("Made hands and draws across cards", "各公共牌的成牌与听牌分布"),
        composition,
      );
      element(
        "p",
        t(
          "Draw percentages may overlap and are not guaranteed winning outs. River draw percentages are zero. Hand class includes the public board.",
          "听牌比例可能重叠，并非保证获胜的补牌。河牌听牌比例为零；牌型包含公共牌。",
        ),
        composition,
      );
      const strength = (summary) =>
        summary
          ? summary.categories
              .map((p, i) =>
                p > 0 ? `${t(...CATEGORIES[i])} ${percent(p)}` : "",
              )
              .filter(Boolean)
              .join(" · ") +
            ` · ${t("Flush draw", "同花听牌")} ${percent(summary.flushDraw)} · ${t("Straight draw", "顺子听牌")} ${percent(summary.straightDraw)}`
          : "—";
      for (const side of ["hero", "villain"])
        element(
          "p",
          (side === "hero"
            ? t("Your weighted range", "玩家加权范围")
            : t("Opponent weighted range", "对手加权范围")) +
            " · " +
            strength(report.weighted[side]),
          composition,
        );
      const compScroll = element("div", undefined, composition);
      compScroll.className = "scroll card-comparison";
      const compTable = element("table", undefined, compScroll),
        compHead = element(
          "tr",
          undefined,
          element("thead", undefined, compTable),
        );
      for (const text of [
        t("Card", "牌张"),
        t("Your range", "玩家范围"),
        t("Opponent range", "对手范围"),
      ])
        element("th", text, compHead);
      const compBody = element("tbody", undefined, compTable);
      for (const row of report.rows) {
        const tr = element("tr", undefined, compBody);
        for (const text of [
          row.name,
          strength(row.hero),
          strength(row.villain),
        ])
          element("td", text, tr);
      }
    } catch (e) {
      element("p", e.message, content);
    }
  }
  const task = analysisTask(
    content,
    t,
    () =>
      analysis.request(analysisRequest(result, path, select.value, "cards")),
    render,
  );
  // The explorer rebuilds both reports so their selected profile stays shared.
  select.onchange = () => {
    onOpen(details.open);
    onProfile(select.value);
  };
  details.ontoggle = () => {
    if (!details.isConnected) return;
    onOpen(details.open);
    if (details.open && !task.ready) task.load();
    if (!details.open) task.cancel();
  };
  details.open = open;
  if (open) task.load();
  return () => task.dispose();
}
