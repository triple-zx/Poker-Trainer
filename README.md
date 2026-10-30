# Poker Trainer

A local postflop training and research app. English and Chinese interface. No account, cloud database, telemetry, or GPU required.

## Desktop application

The product is an installable Windows/macOS desktop app with its own window, bundled runtime and local C++ engine. It does not require a browser tab or local web server. Desktop packages are produced by the Desktop packages workflow after startup checks; builds are currently unsigned.

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

## Current milestone: bounded flop laboratory

Set a fixed flop, exact weighted ranges (up to 12 combinations each), pot, effective stack, and opponent calling tendencies. Precompute, then practice repeated hands. Inspect baseline versus modeled play, action EVs, both range matrices, weighted equities, draw composition, card removal, bookmarks, and the decision journal. Practice selected combinations, made hands or draws, replay completed hands, and compare repeated action frequencies with their targets. The journal and latest solution stay in this browser's local storage. Export scenarios for portable backups; exports exclude personal training history. Imported equity data is recomputed before use.

The supported game is deliberately restricted: hero acts first and chooses **check down to showdown** or **bet a precomputed size**; the opponent chooses **call/fold** facing a bet. There is no subsequent betting. Every compatible hand pair and all 990 legal unordered turn–river runouts per pair are enumerated. The action restriction is explicit, and its loss relative to full no-limit Hold'em is unknown.

The browser reference engine supports a stated rake convention (percentage of terminal pot, capped, including folds). The optional **TexasSolver C++ engine** supports zero rake. See [native setup and validation](native/README.md). Every native baseline is evaluated independently using exact runouts, and its measured deviation incentive is shown.

This is an engineering milestone, **not completion of the entire requirements baseline**. General street-by-street betting, full preflop libraries/solving, broad scenario aggregation, and full multi-street play remain under development. See [implementation and acceptance status](docs/implementation.md) and the unchanged [requirements](docs/requirements.md).

## Use

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
