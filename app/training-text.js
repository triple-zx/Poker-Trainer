// Journal values stay canonical so switching languages cannot split statistics.
// Translate only the exact labels emitted by FullSession; preserve unfamiliar
// legacy text verbatim instead of changing user-supplied content.
export function trainingStreet(name, t = (en) => en) {
  const streets = { Flop: "翻牌", Turn: "转牌", River: "河牌" };
  return Object.hasOwn(streets, name) ? t(name, streets[name]) : name;
}

export function trainingAction(label, t = (en) => en) {
  if (label === "Check") return t(label, "过牌");
  if (label === "Fold") return t(label, "弃牌");
  const match = /^(Call|Bet|Raise to) (\d+(?:\.\d+)?) bb( · all-in)?$/.exec(
    label,
  );
  if (!match) return label;
  const [, kind, amount, allIn] = match;
  return t(
    label,
    `${{ Call: "跟注", Bet: "下注", "Raise to": "加注至" }[kind]} ${amount} 大盲${allIn ? " · 全下" : ""}`,
  );
}

export function trainingEvent(text, t = (en) => en) {
  const outcomes = {
    "Split pot": "平分底池",
    "You win": "你获胜",
    "Opponent wins": "对手获胜",
  };
  if (Object.hasOwn(outcomes, text)) return t(text, outcomes[text]);
  const street = /^(Flop|Turn|River)( · action begins| · all-in runout)?$/.exec(
    text,
  );
  if (street)
    return (
      trainingStreet(street[1], t) +
      (street[2] === " · action begins"
        ? t(street[2], " · 行动开始")
        : street[2]
          ? t(street[2], " · 全下发牌")
          : "")
    );
  const actor = /^(You|Opponent) · (.+)$/.exec(text);
  if (actor) {
    const action = trainingAction(actor[2], t);
    // Unknown action text may come from older or externally supplied records.
    if (
      !/^(Check|Fold|(?:Call|Bet|Raise to) \d+(?:\.\d+)? bb(?: · all-in)?)$/.test(
        actor[2],
      )
    )
      return text;
    return (
      (actor[1] === "You" ? t("You", "你") : t("Opponent", "对手")) +
      " · " +
      action
    );
  }
  return text;
}
