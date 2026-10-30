# Implementation decisions and remaining acceptance work

Date: 2026-10-30. Requirements remain in `requirements.md`.

## Architecture and precise semantics

Local Node server plus dependency-free browser application. A Web Worker isolates exact equity enumeration from interaction. Native C++ baseline runs in a separate process; a pure JavaScript regret-matching implementation provides an independent bounded-game reference. Source and diagnostics are reproducible. No GPU dependency.

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
- Implemented: local storage, scenario export/import without journal leakage, English/Chinese primary interface.
- Implemented: equity checkpoints by completed pair. Native computation can be canceled but restarts its baseline stage; no native iteration checkpoint claim.
- Implemented: native build, runnable C++ adapter, numerical cross-check on a synthetic fixture. Six differential fixtures passed, including fractional fast sizes and deep midpoint sizes; measured Windows runtimes are in docs/benchmarks/native.json. Larger-tree performance is still unmeasured.
- Implemented: finite fast/deep size search, size cap and fixed-model best-response simplification loss, including explicit unmet-target reporting; per-combo/per-bet call locks. Pending: generic multi-street trees, arbitrary node locks, hand-category tendency controls, preflop tendencies beyond manually edited ranges.
- Implemented: multiple saved scenarios in a local library, three-stage completed-hand replay, targeted exact-combo/category/draw sampling with explicit distribution labeling, and frequency calibration separated by full configuration, private hand and sampling mode.
- Implemented: joint-weighted made-hand/draw composition, combo and range equity, and weighted card-removal overview. Pending: turn/river and multi-flop aggregation.
- Pending: public preflop material acquisition and source/license review; no acquired GTO library claimed. Current fixture is synthetic and original.
- Pending: independently computed preflop solutions; representative 8 GB Windows/macOS performance measurements and native macOS verification.

## Validation

Automated suite covers card/range rejection, hand-class ordering, wheel handling, equity symmetry, rake/tie accounting, solvable pure-strategy games, equivalent actions, blend endpoints, weighted collision-free sampling, package validation, HTTP confinement, and native command/result validation.

Manual browser checks: compute default scenario, train a hand with hidden opponent cards, finish and inspect EV feedback, bookmark journal record, switch language, reload saved solution. Native integration, library save/load, and targeted sampling were verified in the browser. Exhaustive five-card evaluation matched all category counts over 2,598,960 deals.

## Next engineering stages

First strengthen native differential fixtures and measure runtime/memory across equivalent configurations. Then generalize the native tree export contract, preserving per-node EVs and legal-card coverage. Only mark a general training package ready after validating every offered continuation. Add sizing/model features against that contract; retain the bounded engine as a regression oracle.

## Sizing contract

Candidates are capped at stack and rounded to 0.001 bb; deep inserts adjacent midpoints. Search is finite (at most nine bets). Exhaustive subset selection measures range-weighted best-response loss versus the complete evaluated candidate set and the same fixed opponent model. No global sizing bound or restricted-tree equilibrium claim is made. Baseline is the candidate-tree solution; retained hero frequencies are renormalized before deviation blending. Numerical convergence (0.001 bb displayed target), candidate simplification loss, and unknown loss versus untested legal sizes are distinct. Native amounts are scaled by 1000 to avoid whole-chip truncation; automatic all-in substitution is disabled, and returned sizes must match exactly.

## Analysis and review semantics

Equity and composition use private-hand marginal probabilities from the compatible joint deal distribution. Blocker percentage is the opposing configured weight removed by the selected private hand before renormalization; it is descriptive card removal, not an EV causal attribution. Straight and flush patterns use the five known cards; raw straight outs are not corrected for hidden cards and do not imply winning outs. Hands without compatible deals show no equity. Targeting conditions the same weighted pair distribution on the chosen group. Mixed-frequency statistics group the exact scenario configuration, private hand, action amounts, and sampling target separately; target probabilities are averaged over recorded decisions. Individual action scores remain EV loss. Replay steps through flop, decision, and terminal reveal; folds do not reveal unused runout cards in newly recorded hands.
