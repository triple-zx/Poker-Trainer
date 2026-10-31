# Native TexasSolver integration

The trainer runs a separately built CPU console executable. It does not bundle upstream binaries or require a paid solver. Default discovery checks `.native/TexasSolver`; development also recognizes a sibling `texassolver` checkout. Override paths with `TEXASSOLVER_BIN` and `TEXASSOLVER_RESOURCES` before starting the server.

## Build

Prerequisites: Git, CMake, C++17 compiler and OpenMP. Windows build tested with MinGW GCC 8.1.0 and CMake 3.26. macOS requires a compiler/OpenMP installation; the new checkpoint support still needs macOS validation.

```sh
node native/setup.mjs
node server.mjs
```

The setup script fetches https://github.com/bupticybee/TexasSolver, checks out console revision `6dfb65b4d7ed081da509e8d8c3d82138c4708267`, applies the included patch, and builds only `console_solver`. No machine-wide installation is performed. A failed existing checkout is retained for inspection, not silently overwritten.

## Scope and provenance

The adapter exposes both the legacy bounded flop game and full flop/turn/river betting and raising within the limits in the main README. It uses exact weighted combinations, zero rake, and disabled suit isomorphism. It defaults to one thread for these trees (override with TEXASSOLVER_THREADS, capped at four), limits bounded execution to five minutes and full-tree execution to 30 minutes, permits one native job at a time, and uses an isolated temporary working directory. Subprocess arguments do not use a shell. Development-preview solve requests require the exact loopback Origin; the desktop app uses a restricted IPC bridge. Imported data cannot specify executable paths or native commands.

Upstream console source uses AGPL-3.0; see `TEXASSOLVER-LICENSE`. The main branch README also contains additional licensing statements: https://github.com/bupticybee/TexasSolver#license. This repository supplies a local build procedure, original adapter and source patch. Desktop packages bundle the compiled modified engine, its pinned source archive, patch, build recipe and license. No paid licensing agreement has been entered into.

The older official v0.1.1 Windows release was tried and rejected the exact-combination input `AcQc`. It is not a compatible backend for this adapter.

## Patch rationale

1. Replace unavailable `std::mutex` in the installed MinGW win32-thread toolchain with an RAII OpenMP lock. OpenMP was already required by upstream. Both callers retain lock guards; the lock is noncopyable.
2. In full-deck two-player chance traversal and best-response traversal, normalize by `deck - board - 4`, accounting for both players' private cards. With the original `-2`, terminal showdown contributions lose probability mass relative to immediate folds. This was detected by an independent exact-runout check on the bounded game.

Patch scope is limited to the inspected console revision. This is not evidence that every upstream game mode, abstraction, or other release is correct. Do not enable short-deck or suit abstraction without additional tests.

## Numerical validation

Reproduce the first fixture with:

```sh
path/to/console_solver -i native-benchmark.txt -r path/to/resources
node native/verify.mjs native-result.json
```

The verifier measures the sum of both players' unilateral improvement incentives in bb against independently enumerated equities. It does not compare mixed frequencies directly: several near-equivalent profiles can differ in frequencies.

For zero rake, the native reported percent is half of this gap divided by pot, multiplied by 100. Compare units explicitly. The initial pre-patch result reported `0.00006914139%`, while independent gap was `0.007079991 bb`. After the chance normalization patch, native reported `0.004044175%` and independent gap was `0.000809673 bb` at the same 10 bb pot, which agree to floating-point tolerance. The included verifier requires gap below 0.001 bb for this fixture.

The bounded adapter requests 0.001% native accuracy; full-hand mode requests `0.05 / pot` percent, corresponding to a 0.001 bb Nash gap. Maximum iterations may stop before the requested accuracy. The independently measured gap is displayed regardless. Small fixed-tree gap does not establish optimal bet sizing or robustness of an opponent model.

## Iteration checkpoints

The updated desktop engine supports `--trainer-capabilities` and reports checkpoint protocol 1. `Checkpoint.cpp`, compiled by this repository's CMake recipe, persists DCFR regrets, cached positive-regret sums, accumulated strategy, slot presence, the absolute iteration number and the convergence flag. Saving occurs after both players' updates and the iteration's scheduled accuracy check. Thus pausing exactly when the accuracy target is met does not change early-stopping behavior. A converged checkpoint exports directly; a budget-limited checkpoint can continue with a larger budget. The adapter now honors the configured 100–100,000 iteration range rather than silently clipping it to 10,000.

The adapter's `run(scenario, abortSignal, options)` accepts a host-owned `checkpointDirectory`, `resume`, `pauseSignal` and `onProgress`. The desktop owns a single `solver-job` folder under its user-data directory; renderer input cannot select filesystem paths. Fresh computation replaces that job. Pause writes a request file, waits for the next complete iteration, atomically saves state and exits with code 75, without exporting a partial result. Progress reports the current completed iteration and separately the last saved iteration. Periodic saves occur every 100 iterations; an unexpected app/process exit may lose the iterations since that save. Normal cancellation and timeout wait for process exit before deleting temporary output files. No GitHub Actions run is involved.

Checkpoints bind to the exact executable and native commands, excluding only the maximum iteration budget. Native loading also compares board, exact weighted ranges, deck, algorithm settings and every tree node/action/payoff. It uses expected sizes from the rebuilt tree, rejects nonfinite state and checks the entire stream's checksum and length. Writes flush a temporary file before atomic replacement; incomplete temporary files are never resumed. This is corruption detection for local files, not cryptographic authentication or a promise of recovery from hardware failure. Solver upgrades or different game settings require a fresh solve. Checkpoints are not portable solution packages and contain no training journal. Sampling, warmup and suit isomorphism are unsupported by this checkpoint format.

Run `node native/verify-checkpoints.mjs` with the new native engine to compare every exported probability across uninterrupted, paused/resumed and forcibly interrupted/recovered full-tree runs, test mismatched/corrupt/truncated files, and verify weighted in-position ranges. Run `node node_modules/electron/cli.js . --smoke-test --checkpoint-smoke` for the isolated desktop controls, renderer reload, saved-job restoration and resumed decision evaluation. The existing app window and user data are not used by this smoke test. Rebuild with `native/setup.mjs` before using the new native feature; older engines are detected and keep their explicitly labeled stop/restart behavior.

## Direct evaluator and measured efficiency

The current patch replaces table-based seven-card evaluation with an original direct rank-count/suit-mask evaluator in HoldemEvaluator.h. It avoids loading the 2.6-million-entry dictionary at runtime and avoids evaluating 21 subsets for each seven-card hand. Standard Holdem only; short-deck is explicitly rejected. POKER_USE_TABLE_EVALUATOR=1 retains the old table path for diagnostic comparisons.

Run `node native/verify-evaluator.mjs` after building. It exhaustively verifies all 2,598,960 dictionary hands, all 7,462 hand-value equivalence classes and their ordering, then compares 100,000 seeded seven-card hands against the best of their 21 verified five-card subsets. The numerical solver fixtures also remain unchanged.

Windows measurement with identical one-thread input and precision (see docs/benchmarks/windows-memory.json): old evaluator 6.880 seconds and 124.5 MB sampled peak working set; direct evaluator 1.484 seconds and 9.9 MB sampled peak working set. Memory was sampled every 25 ms, not an exact allocation peak. These measurements are process-level on this machine, not a general hardware guarantee.

The four complete fixture runs additionally show the effect of reducing thread scheduling overhead: the original four-thread table implementation took 11.4–17.4 seconds; direct evaluation with four threads took 6.1–12.4 seconds; direct evaluation with one thread took 0.72–1.42 seconds. Inputs, action trees and requested convergence targets are unchanged. Reports are preserved in docs/benchmarks. Larger trees may benefit from more threads and need separate profiling.

## Multiple sizes

The adapter supports the finite fast/deep root-size candidate set with call/fold responses and no later betting. Pot and stack support three decimal places in bb and are scaled by 1000 for native whole-chip rounding. Native automatic near-all-in substitution is disabled because it otherwise changes requested sizes; extraction requires exact configured action amounts. Six differential fixtures now include fast fractional sizes and deep midpoint search. These add runtime: about 7 seconds for the default 3-by-3 fast fixture and 2.8 seconds for the 1-by-1 deep fixture on the measured Windows machine. The browser reference can be faster on this bounded game; C++ is retained for native integration and future larger-tree work, not asserted faster for every small fixture.

Full-hand mode configures both players on every street and exports all three streets. Fast uses the seed menus; Deep adds finite midpoint and starting-flop geometric candidates through the same shared configuration function used by the independent converter. Every required legal action and chance continuation is validated before training. Automatic hero-menu selection and the measured fixed-opponent simplification loss are evaluated after the native baseline solve; they do not claim a restricted-tree equilibrium.

Run `node native/verify-full.mjs` for full coverage, independent gap agreement and portable-solution training. Run `node native/verify-sizing.mjs` for deep candidate expansion, node-specific size caps, import equivalence and 100 hands choosing from all evaluated sizes. The optional `--export-fixture` flag saves a reusable package under the ignored `.native/` directory for UI testing. These checks should normally run locally to conserve GitHub Actions minutes.

Run `node native/verify-expanded-ranges.mjs` to create the twelve-by-twelve weighted study fixture, validate every continuation, compare the native and independent gap, and test portable training on all streets. Subsequent `--reuse` runs reuse its saved baseline and check that the native game still matches; they do not invent a native timing measurement. `node native/benchmark-evaluation.mjs` compares the former and compact-table evaluators on identical solved fixtures in fresh processes. It verifies complete result hashes, records timing and clearly labeled memory snapshots, and starts no solver. The twelve-combination fixture needs 1,369,632 baseline probabilities, within the 2,400,000 capacity; adding more sizes can exceed that limit even below 600,000 nodes.

`node native/benchmark-coverage.mjs` measures retained coverage-cache heap and time against revision `e7b3119`, verifies complete result hashes on the existing sizing/expanded-range fixtures, and probes the minimum tree for larger ranges without solving it. Its public-range probe requires the locally prepared manifest described in `docs/preflop-sources.md`. Only an ignored module copy relaxes the range-count cap; product limits remain unchanged. The larger-range cache improves while the twelve-combination coverage case is several milliseconds slower. See `docs/benchmarks/card-coverage.json`; these are component measurements, not peak application RAM or native-solver performance claims.
