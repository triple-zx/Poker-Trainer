# Poker Trainer

A local postflop training and research app. English and Chinese interface. No account, cloud database, telemetry, or GPU required.

Published installers are at [v0.3.0](https://github.com/triple-zx/Poker-Trainer/releases/tag/v0.3.0). The main branch additionally contains portable full-hand solutions, automatic full-hand sizing, opponent tendencies and detailed edits, in-position play, conditional range analysis, saved-flop comparisons, range editing and resumable native solving for the next release; use the developer setup below to run those changes now.

## Desktop application

The product is an installable Windows/macOS desktop app with its own window, bundled runtime and local C++ engine. It does not require a browser tab or local web server. Desktop packages are produced by the Desktop packages workflow after startup checks; builds are currently unsigned. GitHub workflows are manual-only to conserve Actions minutes: pushes, pull requests and tags do not start jobs. Run checks locally by default; deliberately dispatch a workflow only when a remote platform check is needed.

Developer setup (Node.js 22.12+ and native build prerequisites):

~~~sh
npm ci
node node_modules/electron/install.js
node native/setup.mjs
npm run desktop:prepare
npm start
~~~

Create installers with `npm run desktop:dist`. Windows outputs an installer and portable executable; macOS outputs a DMG and ZIP. The package includes the native engine's source archive, patch, build recipe and license. The direct evaluator does not need the large hand dictionary at runtime.

The optional browser preview is a development tool: `npm run preview`. App data uses a stable private app origin in the desktop profile, separate from browser-preview storage. Export/import scenarios when moving between those profiles.

## Full-hand desktop training

Full-hand mode precomputes flop, turn and river betting, calls, folds and raises. Choose one or two bet percentages and raise percentages for each street; legal all-ins are included. Training offers every evaluated size, including suboptimal choices. An animated action history explains how the hand reached each decision. Opponent cards and per-decision EV comparisons appear after the hand ends. Completed hands can be replayed and bookmarked.

The full tree is independently checked for legal transitions, configured actions, compatible chance cards and complete private-combination strategies. Best responses aggregate the hidden opponent range before maximizing. Analysis can navigate the saved tree and compare baseline, modeled and adjusted policies. Complete solutions use IndexedDB; scenarios and the journal remain local. The desktop app and optional browser preview use separate profiles.

Use **Export solved scenario** after precomputation to share a complete full-hand solution. **Import package** validates every branch and strategy and independently recalculates feedback without running the C++ solver. The imported solution can be trained immediately and is saved locally. Exports include game settings and baseline strategies, but exclude personal training records and cached EVs. Packages containing in-position play or detailed opponent edits use schema 3; packages with full-hand bluff/raise/hand-class tendencies use schema 4. Older readers reject unsupported versions instead of silently dropping settings. Legacy formats 1–3 remain readable. Solution packages are limited to 128 MiB; scenario-only files remain limited to 1 MB and require precomputation. Import/export work runs in a background worker and can be cancelled with Pause. A failed or cancelled import preserves the previous scenario.

In **Configure → Opponent tendencies**, adjust high-card bluff aggression and made-hand raising, or expand **Adjust by hand class** to override calling, betting and raising on every street. −1 removes the action group, 0 preserves its current mass and +1 always chooses it when legal; intermediate values move proportionally toward the endpoint. High-card hands (including draws) are a limited bluff proxy, not an equity classification. Hand class includes the public board. Aggression is applied first, then calling; exact-combination call probabilities override calling tendencies. Each adjustment preserves relative probabilities within a group and its complement; a zero-mass group is split uniformly when it gains mass. Later adjustments can change an earlier group's total. Inspect the resulting probabilities in Analysis. These are explicit modeling assumptions, not facts about an actual opponent.

In **Analysis → Explore the saved tree**, navigate to an opponent decision, select a private combination, and enter percentages for every action. Detailed edits support flop, turn and river bets and raises. They replace the full distribution only at that exact board/history/combination; unspecified decisions retain the tendency model. Apply recalculates all feedback and sizing menus from the saved baseline without another C++ solve. Reset one combination there, or clear all node edits in Configure. Edits are included in scenario and solution exports. Up to 64 decisions and 50 KB of edits are supported; changing the tree requires explicitly clearing incompatible edits. Precompute also reuses the current baseline for model, deviation or menu-limit changes when tree settings and iteration budget match.

Choose **Your postflop position** in Configure: out of position acts first on every street; in position follows the opponent. The choice applies to ranges, native solving, analysis, training and saved packages. Changing position requires a new baseline and clearing any incompatible detailed opponent edits. Legacy bounded drills remain out of position.

At any saved-tree node, expand **Ranges at this decision** to inspect both conditional ranges, exact-combination and range equity, made hands, draws, action frequencies, card removal and weighted 13×13 matrices. Compare the baseline for both players with your adjusted strategy against the fixed opponent. Weights follow both players' earlier actions and the exact board; a zero-probability history has no conditional range. Public-card conflicts remain visible with zero weight. Equity averages legal runouts before future betting and is distinct from decision EV. **History to this decision** lists the preceding actions and cards. These reports reuse the saved solution without running the native solver.

At a turn or river deal in the explorer, expand **Compare every next card**. The report covers every legal next card at that exact history, showing conditional card probabilities, both ranges' equity, the next street's opening action frequencies and probability-weighted totals. Sort by card, hero equity or betting frequency; inspect a card to continue into its saved decision. Expand the hand-strength report for made-hand and draw distributions. The comparison and range panels share the selected baseline or adjusted/model profile. Card removal means cards are not necessarily equally likely. Zero-probability cards have no conditional equity/strategy, and a zero-probability history has no averages. This is one history's complete next-card distribution, not an average over different betting histories or multiple flops. No new native solve is needed.

Choose **Practice this decision** at any hero decision to run a single-decision drill, including turn/river bets and raises. Earlier actions and cards animate first, with opponent cards hidden. The drill samples the conditional range under the selected range-analysis profile (adjusted hero/fixed opponent by default; baseline can be selected in the range panel). It scores your one choice against the fixed opponent and ends immediately, without playing a continuation or claiming a showdown result. All evaluated sizes remain available. Repeat the same decision with a new sampled hand, or use **Deal a hand** for normal full-hand play. Histories with zero probability or missing fixed-opponent feedback are rejected. Drill records include the public path and sampling profile; journal and frequency comparisons distinguish them from complete hands.

Current full-hand limits: twelve exact combinations per player, zero rake, pot at least 4 bb, effective stack from 1 bb to three times the pot, at most three raises after the initial bet on a street. Native precomputation uses up to four CPU threads and a 30-minute timeout; tree exports are capped at 256 MB and validated trees at 600,000 nodes and 2,400,000 baseline probabilities. Larger ranges may require fewer candidate sizes or shorter stacks; setup reports both capacities before solving, and imports enforce both limits. These are capacity guards, not a measured 8 GB hardware guarantee. The displayed independent gap can remain above target after the iteration budget; coverage completion does not imply convergence. No claim is made about untested sizes.

**Before solving** updates the full-tree count as settings change and rejects trees above 600,000 nodes before starting the native engine. It counts all configured continuations and compatible public boards, including the finite Deep expansion; smaller retained-menu limits do not reduce this baseline cost. Reduce candidate sizes or effective stack, use Fast, or import a smaller solved scenario. The displayed compact baseline-probability payload is only one part of memory use. Total peak RAM and runtime are not yet predicted, and passing this check does not guarantee that a solve fits an 8 GB computer.

Full-hand sizing offers **Fast** selection from the configured candidates and **Deep** expansion with finite midpoint and geometric candidates. Set separate maximum retained bet/raise sizes and a target whole-hand EV loss. All-in counts toward the limits. The selected menus may differ at every hero decision, including later-street raises. Every evaluated action remains available during training, including alternatives outside the retained menu; review identifies them afterward.

The app compares best-response EV with all candidates against the complete retained menus, using the same fixed opponent model. It tries smaller limits first and reports when the requested loss target is not met. Menu selection is a heuristic across public nodes, not a guarantee of globally optimal menus. Fixed-tree convergence, measured fixed-opponent simplification loss, and unknown loss versus untested sizes are separate. The deviation blend is projected onto retained menus; training EV scores still compare every candidate with unrestricted future continuation. Deep can exceed the tree/resource guards; it never silently drops requested branches. More general opponent edits, preflop libraries/solving and broad aggregation remain ongoing work. See [acceptance status](docs/implementation.md).

In **Analysis → Compare saved flops**, select two or more complete solutions saved to your local library. Compare baseline or adjusted opening frequencies, both ranges' equity and hand strength, and best-response EV against each configured fixed opponent. Use equal weights or positive custom relative weights. These are weights for the selected sample, not deal probabilities or exhaustive flop coverage. Different ranges, positions, pot/stack, sizing settings or opponent assumptions stay in separate groups, with their settings and convergence status visible. Duplicate flops within one compatible group, missing solutions and stale library settings are rejected. The report loads one tree at a time in a background worker and can be cancelled; it needs no new solve and does not replace the active scenario. Best-response EV is separate from the selected mixed strategy's payoff.

## Preflop range library

Open **Ranges** to construct, paste, edit and save up to all 1,326 starting combinations. The 13×13 matrix shows mean inclusion weight for each hand class; select a cell to set the entire class or edit individual suits. Text supports `QQ+`, `A5s-A2s:0.5`, `ATo+`, `T9s-54s` and `AhKh:25%`. `AK` includes suited and offsuit combinations. Unmarked weights are 0–1; zero excludes a combination. Overlapping entries fail instead of adding or overwriting weights. Raw numeric vectors, bracket-weight syntax and proprietary binary files are unsupported.

Import text or a range JSON file (up to 1 MiB), and keep source, usage terms, HU/6-max positions, starting stack, preflop history, sizes, rake and antes with the range. Export a range package to preserve those notes and the original weights; a combination-text export contains weights only. Local storage holds up to 100 named ranges, subject to its storage quota. Source claims are unverified. The four bundled construction templates describe hand families, not recommended positional strategies or solved GTO charts. Verified public chart acquisition and independent preflop solving remain pending; see [source review](docs/preflop-sources.md).

**Use this range in postflop training** removes only flop-blocked combinations, retains the remaining weights and records the source in Configure. It does not alter the configured stack, pot, position or rake. Applying still requires the current solver limits: twelve unblocked exact combos per player for full hands, twelve for bounded drills. Oversized ranges are rejected, never sampled automatically; edit an explicit study subset if desired. Applying a range invalidates the current solution and clears detailed opponent edits; applying an opponent range also clears combination call overrides. Manual edits to the applied range or flop remove the now-stale source association. Scenarios/solutions with provenance export as schema 5; older readers reject them. Formats 1–4 remain readable. Full-sized range storage does not claim full-sized postflop solving capacity.

## Legacy bounded flop laboratory

Set a fixed flop, exact weighted ranges (up to 12 combinations each), pot, effective stack, and opponent calling tendencies. Precompute, then practice repeated hands. Inspect baseline versus modeled play, action EVs, both range matrices, weighted equities, draw composition, card removal, bookmarks, and the decision journal. Practice selected combinations, made hands or draws, replay completed hands, and compare repeated action frequencies with their targets. The journal and latest solution stay in this browser's local storage. Export scenarios for portable backups; exports exclude personal training history. Imported equity data is recomputed before use.

The supported game is deliberately restricted: hero acts first and chooses **check down to showdown** or **bet a precomputed size**; the opponent chooses **call/fold** facing a bet. There is no subsequent betting. Every compatible hand pair and all 990 legal unordered turn–river runouts per pair are enumerated. The action restriction is explicit, and its loss relative to full no-limit Hold'em is unknown.

The browser reference engine supports a stated rake convention (percentage of terminal pot, capped, including folds). The optional **TexasSolver C++ engine** supports zero rake. See [native setup and validation](native/README.md). Every native baseline is evaluated independently using exact runouts, and its measured deviation incentive is shown.

This is an engineering milestone, **not completion of the entire requirements baseline**. See [implementation and acceptance status](docs/implementation.md) and the unchanged [requirements](docs/requirements.md).

## Use the bounded drill

1. Configure the flop and exact ranges, e.g. `AhKh:1,QhQd:0.5`.
2. Set calling tendency: 0 preserves baseline, +1 always calls, −1 always folds. JSON overrides such as `{"AcQc":0.8}` take precedence for that combination.
3. Choose all-in only, fast candidate sizing, or deep finite midpoint search. Set the maximum retained sizes and target simplification loss. Optional node overrides such as `{"AcQc@3.3":0.8}` apply only when facing that bet.
4. Precompute. The updated desktop engine saves native iteration checkpoints every 100 iterations. **Pause** finishes the current iteration, saves it and releases the solver process; **Resume checkpoint** continues from that state. **Restore saved solver job** recovers its settings after reopening the app. Starting a new computation replaces the single saved native job. Completed native work can be reloaded without repeating iterations; subsequent decision evaluation restarts if interrupted. The optional browser preview and older engines still stop/restart their native baseline. Reference equity enumeration saves completed hand pairs.
5. Train. Opponent cards and action values appear after the decision. Scores use expected-value loss, not the luck of the sampled outcome.
6. Review and bookmark hands. Export a scenario before clearing browser storage.

Fast/deep sizing measures best-response EV loss against the same fixed opponent model, compared with the evaluated candidate set. It chooses the smallest allowed subset meeting the loss target, or reports an unmet target. This does not measure loss versus every legal size or recompute equilibrium after pruning. Candidate bets use a 0.001 bb grid; deep adds midpoints. Both modes remain a single betting decision with a check-down after calls.

## Development

- `app/engine.js`: pure poker evaluation, probability, reference solve, model response, and sampling.
- `app/worker.js`: background enumeration with hand-pair checkpoints.
- `app/app.js`: local application state and UI.
- `native/adapter.mjs`: validated command generation, bounded subprocess execution, native result checks.
- `native/texassolver.patch`: source changes against a pinned upstream revision; upstream license included.
- `server.mjs`: loopback-only static server and same-origin native solve endpoint.
- `tests/`: domain, import, native adapter, and HTTP tests.

Do not change the sampling distribution, rake convention, tree coverage, or result provenance silently. Keep native numerical cross-checks when optimizing. See the implementation document for open acceptance gaps.
