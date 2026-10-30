# Poker Trainer

A local cash-game training and research application for Windows and macOS.

**Current status: code design and executable contract specifications.** There is no
playable desktop application, integrated solver, imported preflop library, or measured
solver performance in this repository yet.

The first release will support a fixed-flop workflow: configure ranges and opponent,
choose sizes automatically, precompute all offered continuations, train without solving
interruptions, then review the complete hand and save mistakes.

## Read the design

1. [Confirmed requirements](docs/requirements.md)
2. [Architecture and module ownership](docs/architecture.md)
3. [Poker, opponent, and sizing semantics](docs/domain-and-math.md)
4. [Solver investigation and capability gates](docs/solver-evaluation.md)
5. [Protocol and persistent data](docs/contracts.md)
6. [Milestones and acceptance](docs/implementation-plan.md)
7. [Verification and benchmarks](docs/validation.md)
8. [Current handoff](docs/handoff.md)

## Run the design checks

Install Node.js 24 or newer. No dependency installation is necessary for these checks.

```sh
node --test tests/contracts.test.mjs
node scripts/check-design.mjs
```

The tests exercise small, independent mathematical and lifecycle contracts. They do
not demonstrate poker-solver convergence, desktop compatibility, or production-grade
validation of arbitrary imported data. The TypeScript interfaces describe the proposed
wire contract; runtime input decoders and generated bindings belong to milestone M0.

## Selected direction

Tauri 2 desktop shell, React/TypeScript presentation, Rust domain/application services,
an isolated native solver worker, SQLite metadata, and immutable indexed solution files.
The first engine investigation targets a pinned `postflop-solver` revision; TexasSolver
remains a comparison candidate. No third-party solver code has been incorporated.

The architecture keeps solver dependencies out of training and UI code. Read
[AGENTS.md](AGENTS.md) before making changes. Feature work should use focused branches
and tests appropriate to the change; no automatic deployment or recurring maintenance
agent is configured.
