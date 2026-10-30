# Contributor and AI handoff rules

Read README.md, docs/requirements.md, docs/handoff.md, and the design document relevant
to the change. Product requirements are the user's decisions; design documents are
engineering decisions and may evolve with evidence. Do not silently shrink scope.

- Work on one milestone-sized change. Record implementation status and measured checks
  in docs/handoff.md; distinguish designs, prototypes, and supported features.
- Keep domain logic independent of Tauri, React, persistence, and third-party solvers.
  Only engine adapters may reference a solver's native types or card/action indices.
- Preserve versioned units, root/node EV conventions, weighted-card distributions, and
  artifact identity. A cache hit must match the full computation identity.
- A training-ready solution must cover every offered action and legal continuation.
  Incomplete, truncated, zero-reach, or approximate values must not be silently invented.
- Training uses saved strategy/evaluation data. It must never launch a solver as a
  hidden response to a user's training action.
- Profile before optimizing. Compare the same game, precision, hardware, and evaluation
  definitions; a reduced tree is not a raw solver speedup.
- Run the existing design checks for contract changes. Add behavior tests that can
  catch real mistakes; do not add tests that simply copy implementation constants.
- Upstream source, datasets, and binaries require pinned provenance and appropriate
  license handling. Process isolation is not a licensing exemption.
- No fabricated GTO data, invented benchmark results, or UI that reports unavailable
  capabilities as implemented. Synthetic fixtures must be labeled as such.
- Avoid broad scaffolding for modules not yet implemented. The planned paths in
  docs/architecture.md are ownership boundaries, not instructions to add empty files.
- Do not put secrets, personal hand histories, large result trees, or build artifacts
  in git. Preserve user data through versioned, tested migrations.
- Do not set up scheduled agents, auto-merge, deployment, or paid services from the
  phrase "continuous maintenance"; the user means reliable development on request.
- User preference: clarify material product ambiguity one question at a time with
  clickable choices. Routine engineering decisions should be resolved and documented.
