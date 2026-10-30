# Verification and performance plan

## Executed in the design phase

The dependency-free Node suite checks selected contracts: combo indexing, weighted
card removal, pot-fraction raise meaning, tendency mass conservation, policy mixing,
undefined values, computation identity, lifecycle transitions, and training readiness.
It also contains a counterexample to linear interpolation of strategy EV.

The design checker validates relative Markdown file links and parses the contract
TypeScript syntax. This is NOT a TypeScript type check. Native solver, UI, platform
installer, SQLite, binary-format verifier, and engine checkpoint tests are not yet
implemented or run. CI configuration covers Node checks on Windows/macOS/Linux; a
configuration file does not establish that those remote jobs have passed.

## Correctness layers to implement

| Layer | High-value checks |
| --- | --- |
| Domain | All card IDs/combos, range parsing, pot ledger conservation, raise reopening, uncalled returns, ties and rake cap/rounding |
| Hidden information | No sampled opponent hand in policy evaluation, conditional compatible weights, correct public/runout probability |
| Solver adapter | Known small games, full frozen-opponent locks, Q ordering/units, per-hand reach, zero reach, asymmetric-suit locks |
| Optimizer state | N iterations uninterrupted versus K + save/restart + N-K; preserve averaging/discount schedule and compression scales |
| Result export | Compare exported policy/Q with native data across sampled and exhaustive tiny trees; all legal exported transitions reachable |
| Readiness verifier | Truncated river, missing action, malformed probability, wrong suit map, swapped profile, invalid hash/offset, counterfactual branch |
| Storage | Interrupted writes, duplicate jobs, migration rollback/read-old, bounded unpack, stale session sequence, crash recovery |
| Training | Natural versus targeted sampling, legal cards, deterministic versioned replay, no solver invocation, post-hand disclosure |
| Sizing | Same comparison distribution, no opponent-action restriction masquerading as hero gain, nonadditive local-loss counterexample |
| Aggregation | Weight/multiplicity sums, sampled versus exhaustive coverage, overlapping draw labels, conditional versus public ranges |
| UI | Accessible matrix navigation, English default/Chinese parity, invalid inputs, pending jobs, cancellation, review with undefined values |

Use an independent tiny evaluator/enumerator as an oracle, not a second wrapper around
the same solver. For a fixed hidden-information game, aggregate private opponent hands
before maximizing a hero information-set action. Use exact rational values where the
test size permits. For ordinary two-player no-rake games, add Kuhn/Leduc and simple
river examples. They validate algorithms, not the accuracy of arbitrary full Hold'em.

## Numeric and quality defaults (proposed, not benchmark results)

- Validate float64 policy rows to 1e-9 in contract reference fixtures. Production
  float32 exports allow a documented tolerance up to 1e-6 before explicit, logged
  normalization; larger errors fail. Compact policies require a separately measured
  quantization budget and cannot silently reuse float32 limits.
- Record NashConv = sum_i [u_i(BR_i,sigma_-i)-u_i(sigma)] in root ticks when unrestricted
  deviation evaluation is available. Many engines report half this quantity; adapter
  conversion must be tested. Locked-tree diagnostics are not unrestricted NashConv.
- Provisional no-rake fixed-tree target: preview NashConv <=1% root pot, standard
  <=0.2%, precise <=0.05%. These are user-adjustable engineering starting points, not
  guaranteed runtimes or continuous-game error bounds.
- Raked games need independently evaluated unilateral-deviation gains and clear
  convergence status. Do not claim zero-sum CFR convergence from a similar API name.
- Fixed-opponent response records its own response-gap metric. Fully enumerated exact
  best response has only numerical evaluation error; an approximate response needs
  a measured/certified gap or an explicit unknown status.
- A small root metric does not bound every conditional low-reach action Q. Mark
  poorly supported values and avoid high-confidence grading below evaluation precision.
- Size-loss threshold success requires a valid bound or an explicit estimate label.
  Store search limits and reference identity even when the target is not met.

## Representative benchmark fixtures

All ranges below are intentionally synthetic engineering inputs, not recommended GTO
preflop ranges. Standard ranges can be added only with provenance and scenario metadata.
Use seed 20261030 for randomized test enumeration and record the RNG algorithm/version.

| ID | Setup | Purpose |
| --- | --- | --- |
| B-R1 | River 2s3h4d6c7c; OOP AsAh,QsQh; IP KsKh; pot 20bb, stack 10bb; check/all-in | Tiny frozen-opponent and payoff oracle |
| B-T1 | Turn Td9d6hQc; OOP QQ+,AKs; IP JJ,TT,AQs; pot 20bb, stack 40bb; 50% bet, pot raise, all-in | Checkpoints, river coverage, shape/EV conversion |
| B-F1 | Flop Qs7d2c; OOP 22+,A2s+,K9s+,QTs+,JTs,ATo+,KQo; IP 22+,A2s+,K2s+,Q8s+,J8s+,T8s+,98s,87s,A9o+,KTo+,QTo+; pot 5.5bb, stack 97.5bb | Fixed-flop integration and memory envelope |
| B-F2 | Same root with 500 bps rake / 3bb cap | Rake semantics and changed convergence metric |
| B-S1 | B-F1 with explicit suit-asymmetric ranges and a suit-specific lock | Invalid-isomorphism detection |
| B-M1 | B-F1 with increasing candidate counts and progressively constrained memory | Preflight estimate, peak RSS, graceful resource refusal |

For F1/F2 begin with one bet/raise template and all-in. Record exact sizes, max raises,
legalization and all-in thresholds, realized node count, combo count, and precision.
Then compare richer templates. Keep a frozen serialized input for every published run.

## Report fields and provisional UX targets

Every report includes CPU, RAM, OS/architecture, engine/build/patch IDs, thread count,
compiler flags, input hash, compression, node count, phase times, peak process RSS,
disk footprint, quality metric/definition, stop reason, and checkpoint/export costs.
Separate cold preparation from cached lookup and repeated training. Report repeated
measurements, not only the best run. Record hardware-controlled results outside unit CI.

Targets to measure on an 8 GB target machine: no solver process during saved training;
p95 warm action feedback <100 ms; p95 cold node read <500 ms; responsive job progress
and cancellation. These are proposed acceptance budgets to validate, not observed facts.
Complex preparation may take 5–30 minutes or exceed the practical envelope; communicate
the measured envelope instead of silently sacrificing coverage. Batch work may run
overnight but must retain resumable progress.

## Cross-platform checks

Use native core tests and packaged-app smoke tests on Windows x64 and both Mac targets.
Browser component tests help with UI logic but do not replace native WebView/file/dialog
checks. Verify Tauri's current platform-specific end-to-end tooling before choosing the
driver; do not assume one desktop WebDriver works identically on every platform.
Signing/notarization requires actual release credentials and is not tested in this phase.
