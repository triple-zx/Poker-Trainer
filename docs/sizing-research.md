# Automatic sizing research

Public sources reviewed on 2026-10-30 at the user's request:

- [Dynamic Sizing 2.0 (2025)](https://blog.gtowizard.com/introducing_dynamic_sizing_2/) describes comparing independently solved action subsets with a fuller action set in small depth-limited trees. It also distinguishes this from the earlier prune-and-resolve heuristic. Its benchmark permits an opponent to respond to simplification. These are useful design ideas; the article does not supply its proprietary continuation evaluator or implementation.
- [Dynamic Sizing (2023)](https://blog.gtowizard.com/dynamic-sizing-a-gto-breakthrough/) describes node-specific simplification and editable candidate sets. Its older pruning method should not be presented as the current algorithm.
- [Pot Geometry](https://blog.gtowizard.com/pot-geometry/) connects equal pot-fraction bets to remaining stack and streets, with assumptions about polarization and static equity. Geometric sizing is a useful candidate, not a universal optimality rule.

## Project decisions

The current bounded flop laboratory selects subsets against the same fixed opponent model. That measured loss must remain distinct from equilibrium simplification loss against an adapting opponent.

For the full-street trainer, bet and raise candidates must be selected at individual public decision nodes, respecting legal minimum raises, remaining stacks, position and street. Include an optional geometric candidate, calculated as `((1 + 2*stack/pot)^(1/streets) - 1)/2` times the pot when no call is outstanding. Deep search can refine candidate intervals, but is still a finite search.

Evaluate candidate subsets by re-solving or by a verified complete continuation calculation, not by frequency alone. Keep separate reports for fixed-tree convergence, fixed-model response loss, and equilibrium simplification loss when actually measured. Do not claim a global optimum, reproduce proprietary models, import paid charts, or present an unverified continuation estimate as exact.

## Implemented full-hand search

Fast uses the configured per-street percentages plus legal all-ins. Deep adds a midpoint and, when in range, the equal-pot-fraction geometric seed derived from the starting flop stack/pot ratio. The same seed is available on all streets; it is not recalculated for each line and is not claimed to be optimal. Native tree construction and import validation use the identical expanded set. All choices are precomputed before training.

At each hero public decision, exhaustive local subset comparison keeps passive actions and at most the requested number of bets or raises. All-in counts as a size. Values include restricted future continuation and the fixed opponent's hidden-range reach; menu selection uses one shared menu for all hero combinations. Private-hand best-response action choices are made after summing over the hidden opponent range.

This bottom-up selection is a whole-tree heuristic: counterfactual hero-range weights omit the hero's own earlier choices, so local optimality does not prove a globally optimal combination of menus. The app evaluates the resulting frozen menus exactly within the covered tree and reports their root best-response EV loss versus all candidates. It compares allowed bet/raise limit pairs, chooses the smallest total limits meeting the target among those tested, or the least-loss tested pair and an unmet-target status. No adapting-opponent/equilibrium simplification loss is claimed.

Limit pairs are tested in ascending total complexity. After a pair meets the target, only other pairs with the same total limits need evaluation; larger limits are skipped. The selected menus are then frozen and their EV recomputed as a consistency check. This avoids redundant full-tree passes without changing the stated selection criterion.

The adjusted training target renormalizes baseline weights over retained actions and blends with the restricted best response. Individual decision EV scores continue to compare all evaluated actions with unrestricted continuation, allowing the player to try alternatives without exposing the selected menu during a hand. Export/import preserves the sizing configuration and independently reconstructs the selection.
