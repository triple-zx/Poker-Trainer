# Implementation decisions and remaining acceptance work

Date: 2026-10-30. Requirements remain in `requirements.md`.

## Architecture and precise semantics

Installable Electron desktop application with a private local origin, isolated preload bridge and a bundled C++ solver. An optional local HTTP preview is for development. A Web Worker isolates validation and independent EV evaluation from interaction. A pure JavaScript regret-matching implementation remains an independent bounded-game reference. Source and diagnostics are reproducible. No GPU dependency.

### Full-hand mode

Hero OOP acts on every applicable street. Both players can check, bet, call, fold and raise within the configured per-street menus, including all-ins. The native tree has a limit of three raises after an initial bet. The converter derives contributions, call gaps, minimum raises, terminal states and street resets independently. Every configured size and every compatible chance child must exist; only rule-derived terminal children may be absent from the native export. Illegal private/public card collisions are excluded.

Best-response evaluation propagates counterfactual opponent reach, sums hidden hands before choosing an action, and conditions chance probabilities on both private hands. Initial-pot EVs sum to the initial pot. The zero-rake Nash gap is the sum of the two best-response values minus the initial pot. Hero decision EVs use optimal future continuation against the fixed opponent model. Impossible opponent-model histories display no model reach. Individual scores compare all offered actions, including sizes with zero target frequency. Full-hand frequency groups separate public action history, board, private hand, exact scenario and sampling target.

Animated training traverses only the saved tree, pauses on each hero decision and keeps opponent cards and EV feedback hidden until completion. Check-through hands still pause on turn and river. All-in runouts animate without requesting unavailable actions; folds do not reveal unused cards. Per-decision review and public-action replay are recorded in the journal. Large complete trees use IndexedDB and restore without recomputation. Portable full-hand solution packages contain only scenario settings and baseline policies; import reconstructs legal states, checks all configured branches, and recalculates every decision EV and the independent gap without running the native solver. Scenario-only exports still require precomputation.

Full-hand resource guards: four exact combos per player, one or two seed bet and raise percentages per street, pot >=4 bb, stack >=1 bb, SPR <=3, zero rake, 600,000 validated nodes and 256 MB native export. Deep can expand to four bet and three raise percentages per street, before legal all-ins; the same tree/export guards apply. Native solving has a 30-minute limit and up to four threads. Requested native accuracy corresponds to a 0.001 bb Nash gap, but the independently measured final gap determines the displayed precision status. A completed tree can be nonconverged. No global action-restriction or robustness bound is claimed.

Full-tree regression verifies native/independent gap agreement, all three streets with raises, rejection of missing legal branches, solution export/import round-trip equivalence, and 100 simulated hands using the re-imported solution. Package tests also reject missing river branches, altered size settings and invalid policy distributions, and prove that injected EV/gap/terminal-state fields cannot alter the independently reconstructed result. A two-bet-per-street 1v1 fixture produced 378,438 nodes and a 0.00005836 bb gap. The 3x3 default-range diagnostic at 500 iterations took 255.9 seconds with one thread and produced a 0.050765 bb gap; it did not meet precision. These measurements are different inputs and are not an efficiency comparison.

### Legacy bounded mode

Version 0.1 addresses a bounded scenario family, not arbitrary no-limit play. Hero is OOP at a fixed flop. Aggression is either an all-in or one of the configured/selected bet sizes. Checking commits both players to a check-down. A call commits both players to a check-down; folds are terminal. Thus all choices exposed during training have complete saved equity coverage; there are no unsolved turn/river actions disguised as ready.

Chance sampling: probability of a compatible private-hand pair is proportional to the product of its two configured weights. Overlaps are excluded and remaining pairs normalized jointly. Runouts are uniform without replacement conditional on both private hands. Exact equity enumeration averages all 990 unordered runouts. Training samples ordered turn/river cards; these induce the same equity distribution.

EV convention: measured from the current decision, with the existing pot sunk. Checking pays equity times the pot after rake. Called shove pays equity times the final pot after rake, minus the new contribution. Fold wins the current pot after rake. Ties receive half the pot. Rake is taken from all terminal pots, including folds, with a zero cap meaning zero rake.

Opponent model: baseline call probability c is mapped to c+(1-c)t for t>=0, and c(1+t) for t<0. Per-combination overrides take precedence. No adaptation occurs after fixing this model. Deviation d blends baseline hero behavior with an exact best response, (1-d)baseline+d response. This has no certified robustness bound. Equally valued actions retain baseline mixing.

Reference precision: configurable 10k/50k/100k regret iterations. Native budget capped at 10k iterations and 0.001% requested accuracy. Measured final gap, not iteration count or native success exit, is the quality diagnostic. With rake the sum of unilateral incentives is a diagnostic at the returned profile, without a zero-sum convergence guarantee. Arithmetic is floating point; there is no card sampling error. Action restriction loss is unknown.

Resource bound: 12 exact combinations per player, at most 144 equity entries / 142,560 evaluated runouts. Result matrix memory below 1 MB excludes browser, evaluator temporaries, native lookup tables and process overhead. This is a deliberate capacity limit, not an 8 GB hardware benchmark.

## Current acceptance status

- Implemented: fixed flop and weighted exact-combo inputs, strict validation; pot/stack/rake for reference engine; OOP/IP bounded positions.
- Implemented: calling tendency and per-combo edits, inspectable baseline/model calls, deviation blending and action EVs.
- Implemented: complete runout coverage for the bounded game; post-hand feedback, hidden cards during normal play, local journal, bookmarks and mistake filtering.
- Implemented: local storage, scenario and full-hand solution export/import without journal leakage, English/Chinese primary interface. Portable solution format schema 2 has a 128 MiB file limit and the same 600,000-node coverage guard; schema 1 scenario files remain supported at 1 MB. Failed/cancelled imports do not replace the current scenario.
- Implemented: equity checkpoints by completed pair. Native computation can be canceled but restarts its baseline stage; no native iteration checkpoint claim.
- Implemented: native build, runnable C++ adapter, numerical cross-check on a synthetic fixture. Six differential fixtures passed, including fractional fast sizes and deep midpoint sizes; measured Windows runtimes are in docs/benchmarks/native.json. Larger-tree performance is still unmeasured.
- Implemented: finite fast/deep size search in bounded and full-hand modes, separate full-hand bet/raise caps, and fixed-model best-response simplification loss with explicit unmet-target reporting; per-combo/per-bet call locks in bounded mode. Full-hand menus are selected at each hero public decision, and their complete restricted-continuation EV is evaluated against the same fixed opponent. This is a heuristic search over menu combinations, not a certified global menu optimum or an equilibrium simplification loss. Pending: arbitrary node locks, hand-category tendency controls, preflop tendencies beyond manually edited ranges.
- Implemented: multiple saved scenarios in a local library, three-stage completed-hand replay, targeted exact-combo/category/draw sampling with explicit distribution labeling, and frequency calibration separated by full configuration, private hand and sampling mode.
- Implemented: joint-weighted made-hand/draw composition, combo and range equity, and weighted card-removal overview. Pending: turn/river and multi-flop aggregation.
- Pending: public preflop material acquisition and source/license review; no acquired GTO library claimed. Current fixture is synthetic and original.
- Implemented: native Windows/macOS packages, packaged startup/native-solve checks, and native macOS evaluator/differential verification. Pending: independently computed preflop solutions; representative 8 GB Windows/macOS performance measurements.

## Validation

Automated suite covers card/range rejection, hand-class ordering, wheel handling, equity symmetry, rake/tie accounting, solvable pure-strategy games, equivalent actions, blend endpoints, weighted collision-free sampling, package validation, HTTP confinement, and native command/result validation.

Full-hand sizing tests independently evaluate the frozen menus, verify a shared menu across private hands, check separate bet/raise caps and unmet-target reporting, and round-trip the selected strategy through a portable package. `node native/verify-sizing.mjs` runs a real C++ deep-candidate fixture with all-street raises, retained/alternative choices, import equivalence and 100 simulated hands. Run locally by default; GitHub workflows remain manual-only.

The recorded two-combo-vs-one deep fixture has 229,446 nodes. Its 500-iteration native solve took 228.9 seconds on this Windows machine and ended at a 0.010176 bb baseline gap (not converged to the 0.001 bb target). One retained bet/raise per hero decision lost 0.00004004 bb versus all candidates against the same fixed opponent, meeting its separate 0.01 bb simplification target. This is a measured fixture, not a hardware-wide performance guarantee; see `benchmarks/full-sizing.json`.

Manual browser checks: compute default scenario, train a hand with hidden opponent cards, finish and inspect EV feedback, bookmark journal record, switch language, reload saved solution. Native integration, library save/load, and targeted sampling were verified in the browser. Exhaustive five-card evaluation matched all category counts over 2,598,960 deals.

## Next engineering stages

First strengthen native differential fixtures and measure runtime/memory across equivalent configurations. Then generalize the native tree export contract, preserving per-node EVs and legal-card coverage. Only mark a general training package ready after validating every offered continuation. Add sizing/model features against that contract; retain the bounded engine as a regression oracle.

## Sizing contract

Candidates are capped at stack and rounded to 0.001 bb; deep inserts adjacent midpoints. Search is finite (at most nine bets). Exhaustive subset selection measures range-weighted best-response loss versus the complete evaluated candidate set and the same fixed opponent model. No global sizing bound or restricted-tree equilibrium claim is made. Baseline is the candidate-tree solution; retained hero frequencies are renormalized before deviation blending. Numerical convergence (0.001 bb displayed target), candidate simplification loss, and unknown loss versus untested legal sizes are distinct. Native amounts are scaled by 1000 to avoid whole-chip truncation; automatic all-in substitution is disabled, and returned sizes must match exactly.

## Analysis and review semantics

Equity and composition use private-hand marginal probabilities from the compatible joint deal distribution. Blocker percentage is the opposing configured weight removed by the selected private hand before renormalization; it is descriptive card removal, not an EV causal attribution. Straight and flush patterns use the five known cards; raw straight outs are not corrected for hidden cards and do not imply winning outs. Hands without compatible deals show no equity. Targeting conditions the same weighted pair distribution on the chosen group. Mixed-frequency statistics group the exact scenario configuration, private hand, action amounts, and sampling target separately; target probabilities are averaged over recorded decisions. Individual action scores remain EV loss. Replay steps through flop, decision, and terminal reveal; folds do not reveal unused runout cards in newly recorded hands.
