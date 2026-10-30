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

The adapter currently exposes only the bounded flop game described in the main README, with exact weighted combinations, no rake, and suit isomorphism disabled. It fixes thread count to at most four, limits execution to five minutes, permits one native job at a time, and uses an isolated temporary working directory. Subprocess arguments do not use a shell. Local solve requests require the exact loopback Origin. Imported data cannot specify executable paths or native commands.

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
