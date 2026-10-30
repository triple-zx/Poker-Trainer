# Poker Trainer

A local postflop training and research app. English and Chinese interface. No account, cloud database, telemetry, or GPU required.

Published installers are at [v0.3.0](https://github.com/triple-zx/Poker-Trainer/releases/tag/v0.3.0). The main branch additionally contains portable full-hand solutions and automatic full-hand sizing for the next release; use the developer setup below to run those changes now.

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

Use **Export solved scenario** after precomputation to share a complete full-hand solution. **Import package** validates every branch and strategy and independently recalculates feedback without running the C++ solver. The imported solution can be trained immediately and is saved locally. Exports include game settings and baseline strategies, but exclude personal training records and cached EVs. Solution packages are limited to 128 MiB; scenario-only files remain limited to 1 MB and require precomputation. Import/export work runs in a background worker and can be cancelled with Pause. A failed or cancelled import preserves the previous scenario.

Current full-hand limits: hero OOP, four exact combinations per player, zero rake, pot at least 4 bb, effective stack from 1 bb to three times the pot, at most three raises after the initial bet on a street. Native precomputation uses up to four CPU threads and a 30-minute timeout; tree exports are capped at 256 MB and validated trees at 600,000 nodes. These are capacity guards, not a measured 8 GB hardware guarantee. The displayed independent gap can remain above target after the iteration budget; coverage completion does not imply convergence. No claim is made about untested sizes.

Full-hand sizing offers **Fast** selection from the configured candidates and **Deep** expansion with finite midpoint and geometric candidates. Set separate maximum retained bet/raise sizes and a target whole-hand EV loss. All-in counts toward the limits. The selected menus may differ at every hero decision, including later-street raises. Every evaluated action remains available during training, including alternatives outside the retained menu; review identifies them afterward.

The app compares best-response EV with all candidates against the complete retained menus, using the same fixed opponent model. It tries smaller limits first and reports when the requested loss target is not met. Menu selection is a heuristic across public nodes, not a guarantee of globally optimal menus. Fixed-tree convergence, measured fixed-opponent simplification loss, and unknown loss versus untested sizes are separate. The deviation blend is projected onto retained menus; training EV scores still compare every candidate with unrestricted future continuation. Deep can exceed the tree/resource guards; it never silently drops requested branches. More general opponent edits, preflop libraries/solving and broad aggregation remain ongoing work. See [acceptance status](docs/implementation.md).

## Legacy bounded flop laboratory

Set a fixed flop, exact weighted ranges (up to 12 combinations each), pot, effective stack, and opponent calling tendencies. Precompute, then practice repeated hands. Inspect baseline versus modeled play, action EVs, both range matrices, weighted equities, draw composition, card removal, bookmarks, and the decision journal. Practice selected combinations, made hands or draws, replay completed hands, and compare repeated action frequencies with their targets. The journal and latest solution stay in this browser's local storage. Export scenarios for portable backups; exports exclude personal training history. Imported equity data is recomputed before use.

The supported game is deliberately restricted: hero acts first and chooses **check down to showdown** or **bet a precomputed size**; the opponent chooses **call/fold** facing a bet. There is no subsequent betting. Every compatible hand pair and all 990 legal unordered turn–river runouts per pair are enumerated. The action restriction is explicit, and its loss relative to full no-limit Hold'em is unknown.

The browser reference engine supports a stated rake convention (percentage of terminal pot, capped, including folds). The optional **TexasSolver C++ engine** supports zero rake. See [native setup and validation](native/README.md). Every native baseline is evaluated independently using exact runouts, and its measured deviation incentive is shown.

This is an engineering milestone, **not completion of the entire requirements baseline**. See [implementation and acceptance status](docs/implementation.md) and the unchanged [requirements](docs/requirements.md).

## Use the bounded drill

1. Configure the flop and exact ranges, e.g. `AhKh:1,QhQd:0.5`.
2. Set calling tendency: 0 preserves baseline, +1 always calls, −1 always folds. JSON overrides such as `{"AcQc":0.8}` take precedence for that combination.
3. Choose all-in only, fast candidate sizing, or deep finite midpoint search. Set the maximum retained sizes and target simplification loss. Optional node overrides such as `{"AcQc@3.3":0.8}` apply only when facing that bet.
4. Precompute. The native engine runs locally when installed. Pause saves completed equity hand pairs; resuming a canceled native baseline restarts that stage.
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
