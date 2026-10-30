import { validate, payoffs } from "./engine.js";

import { betAmounts } from "./sizing-config.js";
export { betAmounts } from "./sizing-config.js";
const normalize = (r) => {
  const v = r.map((x) => Math.max(0, x)),
    sum = v.reduce((a, b) => a + b, 0);
  return sum ? v.map((x) => x / sum) : r.map(() => 1 / r.length);
};
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
export function selectSizes(ev, masses, maxSizes, lossTarget) {
  const count = ev[0].length - 1,
    full = ev.reduce((a, v, i) => a + masses[i] * Math.max(...v), 0);
  let best = null,
    within = null;
  for (let mask = 1; mask < 2 ** count; mask++) {
    const retained = Array.from({ length: count }, (_, i) => i + 1).filter(
      (i) => mask & (1 << (i - 1)),
    );
    if (retained.length > maxSizes) continue;
    const actions = [0, ...retained],
      value = ev.reduce(
        (a, v, i) => a + masses[i] * Math.max(...actions.map((k) => v[k])),
        0,
      ),
      loss = Math.max(0, full - value),
      candidate = { actions, loss, value };
    if (
      !best ||
      loss < best.loss - 1e-12 ||
      (Math.abs(loss - best.loss) < 1e-12 &&
        actions.length < best.actions.length)
    )
      best = candidate;
    if (
      loss <= lossTarget + 1e-12 &&
      (!within ||
        actions.length < within.actions.length ||
        (actions.length === within.actions.length && loss < within.loss))
    )
      within = candidate;
  }
  return { ...(within || best), targetReached: !!within, fullValue: full };
}
export function solveSized(s, eq, profile = null) {
  const g = validate(s),
    sizes = betAmounts(s),
    n = sizes.length,
    A = n + 1;
  if (
    !Array.isArray(eq) ||
    eq.length !== g.pairs.length ||
    eq.some((e) => !Number.isFinite(e) || e < 0 || e > 1)
  )
    throw Error("Invalid equity coverage");
  const utilities = g.pairs.map((p, k) =>
    sizes.map((size) => payoffs(eq[k], { ...s, stack: size })),
  );
  const values = (x, y) => {
    const hv = g.hero.map(() => Array(A).fill(0)),
      vv = g.villain.map(() => sizes.map(() => [0, 0]));
    g.pairs.forEach((p, k) => {
      const w = p.weight;
      hv[p.i][0] += w * utilities[k][0].check[0];
      for (let a = 0; a < n; a++) {
        const u = utilities[k][a],
          call = y[p.j][a];
        hv[p.i][a + 1] += w * ((1 - call) * u.fold[0] + call * u.call[0]);
        vv[p.j][a][0] += w * x[p.i][a + 1] * u.fold[1];
        vv[p.j][a][1] += w * x[p.i][a + 1] * u.call[1];
      }
    });
    return { hv, vv };
  };
  let baseline, calls;
  if (profile) {
    baseline = profile.baseline;
    calls = profile.calls;
    if (
      !profile.sized ||
      !Array.isArray(baseline) ||
      baseline.length !== g.hero.length ||
      baseline.some(
        (v) =>
          !Array.isArray(v) ||
          v.length !== A ||
          v.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
          Math.abs(v.reduce((a, b) => a + b, 0) - 1) > 1e-5,
      ) ||
      !Array.isArray(calls) ||
      calls.length !== g.villain.length ||
      calls.some(
        (v) =>
          !Array.isArray(v) ||
          v.length !== n ||
          v.some((x) => !Number.isFinite(x) || x < 0 || x > 1),
      )
    )
      throw Error("Invalid sized native profile");
    baseline = baseline.map(normalize);
  } else {
    const hr = g.hero.map(() => Array(A).fill(0)),
      vr = g.villain.map(() => sizes.map(() => [0, 0])),
      hs = g.hero.map(() => Array(A).fill(0)),
      vs = g.villain.map(() => Array(n).fill(0));
    for (let t = 0; t < s.iterations; t++) {
      const x = hr.map(normalize),
        y = vr.map((nodes) => nodes.map((r) => normalize(r)[1])),
        { hv, vv } = values(x, y);
      hr.forEach((r, i) => {
        const u = dot(hv[i], x[i]);
        r.forEach((_, a) => {
          r[a] += hv[i][a] - u;
          hs[i][a] += x[i][a];
        });
      });
      vr.forEach((nodes, j) =>
        nodes.forEach((r, a) => {
          const u = vv[j][a][0] * (1 - y[j][a]) + vv[j][a][1] * y[j][a];
          r[0] += vv[j][a][0] - u;
          r[1] += vv[j][a][1] - u;
          vs[j][a] += y[j][a];
        }),
      );
    }
    baseline = hs.map((r) => r.map((x) => x / s.iterations));
    calls = vs.map((r) => r.map((x) => x / s.iterations));
  }
  const nodeOverrides = s.sizing?.nodeOverrides || {};
  const model = calls.map((row, j) =>
    row.map(
      (v, a) =>
        nodeOverrides[g.villain[j].label + "@" + sizes[a]] ??
        s.overrides[g.villain[j].label] ??
        (s.tendency >= 0 ? v + (1 - v) * s.tendency : v * (1 + s.tendency)),
    ),
  );
  const { hv, vv } = values(baseline, calls);
  const gap =
    hv.reduce((sum, v, i) => sum + Math.max(...v) - dot(v, baseline[i]), 0) +
    vv.reduce(
      (sum, row, j) =>
        sum +
        row.reduce(
          (v, q, a) =>
            v +
            Math.max(...q) -
            (q[0] * (1 - calls[j][a]) + q[1] * calls[j][a]),
          0,
        ),
      0,
    );
  const masses = g.hero.map((_, i) =>
      g.pairs.filter((p) => p.i === i).reduce((a, p) => a + p.weight, 0),
    ),
    ev = values(baseline, model).hv.map((r, i) =>
      r.map((x) => (masses[i] ? x / masses[i] : 0)),
    );
  const selection = selectSizes(
    ev,
    masses,
    s.sizing?.maxSizes || n,
    s.sizing?.lossTarget || 0,
  );
  const adjusted = baseline.map((row, i) => {
    const retained = row.map((v, a) => (selection.actions.includes(a) ? v : 0)),
      sum = retained.reduce((a, b) => a + b, 0),
      base = retained.map((v, a) =>
        sum
          ? v / sum
          : selection.actions.includes(a)
            ? 1 / selection.actions.length
            : 0,
      ),
      best = Math.max(...selection.actions.map((a) => ev[i][a])),
      ties = selection.actions.filter((a) => best - ev[i][a] < 1e-10),
      tieMass = ties.reduce((v, a) => v + base[a], 0);
    return base.map(
      (v, a) =>
        v * (1 - s.deviation) +
        s.deviation *
          (ties.includes(a)
            ? tieMass
              ? base[a] / tieMass
              : 1 / ties.length
            : 0),
    );
  });
  return {
    schema: 1,
    sized: true,
    engine: profile?.engine || "Reference",
    nativeProfile: profile,
    scenario: structuredClone(s),
    eq,
    sizes,
    actions: [0, ...sizes],
    activeActions: selection.actions,
    selection,
    baseline,
    calls,
    model,
    ev,
    adjusted,
    gap: Math.max(0, gap),
    coverage: g.pairs.length * 990,
    ready: true,
  };
}
