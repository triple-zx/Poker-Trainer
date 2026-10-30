import { readFile } from "node:fs/promises";
import {
  DEFAULT,
  validate,
  equity,
  actionValues,
  solve,
} from "../app/engine.js";
const g = validate(DEFAULT),
  start = performance.now(),
  eq = g.pairs.map((p) =>
    equity(g.hero[p.i].cards, g.villain[p.j].cards, g.board),
  );
const reference = solve(DEFAULT, eq),
  referenceMs = performance.now() - start;
const data = JSON.parse(
  await readFile(process.argv[2] || "native-result.json", "utf8"),
);
const x = g.hero.map(
  (h) =>
    data.strategy.strategy[h.label][
      data.actions.findIndex((a) => a.startsWith("BET "))
    ],
);
const child = data.childrens[data.actions.find((a) => a.startsWith("BET "))];
const y = g.villain.map(
  (h) => child.strategy.strategy[h.label][child.actions.indexOf("CALL")],
);
const { hv, vv } = actionValues(g, DEFAULT, eq, x, y);
const gap =
  hv.reduce(
    (a, v, i) => a + Math.max(...v) - (v[0] * (1 - x[i]) + v[1] * x[i]),
    0,
  ) +
  vv.reduce(
    (a, v, i) => a + Math.max(...v) - (v[0] * (1 - y[i]) + v[1] * y[i]),
    0,
  );
console.log(
  JSON.stringify(
    {
      referenceMs,
      referenceGap: reference.gap,
      nativeGap: gap,
      nativeShove: x,
      nativeCall: y,
      referenceShove: reference.baseline,
      referenceCall: reference.calls,
    },
    null,
    2,
  ),
);
if (gap > 0.001)
  throw Error("Native strategy failed independent 0.001 bb Nash-gap threshold");
