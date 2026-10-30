import { CATEGORIES } from "./analytics.js";
const kinds = ["call", "bet", "raise"];
const labels = [
  ["Call", "跟注"],
  ["Bet", "下注"],
  ["Raise", "加注"],
];
const field = (i, kind) => `class_${i}_${kind}`;
export function renderTendencyClasses(container, t) {
  const previous = Object.fromEntries(
    [...container.querySelectorAll("input")].map((input) => [
      input.name,
      input.value,
    ]),
  );
  const table = document.createElement("table"),
    head = document.createElement("tr");
  for (const pair of [["Hand class", "牌型"], ...labels]) {
    const th = document.createElement("th");
    th.textContent = t(...pair);
    head.append(th);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  table.append(thead);
  const tbody = document.createElement("tbody");
  CATEGORIES.forEach((category, i) => {
    const row = document.createElement("tr"),
      name = document.createElement("th");
    name.textContent = t(...category);
    row.append(name);
    kinds.forEach((kind, k) => {
      const cell = document.createElement("td"),
        input = document.createElement("input");
      input.type = "number";
      input.min = "-1";
      input.max = "1";
      input.step = "any";
      input.name = field(i, kind);
      input.value = previous[input.name] ?? "";
      input.placeholder = t("Global", "全局");
      input.setAttribute(
        "aria-label",
        `${t(...category)} · ${t(...labels[k])}`,
      );
      cell.append(input);
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(tbody);
  container.replaceChildren(table);
}
export function readTendencies(form) {
  const bluff = Number(form.elements.bluffTendency.value),
    raise = Number(form.elements.raiseTendency.value),
    classes = {};
  CATEGORIES.forEach((_, i) => {
    for (const kind of kinds) {
      const text = form.elements[field(i, kind)].value.trim();
      if (text !== "") {
        classes[i] ||= {};
        classes[i][kind] = Number(text);
      }
    }
  });
  return bluff || raise || Object.keys(classes).length
    ? { bluff, raise, classes }
    : undefined;
}
export function fillTendencies(form, s) {
  form.elements.bluffTendency.value = s.fullTendencies?.bluff ?? 0;
  form.elements.raiseTendency.value = s.fullTendencies?.raise ?? 0;
  CATEGORIES.forEach((_, i) =>
    kinds.forEach((kind) => {
      form.elements[field(i, kind)].value =
        s.fullTendencies?.classes?.[i]?.[kind] ?? "";
    }),
  );
}
export function tendencySummary(s, t) {
  if (!s.fullTendencies) return "";
  const cfg = s.fullTendencies;
  const parts = [
    `${t("High-card bluff aggression", "高牌诈唬倾向")}: ${cfg.bluff ?? 0}`,
    `${t("Made-hand raising", "成牌加注倾向")}: ${cfg.raise ?? 0}`,
  ];
  for (const [category, row] of Object.entries(cfg.classes || {}))
    for (const [kind, value] of Object.entries(row))
      parts.push(
        `${t(...CATEGORIES[Number(category)])} · ${t(...labels[kinds.indexOf(kind)])}: ${value}`,
      );
  return parts.join(" · ");
}
