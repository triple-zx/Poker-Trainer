# Poker Trainer

A local postflop training and research app. English and Chinese interface. No account, cloud database, telemetry, or GPU required.

## Run

Install Node.js 22 or newer, then run from this folder:

```sh
node server.mjs
```

Open http://127.0.0.1:4173. No package installation is needed. To check the code, run `node --test` (or `npm test`). CI runs on Windows, macOS, and Linux.

## Current milestone: bounded flop laboratory

Set a fixed flop, exact weighted ranges (up to 12 combinations each), pot, effective stack, and opponent calling tendencies. Precompute, then practice repeated hands. Inspect baseline versus modeled play, action EVs, both range matrices, bookmarks, and the decision journal. The journal and latest solution stay in this browser's local storage. Export scenarios for portable backups; exports exclude personal training history. Imported equity data is recomputed before use.

The supported game is deliberately restricted: hero acts first and chooses **check down to showdown** or **shove**; the opponent chooses **call/fold** facing a shove. There is no subsequent betting. Every compatible hand pair and all 990 legal unordered turn–river runouts per pair are enumerated. The action restriction is explicit, and its loss relative to full no-limit Hold'em is unknown.

The browser reference engine supports a stated rake convention (percentage of terminal pot, capped, including folds). The optional **TexasSolver C++ engine** supports zero rake. See [native setup and validation](native/README.md). Every native baseline is evaluated independently using exact runouts, and its measured deviation incentive is shown.

This is an engineering milestone, **not completion of the entire requirements baseline**. General street-by-street betting, automatic size search, full preflop libraries/solving, broad scenario aggregation, targeted drills, and full replay remain under development. See [implementation and acceptance status](docs/implementation.md) and the unchanged [requirements](docs/requirements.md).

## Use

1. Configure the flop and exact ranges, e.g. `AhKh:1,QhQd:0.5`.
2. Set calling tendency: 0 preserves baseline, +1 always calls, −1 always folds. JSON overrides such as `{"AcQc":0.8}` take precedence for that combination.
3. Precompute. The native engine runs locally when installed. Pause saves completed equity hand pairs; resuming a canceled native baseline restarts that stage.
4. Train. Opponent cards and action values appear after the decision. Scores use expected-value loss, not the luck of the sampled outcome.
5. Review and bookmark hands. Export a scenario before clearing browser storage.

## Development

- `app/engine.js`: pure poker evaluation, probability, reference solve, model response, and sampling.
- `app/worker.js`: background enumeration with hand-pair checkpoints.
- `app/app.js`: local application state and UI.
- `native/adapter.mjs`: validated command generation, bounded subprocess execution, native result checks.
- `native/texassolver.patch`: source changes against a pinned upstream revision; upstream license included.
- `server.mjs`: loopback-only static server and same-origin native solve endpoint.
- `tests/`: domain, import, native adapter, and HTTP tests.

Do not change the sampling distribution, rake convention, tree coverage, or result provenance silently. Keep native numerical cross-checks when optimizing. See the implementation document for open acceptance gaps.
