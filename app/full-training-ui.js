import { FullSession } from "./full-session.js";
import { fullActionLabel, streetName } from "./full-game.js";
import { cardName } from "./engine.js";
import {
  trainingStreet,
  trainingAction,
  trainingEvent,
} from "./training-text.js";

export function startFullTraining(
  result,
  sampling,
  {
    cardHTML,
    onFinish,
    onError,
    practiceTarget = "",
    drill = null,
    t = (en) => en,
    samplingDescription = null,
  },
) {
  const session = new FullSession(result, sampling, Math.random, drill),
    $ = (s) => document.querySelector(s);
  const log = $("#action-history"),
    actions = $("#sized-actions");
  const captions = new Map();
  function caption(element, text) {
    captions.set(element, text);
    element.textContent = text();
  }
  function refresh() {
    if (cancelled) return;
    for (const [element, text] of captions) {
      if (element.isConnected) element.textContent = text();
      else captions.delete(element);
    }
  }
  let cancelled = false,
    busy = false,
    lastBoard = "",
    fast = matchMedia("(prefers-reduced-motion: reduce)").matches;
  log.replaceChildren();
  $("#feedback").replaceChildren();
  $("#hero-cards").innerHTML = cardHTML(session.g.hero[session.deal.i].cards);
  $("#opponent").innerHTML = cardHTML([null, null]);
  $("#check").hidden = $("#shove").hidden = true;
  $("#deal").disabled = true;
  $("#target").disabled = !!drill;
  if (samplingDescription) caption($("#sampling-note"), samplingDescription);
  const speed = $("#animation-speed");
  speed.hidden = false;
  caption(speed, () =>
    fast
      ? t("Animation: instant", "动画：即时")
      : t("Animation: on", "动画：开启"),
  );
  speed.onclick = () => {
    fast = !fast;
    refresh();
  };
  function draw(event) {
    if (cancelled) return;
    const boardKey = event.board.join(",");
    if (boardKey !== lastBoard) {
      $("#board").innerHTML = cardHTML(event.board);
      lastBoard = boardKey;
    }
    caption(
      $("#pot-display"),
      () =>
        `${trainingStreet(streetName(event.board), t)} · ${t("Pot", "底池")} ${event.pot.toFixed(3).replace(/\.?0+$/, "")} ${t("bb", "大盲")} · ${t("You", "你")} ${(result.scenario.stack - event.spent[0]).toFixed(2)} ${t("bb", "大盲")} · ${t("Opponent", "对手")} ${(result.scenario.stack - event.spent[1]).toFixed(2)} ${t("bb", "大盲")}`,
    );
    const li = document.createElement("li");
    caption(li, () => trainingEvent(event.text, t));
    log.append(li);
    log.scrollTop = log.scrollHeight;
  }
  const delay = () =>
    new Promise((resolve) => setTimeout(resolve, fast ? 0 : 650));
  async function pump(first) {
    if (busy || cancelled) return;
    busy = true;
    actions.replaceChildren();
    try {
      for (const event of first || []) {
        if (cancelled) return;
        draw(event);
        await delay();
      }
      while (!cancelled) {
        if (session.finished) {
          $("#opponent").innerHTML = cardHTML(
            session.g.villain[session.deal.j].cards,
          );
          $("#deal").disabled = false;
          $("#target").disabled = false;
          speed.hidden = true;
          const loss = session.decisions.reduce((sum, d) => sum + d.loss, 0);
          const feedback = $("#feedback");
          const title = document.createElement("p");
          caption(
            title,
            () =>
              `${drill ? t("Decision drill complete · no continuation played", "单次决策训练完成 · 未继续后续行动") : trainingEvent(session.events.at(-1).text, t)} · ${session.decisions.length} ${t(session.decisions.length === 1 ? "decision" : "decisions", "次决策")} · ${t("Total EV loss", "总 EV 损失")} ${loss.toFixed(4)} ${t("bb", "大盲")}`,
          );
          feedback.append(title);
          for (const d of session.decisions) {
            const details = document.createElement("details"),
              summary = document.createElement("summary");
            caption(
              summary,
              () =>
                `${trainingStreet(d.street, t)} · ${trainingAction(d.label, t)} · ${t("loss", "损失")} ${d.loss.toFixed(4)} ${t("bb", "大盲")}`,
            );
            details.append(summary);
            d.choices.forEach((label, i) => {
              const p = document.createElement("p");
              caption(
                p,
                () =>
                  `${trainingAction(label, t)}: EV ${d.ev[i].toFixed(4)} ${t("bb", "大盲")} · ${t("target", "目标频率")} ${(100 * d.target[i]).toFixed(1)}%` +
                  (d.retained
                    ? d.retained.includes(i)
                      ? t(" · retained menu", " · 保留尺度")
                      : t(
                          " · alternative evaluated choice",
                          " · 已计算的备选行动",
                        )
                    : ""),
              );
              details.append(p);
            });
            feedback.append(details);
          }
          onFinish({
            full: true,
            ...(drill ? { drill: session.drill } : {}),
            date: new Date().toISOString(),
            scenario: result.scenario.name,
            config: structuredClone(result.scenario),
            hero: session.g.hero[session.deal.i].label,
            villain: session.g.villain[session.deal.j].label,
            board: session.node.board.map(cardName).join(" "),
            loss,
            decisions: session.decisions,
            events: session.events,
            bookmark: false,
            targeted: practiceTarget !== "",
            practiceTarget,
          });
          break;
        }
        const event = session.advance();
        if (!event) break;
        draw(event);
        await delay();
      }
      if (!cancelled && !session.finished)
        session.node.actions.forEach((a, i) => {
          const button = document.createElement("button");
          caption(button, () =>
            fullActionLabel(a, session.node, result.scenario, t),
          );
          button.onclick = () => {
            if (!busy) pump([session.choose(i)]);
          };
          actions.append(button);
        });
    } catch (e) {
      cancelled = true;
      $("#target").disabled = false;
      onError(e);
    } finally {
      busy = false;
    }
  }
  pump(session.intro);
  return {
    cancel() {
      cancelled = true;
      captions.clear();
      $("#target").disabled = false;
      actions.replaceChildren();
      speed.hidden = true;
      speed.onclick = null;
    },
    refresh,
    session,
  };
}

export function fullReplay(
  container,
  record,
  cardHTML,
  t = (en) => en,
  state = { index: 0 },
) {
  const box = document.createElement("section"),
    display = document.createElement("div"),
    text = document.createElement("p"),
    next = document.createElement("button");
  function render() {
    const event = record.events[state.index];
    display.innerHTML = cardHTML(event.board);
    text.textContent = `${state.index + 1}/${record.events.length} · ${trainingEvent(event.text, t)} · ${t("pot", "底池")} ${event.pot} ${t("bb", "大盲")}`;
    next.textContent =
      state.index === record.events.length - 1
        ? t("Replay again", "再次回放")
        : t("Next action →", "下一步 →");
  }
  next.onclick = () => {
    state.index = (state.index + 1) % record.events.length;
    render();
  };
  box.append(display, text, next);
  for (const d of record.decisions) {
    const p = document.createElement("p");
    p.textContent =
      `${trainingStreet(d.street, t)}: ${trainingAction(d.label, t)} · ${t("loss", "损失")} ${d.loss.toFixed(4)} ${t("bb", "大盲")} · ` +
      d.choices
        .map(
          (c, i) =>
            `${trainingAction(c, t)}: ${d.ev[i].toFixed(3)} ${t("bb", "大盲")}${d.retained ? (d.retained.includes(i) ? t(" (retained)", "（保留）") : t(" (alternative)", "（备选）")) : ""}`,
        )
        .join(" / ");
    box.append(p);
  }
  container.append(box);
  render();
}
