import {
  RANGE_TEMPLATES,
  RANGE_FILE_LIMIT,
  parsePreflopRange,
  rangeText,
  rangeDocument,
  importRangeFile,
  preflopMatrix,
  handClass,
  rangeForFlop,
} from "./preflop-ranges.js";

const STORAGE_KEY = "poker-trainer-ranges-v1";
const el = (tag, text, parent) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
const blank = () => ({
  type: "poker-trainer-range",
  schema: 1,
  name: "",
  range: "",
  context: { tableFormat: "unspecified" },
  source: {},
});
export function rangeWorkspace(container, { t, scenario, onApply, download }) {
  const state = {
    doc: blank(),
    selectedClass: "AA",
    saved: [],
    message: "",
    error: "",
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length > 100)
        throw Error("Invalid range library");
      state.saved = data.map(rangeDocument);
    }
  } catch {
    state.error =
      "Saved range library could not be read. Existing storage has not been overwritten.";
    state.storageInvalid = true;
  }
  function render() {
    container.replaceChildren();
    el("h2", t("Preflop range library", "翻前范围库"), container);
    el(
      "p",
      t(
        "Build and keep complete 1,326-combination ranges here. These are weighted range inputs, not a preflop solver or action recommendations. Source notes and game assumptions travel with each range. Construction templates illustrate hand families only.",
        "此处可编辑和保存完整的 1,326 组合范围。这些是带权范围输入，不是翻前求解结果或行动建议。来源说明与牌局假设随范围保存；内置构建模板仅展示手牌类型。",
      ),
      container,
    );
    const toolbar = el("div", undefined, container);
    toolbar.className = "toolbar";
    const chooseLabel = el("label", undefined, toolbar);
    el("span", t("Range library", "范围库"), chooseLabel);
    const choose = el("select", undefined, chooseLabel);
    el(
      "option",
      t("Choose a saved range or template", "选择已保存范围或模板"),
      choose,
    ).value = "";
    for (const [i, doc] of RANGE_TEMPLATES.entries())
      el(
        "option",
        t(
          "Template: " + doc.name,
          [
            "模板：全部起手牌",
            "模板：口袋对子",
            "模板：大牌组合",
            "模板：同花连张",
          ][i],
        ),
        choose,
      ).value = "template:" + i;
    for (const [i, doc] of state.saved.entries())
      el("option", doc.name, choose).value = "saved:" + i;
    const button = (name, zh, parent, fn) => {
      const b = el("button", t(name, zh), parent);
      b.type = "button";
      b.onclick = fn;
      return b;
    };
    const status = el(
      "p",
      state.error ||
        (Array.isArray(state.message) ? t(...state.message) : state.message),
      container,
    );
    status.setAttribute("role", "status");
    const attempt = (fn) => {
      try {
        fn();
      } catch (e) {
        status.textContent = e.message;
      }
    };
    button("Load range", "加载范围", toolbar, () =>
      attempt(() => {
        if (!choose.value)
          throw Error(t("Choose a range first", "请先选择范围"));
        const [kind, index] = choose.value.split(":");
        state.doc = structuredClone(
          (kind === "template" ? RANGE_TEMPLATES : state.saved)[Number(index)],
        );
        state.message = "";
        render();
      }),
    );
    button("New range", "新建范围", toolbar, () => {
      state.doc = blank();
      state.message = "";
      render();
    });
    const inputField = (
      label,
      zh,
      key,
      parent,
      owner = state.doc,
      type = "text",
    ) => {
      const wrap = el("label", undefined, parent);
      el("span", t(label, zh), wrap);
      const input = el(
        type === "textarea" ? "textarea" : "input",
        undefined,
        wrap,
      );
      if (type !== "textarea") input.type = type;
      input.value = owner[key] ?? "";
      input.oninput = () => {
        owner[key] =
          type === "number"
            ? input.value === ""
              ? null
              : Number(input.value)
            : input.value;
      };
      return input;
    };
    inputField("Range name", "范围名称", "name", container).maxLength = 100;
    const text = inputField(
      "Range text",
      "范围文本",
      "range",
      container,
      state.doc,
      "textarea",
    );
    text.rows = 4;
    text.spellcheck = false;
    el(
      "p",
      t(
        "Examples: QQ+, A5s-A2s:0.5, ATo+, T9s-54s, AhKh:25%. Bare weights are 0–1; zero excludes a combo. AK includes suited and offsuit. Overlapping tokens are rejected. Paste comma-separated class or exact-combination text; raw numerical vectors and proprietary binary files are not supported.",
        "示例：QQ+、A5s-A2s:0.5、ATo+、T9s-54s、AhKh:25%。普通权重为 0–1，零表示排除。AK 包含同花及非同花。重叠项会被拒绝。支持逗号分隔的牌型或具体组合文本；不支持无标签数值向量或专有二进制文件。",
      ),
      container,
    ).className = "hint";
    const metadata = el("details", undefined, container);
    el("summary", t("Game assumptions and source", "牌局假设与来源"), metadata);
    el(
      "p",
      t(
        "Unknown values may stay blank. These notes describe the source scenario; applying a range does not change pot, stack, position or rake in Configure. Imported source claims are not independently verified.",
        "未知值可留空。这些说明描述来源牌局；应用范围不会修改设置中的底池、筹码、位置或抽水。导入文件中的来源声明未经独立核实。",
      ),
      metadata,
    );
    const context = state.doc.context,
      source = state.doc.source;
    const tableLabel = el("label", undefined, metadata);
    el("span", t("Table format", "牌桌人数"), tableLabel);
    const table = el("select", undefined, tableLabel);
    for (const [v, en, zh] of [
      ["unspecified", "Unspecified", "未指定"],
      ["hu", "Heads-up", "单挑"],
      ["6max", "6-max", "六人桌"],
    ])
      el("option", t(en, zh), table).value = v;
    table.value = context.tableFormat || "unspecified";
    table.onchange = () => (context.tableFormat = table.value);
    const fields = el("div", undefined, metadata);
    fields.className = "range-fields";
    for (const [key, en, zh, type] of [
      [
        "position",
        "Range position (HU: BTN/SB, BB; 6-max: UTG, HJ, CO, BTN, SB, BB)",
        "范围位置（单挑：BTN/SB、BB；六人桌：UTG、HJ、CO、BTN、SB、BB）",
        "text",
      ],
      ["opponentPosition", "Opponent position", "对手位置", "text"],
      [
        "stackBB",
        "Starting effective stack (bb)",
        "起始有效筹码（大盲）",
        "number",
      ],
      ["rakePercent", "Source rake (%)", "来源抽水（%）", "number"],
      ["rakeCapBB", "Source rake cap (bb)", "来源抽水上限（大盲）", "number"],
      ["anteBB", "Ante per player (bb)", "每人前注（大盲）", "number"],
      [
        "history",
        "Preflop action history / selected action",
        "翻前行动历史 / 所选行动",
        "text",
      ],
      [
        "betSizes",
        "Open and raise sizes (bb)",
        "开池与加注尺度（大盲）",
        "text",
      ],
    ]) {
      const input = inputField(en, zh, key, fields, context, type);
      if (type === "number") {
        input.min = "0";
        input.step = "any";
      }
    }
    for (const [key, en, zh] of [
      ["label", "Source / author", "来源 / 作者"],
      ["url", "Source URL or citation", "来源网址或引用"],
      ["license", "Usage / sharing terms", "使用 / 分享条款"],
      ["notes", "Quality evidence and notes", "质量证据与说明"],
    ])
      inputField(
        en,
        zh,
        key,
        metadata,
        source,
        key === "notes" ? "textarea" : "text",
      );
    const chartSummary = el("p", "", container),
      scroll = el("div", undefined, container);
    scroll.className = "scroll";
    const matrix = el("div", undefined, scroll);
    matrix.className = "range-editor-matrix";
    matrix.setAttribute("role", "group");
    matrix.setAttribute("aria-label", t("Starting-hand weights", "起手牌权重"));
    const editor = el("div", undefined, container);
    editor.className = "report";
    text.oninput = () => {
      state.doc.range = text.value;
      matrix.replaceChildren();
      editor.replaceChildren();
      chartSummary.textContent = t(
        "Read range text to update the matrix and combination editor.",
        "请读取范围文本以更新矩阵和组合编辑器。",
      );
    };
    function setClass(combos) {
      const previous = parsePreflopRange(state.doc.range);
      if (!state.doc.originalRange && previous.length)
        state.doc.originalRange = rangeText(previous);
      state.doc.range = rangeText(
        [
          ...previous.filter((h) => handClass(h.cards) !== state.selectedClass),
          ...combos.filter((h) => h.weight > 0),
        ].sort((a, b) => b.cards[0] - a.cards[0] || b.cards[1] - a.cards[1]),
      );
      text.value = state.doc.range;
      draw();
    }
    function draw() {
      const hands = parsePreflopRange(state.doc.range),
        cells = preflopMatrix(hands);
      const mass = hands.reduce((sum, h) => sum + h.weight, 0);
      chartSummary.textContent = t(
        `${hands.length} included combinations · ${mass.toFixed(2)} weighted combinations · ${((mass / 1326) * 100).toFixed(2)}% of all starting hands. Matrix cells show mean inclusion weight, not normalized deal share.`,
        `${hands.length} 个已包含组合 · 加权组合数 ${mass.toFixed(2)} · 占全部起手牌 ${((mass / 1326) * 100).toFixed(2)}%。矩阵显示平均纳入权重，不是归一化发牌概率。`,
      );
      matrix.replaceChildren();
      editor.replaceChildren();
      for (const cell of cells) {
        const b = button(cell.label, cell.label, matrix, () => {
          state.selectedClass = cell.label;
          attempt(draw);
        });
        b.style.background = `linear-gradient(to right, #405631 ${cell.weight * 100}%, #17231d ${cell.weight * 100}%)`;
        b.setAttribute(
          "aria-label",
          `${cell.label} · ${(cell.weight * 100).toFixed(1)}%`,
        );
        b.setAttribute(
          "aria-pressed",
          String(state.selectedClass === cell.label),
        );
        el("small", (100 * cell.weight).toFixed(0) + "%", b);
      }
      const selected = cells.find((c) => c.label === state.selectedClass);
      el("h3", t("Edit ", "编辑 ") + selected.label, editor);
      const allLabel = el("label", undefined, editor);
      el("span", t("Whole-class weight (0–1)", "整类权重（0–1）"), allLabel);
      const all = el("input", undefined, allLabel);
      all.type = "number";
      all.min = "0";
      all.max = "1";
      all.step = "any";
      all.value = String(selected.weight);
      const valid = (value) => {
        const n = Number(value);
        if (value === "" || !Number.isFinite(n) || n < 0 || n > 1)
          throw Error(t("Weights must be from 0 to 1", "权重须为 0 至 1"));
        return n;
      };
      button("Set whole class", "设置整类", editor, () =>
        attempt(() =>
          setClass(
            selected.combos.map((h) => ({ ...h, weight: valid(all.value) })),
          ),
        ),
      );
      const list = el("div", undefined, editor);
      list.className = "range-fields";
      const weights = selected.combos.map((h) => {
        const label = el("label", undefined, list);
        el("span", h.label + t(" weight", " 权重"), label);
        const input = el("input", undefined, label);
        input.type = "number";
        input.min = "0";
        input.max = "1";
        input.step = "any";
        input.value = String(h.weight);
        return { h, input };
      });
      button("Apply combination weights", "应用组合权重", editor, () =>
        attempt(() =>
          setClass(
            weights.map(({ h, input }) => ({
              ...h,
              weight: valid(input.value),
            })),
          ),
        ),
      );
      const edited =
        state.doc.originalRange && rangeText(hands) !== state.doc.originalRange;
      if (edited)
        el(
          "p",
          t(
            "Edited from its original range. The source notes describe the original; these weights are your study model.",
            "此范围已在原始范围基础上修改。来源说明描述原始数据；当前权重是您的研究模型。",
          ),
          editor,
        );
    }
    button("Read range text", "读取范围文本", container, () =>
      attempt(() => {
        draw();
        status.textContent = t("Range text accepted.", "范围文本已读取。");
      }),
    );
    const actions = el("div", undefined, container);
    actions.className = "toolbar";
    const current = () => rangeDocument(state.doc);
    button("Save range", "保存范围", actions, () =>
      attempt(() => {
        if (state.storageInvalid) throw Error(state.error);
        const doc = current(),
          next = state.saved.filter((d) => d.name !== doc.name).concat(doc);
        if (next.length > 100)
          throw Error(
            t(
              "The library holds at most 100 ranges",
              "范围库最多保存 100 个范围",
            ),
          );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        state.saved = next;
        state.doc = doc;
        state.message = ["Range saved locally.", "范围已保存到本地。"];
        render();
      }),
    );
    button("Export range package", "导出范围文件", actions, () =>
      attempt(() => download(current(), "poker-range.json")),
    );
    button("Export combination text", "导出组合文本", actions, () =>
      attempt(() =>
        download(
          new Blob([current().range], { type: "text/plain" }),
          "poker-range.txt",
        ),
      ),
    );
    const importLabel = el("label", undefined, actions);
    el("span", t("Import range file", "导入范围文件"), importLabel);
    const file = el("input", undefined, importLabel);
    file.type = "file";
    file.accept = ".json,.txt,.csv";
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        if (f.size > RANGE_FILE_LIMIT)
          throw Error(
            t("Range files must be at most 1 MiB", "范围文件不得超过 1 MiB"),
          );
        state.doc = importRangeFile(await f.text(), f.name);
        state.message = [
          "Range imported. Review its assumptions before saving or applying.",
          "范围已导入。保存或应用前请查看其假设。",
        ];
        render();
      } catch (e) {
        status.textContent = e.message;
      }
    };
    const apply = el("details", undefined, container);
    el(
      "summary",
      t("Use this range in postflop training", "将此范围用于翻后训练"),
      apply,
    );
    el(
      "p",
      t(
        "Applying removes only combinations blocked by the configured flop, preserves the remaining weights and records the source. Full-hand solves currently accept four exact combos per player; bounded drills accept twelve. Larger ranges stay available in this library and are never silently sampled. Changing a range invalidates the active solution and opponent node edits.",
        "应用时仅移除被已配置翻牌阻断的组合，保留其余权重并记录来源。当前全手牌求解每位玩家最多四个具体组合，有限行动练习最多十二个。更大的范围可保留在库中，不会被静默抽样。更改范围会使当前解及对手节点编辑失效。",
      ),
      apply,
    );
    for (const [side, en, zh] of [
      ["hero", "Use as hero range", "用作玩家范围"],
      ["villain", "Use as opponent range", "用作对手范围"],
    ])
      button(en, zh, apply, () =>
        attempt(() => {
          const s = scenario(),
            applied = rangeForFlop(
              current(),
              s.flop,
              s.game === "full" ? 4 : 12,
            );
          onApply(side, applied);
          status.textContent = t(
            `Applied ${applied.count} combinations; ${applied.blocked} flop-blocked combinations removed. Source recorded. Configure and precompute before training.`,
            `已应用 ${applied.count} 个组合，移除 ${applied.blocked} 个被翻牌阻断的组合，并记录来源。训练前请检查设置并重新计算。`,
          );
        }),
      );
    attempt(draw);
  }
  return { render };
}

export function showRangeOrigins(container, origins, t) {
  container.replaceChildren();
  if (!origins) return;
  const details = el("details", undefined, container);
  el("summary", t("Applied range sources", "已应用范围的来源"), details);
  for (const [side, raw] of Object.entries(origins)) {
    const doc = rangeDocument(raw);
    el(
      "h3",
      t(
        side === "hero" ? "Hero" : "Opponent",
        side === "hero" ? "玩家" : "对手",
      ) +
        " · " +
        doc.name,
      details,
    );
    el(
      "p",
      t(
        "Source claims are unverified. Game assumptions are descriptive and do not replace the current scenario settings.",
        "来源声明未经核实。牌局假设仅供描述，不会替换当前场景设置。",
      ),
      details,
    );
    const labels = {
      tableFormat: ["Table format", "牌桌人数"],
      position: ["Range position", "范围位置"],
      opponentPosition: ["Opponent position", "对手位置"],
      stackBB: ["Starting stack (bb)", "起始筹码（大盲）"],
      rakePercent: ["Source rake (%)", "来源抽水（%）"],
      rakeCapBB: ["Source rake cap (bb)", "来源抽水上限（大盲）"],
      anteBB: ["Ante per player (bb)", "每人前注（大盲）"],
      history: ["Preflop history", "翻前历史"],
      betSizes: ["Open / raise sizes", "开池 / 加注尺度"],
      label: ["Source", "来源"],
      url: ["Source URL / citation", "来源网址 / 引用"],
      license: ["Usage / sharing terms", "使用 / 分享条款"],
      notes: ["Quality notes", "质量说明"],
    };
    for (const [key, value] of Object.entries({
      ...doc.context,
      ...doc.source,
    }))
      if (value !== "" && value !== null)
        el(
          "p",
          `${t(...labels[key])}: ${key === "tableFormat" ? { hu: t("Heads-up", "单挑"), "6max": t("6-max", "六人桌"), unspecified: t("Unspecified", "未指定") }[value] : value}`,
          details,
        );
    if (doc.originalRange !== doc.range)
      el(
        "p",
        t(
          "Weights edited from the original source range.",
          "权重已在原始来源范围基础上修改。",
        ),
        details,
      );
  }
}
