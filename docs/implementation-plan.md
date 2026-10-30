# Implementation plan and acceptance

The design phase is complete enough to start M0. This is a dependency-ordered plan,
not a claim of implemented milestones or a promised calendar schedule.

## M0 — engine and domain feasibility (next)

Deliver a headless native spike before a large UI scaffold.

- Pin build tools and the selected engine revision; create a minimal worker and strict
  runtime decoders for the approved v1 subset. Generate Rust/TypeScript bindings from
  a single declared contract source; prohibit hand-edited generated files.
- Implement domain cards, weighted ranges, ledger/actions, and terminal rake cases.
- Reproduce a small river and turn solve; expose explicit units, action ordering,
  baseline values, fixed-opponent values, and response diagnostics.
- Prove the adapter's full-opponent lock behavior and suit-symmetry handling using
  tiny enumerated games. Document zero-reach policy and value behavior.
- Implement and test genuine optimization checkpoints; retain full optimizer state.
- Export a small full-depth portable solution and read it independently of the engine.
- Measure peak memory including export, numerical drift, and checkpoint overhead.

Exit: all blocking gates in solver-evaluation.md have evidence or a documented engine
change. A fake adapter may drive tests but must not satisfy this exit. If durable resume,
arbitrary suit locks, or declared rake behavior fail, resolve or explicitly return that
product limitation to the user rather than marking M0 complete.

## M1 — saved study scenario

- Introduce desktop host, React views, English/Chinese resources, SQLite migrations,
  immutable scenario revisions, and bounded solution reader.
- Add range editor/import with full provenance and concrete weighted-combo display.
- Add baseline solve, job progress, memory preflight, pause/resume, cancellation, and
  complete export/verification. No hidden background solve when browsing results.
- Display ranges, equity, policy frequencies, and Q values with defined/undefined status.
- Find actual public/usable preflop data; label simplified or incomplete data correctly.

Exit: save, reopen, import/export, and inspect the same scenario on target platforms;
old data remains readable after a tested schema migration.

## M2 — first usable fixed-flop trainer

- Add deterministic tendency compiler, exact overrides, inspection, and fixed-opponent
  response with baseline comparison. Include preflop range modification where presets
  are used; this is not a full preflop solve.
- Add bounded fast candidate sizing and final-tree reevaluation; show the reference
  used, searched scope, and estimated or bounded simplification loss.
- Prepare alpha profiles and complete runout/action data before starting a session.
- Implement exact compatible dealing, natural/targeted sampling, and session replay.
- Offer precomputed sizes only; hide answers until hand review. Record EV feedback,
  bookmarks, mistakes, and basic grouped statistics.
- Implement resource-aware training admission and indexed read/prefetch so practice
  can continue on an 8 GB machine without loading the full solver tree.

Exit: the user's core workflow runs end-to-end using real computed data, on Windows
and macOS, with a declared supported scenario envelope. Reference hand B-F1 from
validation.md is a benchmark target, not a substitute for platform measurement.
Every retained training branch reaches a supported terminal. No placeholder strategy
or root-only export may be presented as a complete training solution.

## M3 — research depth and aggregation

- Deep finite-lattice size refinement; both size-count and loss-threshold controls.
- More node-specific sizing overrides and explicit comparison of seat-specific losses.
- Same-flop runout reports and cross-flop aggregated reports with explicit weighting.
- Batch scheduling, task-level reuse, and export of research data.
- Expand candidate search and supported scenario complexity using benchmark evidence.

Exit: verify aggregate sums against enumerated small cases; report coverage and
uncertainty; compare final simplified strategy to its richer common reference.

## M4 — preflop computation and measured engine optimization

- Broaden heads-up and 6-max presets/import coverage first.
- Treat heads-up preflop solving and six-player preflop solving as separate projects.
  The two-player postflop API does not claim to solve a six-player game.
- Establish action abstraction, rake/payoff assumptions, compute envelope, quality
  metrics, and full-game consistency before exposing computed preflop answers.
- Profile and optimize existing solver paths, measuring time, memory, and correctness
  against the same fixed workloads. Consider GPU or new algorithms only after evidence.

Exit for each capability: reproducible correctness/quality reports and explicit local
resource limits. Import/presets remain available if full 6-max is impractical locally.

## Requirement coverage

| Requirement group | Owning milestone | Validation |
| --- | --- | --- |
| Local Windows/macOS, English/Chinese | M1/M2 | Install/open/save/import; platform UI checks |
| 8 GB usability | M0/M2 | Process and read-cache budget; measured imported-session latency |
| Full fixed-flop training flow | M2 | Legal cards/actions, no solver spawn during practice, complete review |
| Editable opponent and adjustable deviations | M0/M2 | Exact small-game response; inspectable policy; alpha Q reevaluation |
| Fast automatic sizing | M2 | Common reference and final-tree comparison |
| Deep sizing and loss control | M3 | Search coverage, resource limits, estimated vs certified distinction |
| Multi-flop/runout reports | M3 | Weighted aggregate golden cases |
| Built-in/imported preflop ranges | M1 onward | Provenance, metadata, weights, supported formats |
| Heads-up and 6-max preflop solving | M4, separate gates | Independent definitions and feasibility reports |
| Ongoing AI maintenance | Every milestone | Contracts, meaningful tests, current handoff, reproducible build |

## Development workflow

Use a focused branch and PR per milestone-sized slice. PR descriptions state the user
behavior changed, relevant contract changes, checks run, and remaining limitations.
Update docs/handoff.md with the next concrete task and any unresolved findings.

Core Rust tests, adapter conformance, frontend tests, and platform packaging checks
join CI when their corresponding code exists. Keep unit/contract tests fast; expensive
benchmarks are explicit runs with stored machine metadata. No auto-merge or scheduled
maintenance tasks. Do not introduce architecture abstractions before a real owner/use
case exists; use the module table to prevent coupling, not to create empty projects.
