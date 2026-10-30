# Native TexasSolver integration

The trainer runs a separately built CPU console executable. It does not bundle upstream binaries or require a paid solver. Default discovery checks `.native/TexasSolver`; development also recognizes a sibling `texassolver` checkout. Override paths with `TEXASSOLVER_BIN` and `TEXASSOLVER_RESOURCES` before starting the server.

## Build

Prerequisites: Git, CMake, C++17 compiler and OpenMP. Windows build tested with MinGW GCC 8.1.0 and CMake 3.26. macOS requires a compiler/OpenMP installation; native macOS execution has not yet been tested.

```sh
node native/setup.mjs
node server.mjs
```

The setup script fetches https://github.com/bupticybee/TexasSolver, checks out console revision `6dfb65b4d7ed081da509e8d8c3d82138c4708267`, applies the included patch, and builds only `console_solver`. No machine-wide installation is performed. A failed existing checkout is retained for inspection, not silently overwritten.

## Scope and provenance

The adapter currently exposes only the bounded flop game described in the main README, with exact weighted combinations, no rake, and suit isomorphism disabled. It defaults to one thread for these small trees (override with TEXASSOLVER_THREADS, capped at four), limits execution to five minutes, permits one native job at a time, and uses an isolated temporary working directory. Subprocess arguments do not use a shell. Local solve requests require the exact loopback Origin. Imported data cannot specify executable paths or native commands.

Upstream console source uses AGPL-3.0; see `TEXASSOLVER-LICENSE`. The main branch README also contains additional licensing statements: https://github.com/bupticybee/TexasSolver#license. This repository supplies a local build procedure, original adapter, and source patch, not upstream binaries. Review distribution/licensing decisions before bundling a modified engine or operating a hosted solver. No paid licensing agreement has been entered into.

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

The interactive adapter requests 0.001% native accuracy; maximum iterations may stop before that target. The independently measured gap is displayed regardless. Small fixed-tree gap does not establish optimal bet sizing or robustness of an opponent model.

## Direct evaluator and measured efficiency

The current patch replaces table-based seven-card evaluation with an original direct rank-count/suit-mask evaluator in HoldemEvaluator.h. It avoids loading the 2.6-million-entry dictionary at runtime and avoids evaluating 21 subsets for each seven-card hand. Standard Holdem only; short-deck is explicitly rejected. POKER_USE_TABLE_EVALUATOR=1 retains the old table path for diagnostic comparisons.

Run `node native/verify-evaluator.mjs` after building. It exhaustively verifies all 2,598,960 dictionary hands, all 7,462 hand-value equivalence classes and their ordering, then compares 100,000 seeded seven-card hands against the best of their 21 verified five-card subsets. The numerical solver fixtures also remain unchanged.

Windows measurement with identical one-thread input and precision (see docs/benchmarks/windows-memory.json): old evaluator 6.880 seconds and 124.5 MB sampled peak working set; direct evaluator 1.484 seconds and 9.9 MB sampled peak working set. Memory was sampled every 25 ms, not an exact allocation peak. These measurements are process-level on this machine, not a general hardware guarantee.

The four complete fixture runs additionally show the effect of reducing thread scheduling overhead: the original four-thread table implementation took 11.4–17.4 seconds; direct evaluation with four threads took 6.1–12.4 seconds; direct evaluation with one thread took 0.72–1.42 seconds. Inputs, action trees and requested convergence targets are unchanged. Reports are preserved in docs/benchmarks. Larger trees may benefit from more threads and need separate profiling.

## Multiple sizes

The adapter supports the finite fast/deep root-size candidate set with call/fold responses and no later betting. Pot and stack support three decimal places in bb and are scaled by 1000 for native whole-chip rounding. Native automatic near-all-in substitution is disabled because it otherwise changes requested sizes; extraction requires exact configured action amounts. Six differential fixtures now include fast fractional sizes and deep midpoint search. These add runtime: about 7 seconds for the default 3-by-3 fast fixture and 2.8 seconds for the 1-by-1 deep fixture on the measured Windows machine. The browser reference can be faster on this bounded game; C++ is retained for native integration and future larger-tree work, not asserted faster for every small fixture.
