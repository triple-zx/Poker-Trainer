# Automatic sizing research

Public sources reviewed on 2026-10-30 at the user's request:

- [Dynamic Sizing 2.0 (2025)](https://blog.gtowizard.com/introducing_dynamic_sizing_2/) describes comparing independently solved action subsets with a fuller action set in small depth-limited trees. It also distinguishes this from the earlier prune-and-resolve heuristic. Its benchmark permits an opponent to respond to simplification. These are useful design ideas; the article does not supply its proprietary continuation evaluator or implementation.
- [Dynamic Sizing (2023)](https://blog.gtowizard.com/dynamic-sizing-a-gto-breakthrough/) describes node-specific simplification and editable candidate sets. Its older pruning method should not be presented as the current algorithm.
- [Pot Geometry](https://blog.gtowizard.com/pot-geometry/) connects equal pot-fraction bets to remaining stack and streets, with assumptions about polarization and static equity. Geometric sizing is a useful candidate, not a universal optimality rule.

## Project decisions

The current bounded flop laboratory selects subsets against the same fixed opponent model. That measured loss must remain distinct from equilibrium simplification loss against an adapting opponent.

For the full-street trainer, bet and raise candidates must be selected at individual public decision nodes, respecting legal minimum raises, remaining stacks, position and street. Include an optional geometric candidate, calculated as `((1 + 2*stack/pot)^(1/streets) - 1)/2` times the pot when no call is outstanding. Deep search can refine candidate intervals, but is still a finite search.

Evaluate candidate subsets by re-solving or by a verified complete continuation calculation, not by frequency alone. Keep separate reports for fixed-tree convergence, fixed-model response loss, and equilibrium simplification loss when actually measured. Do not claim a global optimum, reproduce proprietary models, import paid charts, or present an unverified continuation estimate as exact.

Full-street support and this expanded size-selection workflow are ongoing engineering work; this document does not claim they are already implemented.
