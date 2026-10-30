import { FullSession } from "./full-session.js";
import { fullActionLabel, streetName } from "./full-game.js";
import { cardName } from "./engine.js";

export function startFullTraining(
  result,
  sampling,
  { cardHTML, onFinish, onError, practiceTarget = "", drill = null },
) {
  const session = new FullSession(result, sampling, Math.random, drill),
    $ = (s) => document.querySelector(s);
  const log = $("#action-history"),
    actions = $("#sized-actions");
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
  const speed = $("#animation-speed");
  speed.hidden = false;
  speed.textContent = fast ? "Animation: instant" : "Animation: on";
  speed.onclick = () => {
    fast = !fast;
    speed.textContent = fast ? "Animation: instant" : "Animation: on";
  };
  function draw(event) {
    if (cancelled) return;
    const boardKey = event.board.join(",");
    if (boardKey !== lastBoard) {
      $("#board").innerHTML = cardHTML(event.board);
      lastBoard = boardKey;
    }
    $("#pot-display").textContent =
      `${streetName(event.board)} · Pot ${event.pot.toFixed(3).replace(/\.?0+$/, "")} bb · You ${(result.scenario.stack - event.spent[0]).toFixed(2)} bb · Opponent ${(result.scenario.stack - event.spent[1]).toFixed(2)} bb`;
    const li = document.createElement("li");
    li.textContent = event.text;
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
          title.textContent = `${drill ? "Decision drill complete · no continuation played" : session.events.at(-1).text} · ${session.decisions.length} ${session.decisions.length === 1 ? "decision" : "decisions"} · Total EV loss ${loss.toFixed(4)} bb`;
          feedback.append(title);
          for (const d of session.decisions) {
            const details = document.createElement("details"),
              summary = document.createElement("summary");
            summary.textContent = `${d.street} · ${d.label} · loss ${d.loss.toFixed(4)} bb`;
            details.append(summary);
            d.choices.forEach((label, i) => {
              const p = document.createElement("p");
              p.textContent = `${label}: EV ${d.ev[i].toFixed(4)} bb · target ${(100 * d.target[i]).toFixed(1)}%`;
              if (d.retained)
                p.textContent += d.retained.includes(i)
                  ? " · retained menu"
                  : " · alternative evaluated choice";
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
          button.textContent = fullActionLabel(
            a,
            session.node,
            result.scenario,
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
      $("#target").disabled = false;
      actions.replaceChildren();
      speed.hidden = true;
    },
    session,
  };
}

export function fullReplay(container, record, cardHTML, parseCards) {
  const box = document.createElement("section"),
    display = document.createElement("div"),
    text = document.createElement("p"),
    next = document.createElement("button");
  let index = 0;
  function render() {
    const event = record.events[index];
    display.innerHTML = cardHTML(event.board);
    text.textContent = `${index + 1}/${record.events.length} · ${event.text} · pot ${event.pot} bb`;
    next.textContent =
      index === record.events.length - 1 ? "Replay again" : "Next action →";
  }
  next.onclick = () => {
    index = (index + 1) % record.events.length;
    render();
  };
  box.append(display, text, next);
  for (const d of record.decisions) {
    const p = document.createElement("p");
    p.textContent =
      `${d.street}: ${d.label} · loss ${d.loss.toFixed(4)} bb · ` +
      d.choices
        .map(
          (c, i) =>
            `${c}: ${d.ev[i].toFixed(3)} bb${d.retained ? (d.retained.includes(i) ? " (retained)" : " (alternative)") : ""}`,
        )
        .join(" / ");
    box.append(p);
  }
  container.append(box);
  render();
}
