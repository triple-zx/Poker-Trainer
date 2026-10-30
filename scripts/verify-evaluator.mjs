import assert from "node:assert/strict";
import { rank7 } from "../app/engine.js";
const counts = Array(9).fill(0),
  start = performance.now();
for (let a = 0; a < 48; a++)
  for (let b = a + 1; b < 49; b++)
    for (let c = b + 1; c < 50; c++)
      for (let d = c + 1; d < 51; d++)
        for (let e = d + 1; e < 52; e++)
          counts[Math.floor(rank7([a, b, c, d, e]) / 15 ** 5)]++;
// Combinatorial five-card category counts, ordered from high card to straight flush.
assert.deepEqual(
  counts,
  [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40],
);
console.log(
  JSON.stringify({
    hands: counts.reduce((a, b) => a + b, 0),
    counts,
    elapsedMs: performance.now() - start,
  }),
);
