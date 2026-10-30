# Poker Trainer completion goal

Created: 2026-10-30
Status: active; implementation not yet complete
Repository: triple-zx/Poker-Trainer (private)
Initial design: PR #1, branch design/architecture-v1
Execution mechanism: hourly cloud automation (not a native Goal object)
Automation ID: 6ae473286c8c8191a19106da8862f1ba

## User instruction and scope

The user explicitly requested: "请你设立一个goal，完成所有任务后就停止。"
Continue implementation and verification of all confirmed requirements, then stop.
This later request explicitly authorizes this one scheduled development task; earlier
documentation declining to infer scheduling from "continuous maintenance" is not a
prohibition on this new explicit request.

Read the current requirements, AGENTS.md, implementation plan, validation plan, and
handoff before work. Preserve the full scope; do not treat delivery of only the first
trainer version as completion of all requested work.

## Milestones

| Milestone | Deliverable | Current status | Evidence required for completion |
| --- | --- | --- | --- |
| M0 | Native engine and domain feasibility | Not started | Real engine build; independent correctness tests; full frozen-opponent behavior; suit locks; exact checkpoint resume; complete export; measured memory |
| M1 | Local saved-scenario study tool | Not started | Windows/macOS application; editable/importable ranges with provenance; jobs and resources; analysis; persistence and migrations; English/Chinese |
| M2 | Complete fixed-flop trainer | Not started | Configured opponent; fast sizing; full continuations; legal weighted dealing; uninterrupted practice; post-hand EV review; records and mistakes |
| M3 | Deep size search and aggregation | Not started | Size-count and loss controls; clear estimates/bounds; multi-board and runout reports; correct weights; batch operation |
| M4 | Preflop capabilities and measured optimization | Not started | Heads-up and 6-max capability evidence separately; sourced presets/imports; explicitly supported solve envelopes; same-input precision/time/memory comparisons |
| Final acceptance | Usable delivery and maintenance handoff | Not started | Requirement-to-evidence matrix, accessible code and runnable artifacts, install/use instructions, platform validation and final report |

For M4, presets/imports are the agreed interim fallback if full local preflop solving
is impractical. They do not automatically discharge the longer-term request for
self-computed preflop strategies. Unresolved requested capabilities remain open unless
the user explicitly revises scope. Do not make an unsupported feasibility promise.

## Completion criteria

All applicable tasks must be checked with concrete evidence:

- [ ] Every confirmed feature is implemented and tested, or explicitly removed by a later user instruction.
- [ ] Fixed-flop training uses complete saved continuations and does not trigger solving during practice.
- [ ] Opponent policy editing, GTO/response comparison, and adjustable deviations are validated.
- [ ] Both requested sizing modes and both controls are supported with honest quality/search labels.
- [ ] Node, runout, and cross-flop analysis use correct ranges and aggregation weights.
- [ ] Preflop scope has separate, evidenced outcomes for heads-up and 6-max; no silent substitutions.
- [ ] Native Windows/macOS builds and core application flows are validated.
- [ ] 8 GB training/resource behavior has measurements; heavy unsupported solves fail clearly.
- [ ] Long-job resume retains actual optimizer state, not just final strategy files.
- [ ] Data/engine provenance, notices, migrations, and repeatable development instructions are available.
- [ ] Final code revision, runnable delivery artifacts, tests, benchmark results, and usage guide are accessible.
- [ ] Final completion report is saved and delivered.
- [ ] This automation is disabled and its disabled status has been read back.

Documentation, stubs, synthetic fixtures, contract-only CI, and an untested installer
are not evidence that the full application is complete. Do not invent numerical results.

## Execution and checkpoints

Each invocation advances real implementation, testing, debugging, or a specific
feasibility investigation. Use focused branches/PRs, respect existing merge/release
boundaries, and update this plan and docs/handoff.md with:
current implementation ref, completed tasks, test/build evidence, blockers, and the
next concrete action. Prefer fresh reads and guarded writes over stale overwrites.

Work on the existing project, not a duplicate app. Do not create duplicate automations,
publicize the private repository, buy services, or message other people. This goal
does not imply auto-merge or public release authorization. Resolve routine reversible
engineering choices autonomously.

The local Windows execution host disconnected during setup. Do not assume its scratch
paths or compiler availability persist. Use available authorized execution environments
and CI; report an actual access/tooling blocker if none suffices. Never mark an unresolved
blocker as completion. Do not repeatedly claim progress without code or evidence.

## Stop rule

At both start and end of each run, evaluate the acceptance checklist. Once every
applicable item is satisfied, save the final report, deliver the result, then call
automations.update with this task's exact ID and is_enabled=false. Read back the
automation to confirm it is disabled. Do not disable any other task or continue with
unsolicited enhancements after completion.

If the user has already disabled or cancelled this task, do not reactivate it.
Before completion, an external blocker is a waiting/unresolved state, not success.
Only notify the user for a completed milestone, material blocker requiring action,
or final delivery; otherwise persist details in the repository.

## Initial evidence and next action

Design PR #1 contains the architecture, domain/protocol contracts, engine source audit,
implementation/validation plans, and 29 locally passed executable contract checks.
A completed CI run also passed those contract checks on Windows/macOS/Linux.
None of those checks constitutes native application or solver performance validation.

Next: M0 headless native integration with the pinned candidate engine. Start with
small river/turn fixtures, complete fixed-opponent semantics, and real checkpoint
verification before expanding to full-flop training.
