import { fullActionLabel, streetName } from "./full-game.js";
import { cardName, validate } from "./engine.js";

export function fullExplorer(container, result) {
  const section = document.createElement("section");
  section.className = "report";
  const g = validate(result.scenario),
    trail = [result.root];
  function render() {
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
        trail.push(node.children[select.value]);
        render();
      };
      label.append(select);
      controls.append(label, go);
      return;
    }
    const actor = document.createElement("p");
    actor.textContent =
      node.player === 0 ? "You · out of position" : "Opponent · in position";
    section.append(actor);
    node.actions.forEach((a, i) => {
      const button = document.createElement("button");
      button.textContent = fullActionLabel(a, node, result.scenario);
      button.onclick = () => {
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
