# Solver investigation and selection gates

Inspection date: 2026-10-30. This is source inspection, not a build or performance test.
No upstream code, commercial data, or solver binary has been added to this repository.

## Candidates

| Candidate | Source inspected | Decision |
| --- | --- | --- |
| b-inary/postflop-solver | Revision 9d1509fe5077d019825f833eed04b16d342dfda1 | First integration spike: Rust library with relevant interfaces; adopt only after gates below |
| bupticybee/TexasSolver | console revision 6dfb65b4d7ed081da509e8d8c3d82138c4708267; console README | Baseline comparison and alternative adapter candidate |

The first candidate's README says development is suspended and notes API changes may
not follow version bumps. Pin a full revision and maintain an auditable patch series;
do not track its branch head. Cargo metadata declares AGPL-3.0-or-later. Its documented
DCFR, parallelism, and compact storage are reasons to evaluate it, not performance
results measured for this application.

TexasSolver's console accepts text configuration and exports JSON. Its sample controls
export depth through set_dump_rounds. Do not assume that an arbitrary export includes
all streets, action EVs, or enough state for optimization resume. The observed console
documentation alone does not establish full fixed-opponent locking or checkpoint support.

## Source-backed capability evidence

The links below pin the inspected source. Native details stay inside the adapter.

| Concern | Observed evidence | Required adapter work |
| --- | --- | --- |
| Rake and sizes | [basic example](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/examples/basic.rs) sets rake and tree sizes | Test exact rounding, eligible pot, folds, raise-to translation |
| Strategy access | Same example uses combo lists, normalized weights, equity, EV, and action-major strategy arrays | Convert combo indices and payoff reference; cover low-reach actions |
| Node locking | [locking example](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/examples/node_locking.rs) locks before solving | Freeze ALL opponent nodes, not only edited nodes; validate arbitrary suit locks |
| Incremental solve | [solver.rs](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/src/solver.rs) exposes solve_step with iteration index | Cooperative cancel/checkpoint boundaries; preserve iteration schedule |
| Save depth | [file_io example](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/examples/file_io.rs) can discard post-river-deal information | Verify continuation coverage before marking trainable |
| Serialization | [serialization.rs](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/src/game/serialization.rs) omits storage2 in full River mode and recreates it on decode | Do not advertise exact resume from this result format |
| Numeric metric | [utility.rs](https://github.com/b-inary/postflop-solver/blob/9d1509fe5077d019825f833eed04b16d342dfda1/src/utility.rs) has different raked and unraked metric paths and centered root EV | Document formula and allowed deviations; do not trust the name exploitability without conversion |

## Checkpoint versus result is a blocking distinction

The existing full-depth serialization writes storage1 but allocates zeroed storage2
when decoding. Solving uses cumulative regret storage; finalized loading reconstructs
values. This is not evidence of an exact continuation checkpoint. An iteration counter
also controls discounting and averaging and must be stored externally or in a new format.

Provide separate capabilities:

- pause_in_memory: cooperative pause without releasing state; cannot survive shutdown.
- resume_optimization: true only after full optimizer-state round-trip tests.
- load_final_result: read a finished game; does not imply either capability above.

M0 must prototype exact checkpoint support: topology, ranges, complete lock tables,
regrets, cumulative strategies, compression scales, iteration/update phase, algorithm
parameters, and any RNG state. Stop only at a full iteration boundary. Require the
same engine/patch/format identity on resume. Never finalize the only optimizer state
and then claim it can continue unchanged. If this gate fails, implement a checkpoint
patch or switch engines before claiming the requested overnight resume capability.

## Integration gates (all currently unmeasured)

1. Stable compiler builds on Windows x64, macOS arm64, macOS x64 with lockfile; no nightly
   custom allocator initially. Exercise an isolated crash without killing the host.
2. Terminal ledger agrees with declared units, rake, and effective-stack semantics.
3. Complete fixed-opponent evaluation and best response agree with tiny exhaustive
   games; zero-reach and low-frequency action values are not fabricated.
4. Asymmetric suit ranges/locks are correct. If the library cannot disable or refine
   invalid symmetry, patch it; do not quietly restrict the requested exact editor.
5. Exact resume survives a process restart and matches uninterrupted optimization within
   the documented numeric tolerance on the same build and thread configuration.
6. Exported strategy plus Q data can train to every offered terminal without loading the
   full engine game or performing a new solve. Validate all supported suit mappings.
7. Memory estimate includes temporary/export buffers and bounds process peak RSS.
8. Distribution plan includes appropriate upstream notices/source obligations. Keeping
   the GitHub repository private is not itself a completed licensing determination.

Process separation is for replaceability and failure containment, not avoidance of
license obligations. No paid authorization is assumed. Verify exact dependencies and
the source/binary distribution to friends before shipping the selected engine.

## Optimization sequence

1. Establish correctness and a baseline with fixed inputs, seed, engine build, tree,
   accuracy diagnostic, hardware, threads, compression, and cold/warm cache status.
2. Remove avoidable copies and oversized IPC/export buffers before changing mathematics.
3. Measure combinations of thread count and compact storage against float32 baseline;
   include error and peak RSS, not only elapsed time.
4. Profile terminal evaluation, traversal, and card-equivalence handling; optimize the
   measured bottleneck with preserved reference cases.
5. Evaluate safe warm starts across compatible trees. Never transfer action-array state
   by index after changing sizes. Validate convergence anew after each transfer.
6. Only then consider alternate CFR schedules, pruning, GPU work, or learned leaf values
   as separately benchmarked experiments. Each has distinct correctness requirements.

No speedup factor, full-flop 8 GB fit, or 6-max runtime is promised from upstream claims.

## Public data investigation

GTO Wizard [Study Mode](https://help.gtowizard.com/study-mode/) documents range-copy
formats. This establishes an interoperability target, not a downloaded dataset.
M1 must deliver actual permitted fixtures with origin, table/stack/rake metadata,
coverage, and quality labels. Simplified charts are not silently labeled solved GTO.
Do not make unavailable external data a hidden prerequisite for running synthetic tests.
