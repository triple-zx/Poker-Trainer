# Current handoff

Date: 2026-10-30
Phase: code design; application implementation has not started.

## Completed in this change

- Read the current requirements and preserved them unchanged.
- Selected a local desktop / isolated engine architecture and explicit ownership rules.
- Inspected pinned upstream source, including node locking, incremental solving,
  serialization, and metric conventions; identified real checkpoint and symmetry gates.
- Defined domain semantics, opponent compilation, behavioral interpolation, sizing
  comparison, immutable result coverage, and local persistence/protocol contracts.
- Added executable specification checks and cross-platform CI configuration.
- Wrote staged implementation and verification plans plus a Chinese design summary.

## Implemented versus planned

Implemented here: small independent JavaScript reference helpers and their contract
tests, documentation link/syntax checks. They are specification examples, not a solver.

Planned: every desktop screen, Rust domain/application crate, native worker, runtime
decoder, real artifact verifier, database, solver integration, training gameplay,
public preflop dataset import, and release packaging.

## Next concrete task

Start M0 in a focused branch. Build the pinned engine in a minimal headless worker;
validate B-R1 and B-T1 before expanding to flop workloads. Establish the full fixed
opponent and exact checkpoint behavior before wiring training or marketing capabilities.
If an adapter API conflicts with these contracts, amend the design explicitly with
evidence; do not weaken behavior silently to fit the vendor library.

## Environment and test boundaries

The design was prepared on Windows with Node 24.19.0. Rust/Cargo was not available in
the command environment used for this phase. No native solver build or performance
benchmark was attempted. TypeScript contract syntax is parsed by Node; no TypeScript
type checker is installed or claimed. Remote CI outcome is separate from local checks.

Local validation: `node --test tests/contracts.test.mjs` passed all 29 tests;
`node scripts/check-design.mjs` passed (17 local documentation links, TypeScript syntax,
and package metadata). No solver code/data licensing decision has been finalized and
no private application data is committed. Requirements must not be inferred from
fabricated sample GTO strategies.
