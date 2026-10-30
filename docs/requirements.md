# Poker Trainer — requirements baseline

Date: 2026-10-30
Repository: triple-zx/Poker-Trainer (private)
Status: Requirements captured from an interactive user interview; reviewable baseline.
This document specifies product requirements, not an approved architecture or an implemented feature set.

## 1. Purpose and users

Build a maintainable poker training and research application for the owner and a few friends.
The main activities are interactive training and custom scenario research, including
user-defined opponent strategies and analysis of how the user's strategy should deviate
from a GTO baseline.

The user explicitly requested requirements clarification before architecture or coding.
No application architecture, implementation language, UI framework, solver integration,
or performance claim is selected by this document.

## 2. Confirmed product boundaries

| ID | Requirement |
| --- | --- |
| R-01 | Target standard no-limit Texas Hold'em cash games. |
| R-02 | Initially solve and train postflop pots with exactly two active players. A two-player postflop pot can originate at a six-player table. |
| R-03 | Support both heads-up-table and 6-max preflop research in the longer-term scope. |
| R-04 | Provide built-in preflop ranges plus editing and importing. Independently computed preflop strategies are also a requested capability, delivered in stages. |
| R-05 | If full 6-max preflop solving exceeds local resources or the overnight budget, use presets/imports first and expand solving capability after feasibility measurements. |
| R-06 | Offer common cash-game presets and custom pot size, effective stack, rake percentage, and rake cap. Clearly identify unsupported configurations. |
| R-07 | Run locally on each user's computer, on Windows and macOS. |
| R-08 | Do not require a discrete GPU for basic functionality. GPU acceleration is optional. |
| R-09 | Accommodate computers with 8 GB RAM, allowing smaller local solves or importing precomputed results from other machines. This is not a promise that every requested solve fits in 8 GB. |
| R-10 | Default to a fully English app, with a switchable Chinese interface. |

## 3. Primary first-release workflow

The user explicitly selected the following as the first usable release:

1. Choose a specific flop.
2. Set both players' starting ranges, positions, pot, effective stack, and rake settings.
3. Configure the opponent's tendencies, with access to detailed strategy edits.
4. Automatically select betting sizes and precompute the scenario.
5. Repeatedly train this scenario using sampled private cards and subsequent board cards.
6. Use only precomputed action sizes during uninterrupted training.
7. Review the completed hand: decisions, strategy, both ranges, and EV-based feedback.
8. Save the scenario, results, training records, and mistakes for reuse.

Precomputation must cover the continuation branches offered by the training scenario.
A solved root node alone does not establish that a scenario is ready for uninterrupted play.
If the configured coverage cannot be computed within resources, disclose this before
training and offer a smaller supported configuration or an imported solution.

The first-release focus does not remove the other requested features; it determines delivery order.

## 4. Opponent modeling and strategic deviations

### 4.1 Input and inspection

- Provide high-level tendency controls, such as excessive calling, insufficient bluffing,
  or overly tight raising.
- Allow progressive inspection and refinement down to individual decision nodes,
  hand categories, and specific private-card combinations.
- The concrete strategy produced by tendency controls must be inspectable and editable.
- Include preflop tendencies: for example, overly wide participation changes the
  ranges entering postflop.
- Preserve the difference between a modeled range and a claim about an actual opponent.

### 4.2 Model assumption

The initial requested model is a fixed opponent strategy:
user edits replace relevant baseline behavior; unspecified behavior follows the baseline.
The complete modeled opponent is fixed while the application evaluates a response.
An opponent that strategically adapts at unspecified nodes is not a first-release requirement.

### 4.3 Output

- Show the GTO baseline and the opponent-specific strategy side by side.
- Let the user adjust the extent of deviation and compare expected value against the
  configured opponent.
- Explain which opponent assumptions produced the adjustment.
- Do not imply that adjusting between strategies automatically gives a certified
  robustness or exploitability bound.
- The precise meaning of the deviation control and evaluation metrics is an engineering
  specification to define before implementing this feature, not an already chosen algorithm.

## 5. Automatic bet sizing

The requested product includes two modes:

- Fast: select sizes from an editable candidate set.
- Deep: additionally search for sizes beyond the initial candidate set.

Provide two forms of complexity control:

- A direct limit on the number of retained bet and raise sizes.
- A target for acceptable simplification loss, seeking fewer sizes when the target allows it.

Provide size and strategy comparisons, including the cost of simplification when it can
be evaluated reliably. If a requested target is not reached or cannot be certified,
state that explicitly.

Separate:

1. Solver error within the fixed action tree.
2. Loss associated with restricting or simplifying the action set.
3. Error from any abstraction, depth limitation, approximation, or learned component.

Small fixed-tree error does not establish optimality over arbitrary legal bet amounts.
A product goal resembling GTO Wizard does not imply access to its proprietary solver
or an obligation to reproduce its internals.

## 6. Training behavior

- Support continuous hand play and isolated decision drills.
- Provide both precomputed training and a research mode that can recompute customized scenarios.
- For the core fixed-flop workflow, precompute first and keep training uninterrupted.
- Training offers only solved bet/raise sizes. Custom amounts can be configured before
  solving or explored in research mode; they are not silently mapped to another amount
  during the core training workflow.
- By default, sample consistently with configured ranges, card removal, and legal deal probabilities.
- Also allow targeted sampling of selected hand classes, draws, or board types.
- Identify targeted practice as a different sampling distribution.
- Default feedback is after the hand ends; the opponent's hidden cards and the answer
  should not be exposed during normal play.
- Score individual decisions primarily by EV loss relative to the selected training objective.
- Evaluate execution of mixed action frequencies over repeated decisions separately.
- Do not mark one of several equivalent mixed-strategy actions wrong solely because it
  differs from a single sampled reference action.
- Record decisions and EV feedback; support bookmarks, mistake review, replay,
  and basic statistics by scenario or opponent model.
- Automated training-plan generation is not part of the selected first-release scope.

## 7. Analysis

### 7.1 Node-level analysis

Provide a readable overview with optional detailed inspection:

- Both weighted ranges, including a 13x13 hand matrix and specific suited combinations.
- Made-hand and draw composition.
- Hand-level and range-level equity.
- Available sizes and action frequencies.
- Action EV and comparisons.
- Relevant blocker information.

The user requested overview and detailed data, not a dense-only or simplified-only interface.

### 7.2 Aggregation

Both forms are requested:

- Across turn and river cards following one flop.
- Across multiple flops for a common preflop/scenario setup.

Allow comparison of strategy, hand strength, and size preferences across these cases.
Coverage and aggregation weights must be explicit. Do not label sampled or partial coverage
as exhaustive, or combine different opponent models without identifying the distinction.

Large multi-flop reporting follows the first fixed-flop training release unless subsequent
priorities change.

### 7.3 Explanations

Initially provide explanations based on computed quantities and comparisons.
External LLM services and conversational AI coaching are not required.
Avoid presenting a speculative causal poker explanation as a measured solver result.

## 8. Runtime, resources, and quality

| Topic | Confirmed preference / limit |
| --- | --- |
| Fresh postflop scenario | As fast as possible; 5–30 minutes can be acceptable for a complex new solve, including automatic size selection. |
| Training feedback | Precompute so the core training session does not wait for solving. |
| Batch analysis | Overnight jobs are acceptable. |
| Long jobs | Progress reporting, saved intermediate work, pause and resume are requested. |
| Hardware | Accommodate 8 GB RAM machines; CPU operation is required for basic use; GPU is optional. |
| Precision policy | Developer proposes verifiable defaults; user can adjust quick and precise settings. |
| Quality visibility | Display measured error where supported, assumptions, and incomplete/nonconverged status. |
| Optimization | Compare equivalent inputs, hardware, action trees, and precision; do not equate a smaller problem with an algorithmic speedup. |

These are requirements and preferences, not benchmark results.
Concrete limits require representative Windows and macOS hardware measurements.

Quantitative tolerances, reference fixtures, and convergence metrics remain to be specified
in the design/validation stage. Metrics must fit the game being solved: do not transfer
zero-sum two-player guarantees unqualified to rake-sensitive or multi-player settings.

## 9. Data and sharing

- Keep each user's data locally and independently.
- Support manual import/export of scenarios, opponent models, and solved results.
- No account system or automatic cross-device synchronization is required by the selected scope.
- Preserve the association between a result and its ranges, game parameters, opponent model,
  and computation settings so the user can understand what the result represents.
- Personal training data should not be silently included when sharing scenario packages.

The last two items are proposed acceptance details derived from reliable analysis and
local/manual sharing, rather than separately selected interface features.

## 10. Preflop data acquisition

The user currently has no range files to supply and requested that the developer find
public preflop material.

Investigate publicly available sources, including GTO Wizard, and supported export formats.
For each candidate, determine:

- Table format, positions, action history, and bet sizes.
- Stack depth, rake, and ante assumptions.
- Whether values are weighted combinations, simplified charts, or another representation.
- Data provenance, quality evidence, and applicable usage/sharing terms.
- Actual accessible export/import path.

Availability for viewing does not establish an automated bulk-download or redistribution right.
Do not claim a complete preflop library has been obtained: no actual ranges were imported
during this interview.

Initial discovery, not a selected data dependency:

- GTO Wizard Study Mode documents copying ranges in Pio/GTO+ format:
  https://help.gtowizard.com/study-mode/
- Public range-viewer/data projects may provide additional candidates, but their data origin,
  coverage, license, and numerical quality require inspection before use.

## 11. Solver selection and optimization

- Prefer modifiable open-source engines.
- TexasSolver is an example candidate, not a mandatory dependency.
- Evaluate algorithms, time/memory behavior, Windows/macOS operation, interfaces, and
  the exact version's applicable license before integration.
- No paid solver purchase has been requested or authorized.
- Profile real bottlenecks and validate numerical correctness when optimizing.
- Report measured improvements rather than promising a fixed speedup before benchmarks.

Reference only:

- TexasSolver: https://github.com/bupticybee/TexasSolver
- GTO Wizard's public description of Dynamic Sizing 2.0:
  https://blog.gtowizard.com/introducing_dynamic_sizing_2/

The TexasSolver repository labels its license AGPL-3.0 and has additional README
licensing statements. This document makes no final legal or integration determination.

## 12. Meaning of maintainability and updates

The user clarified that "automatic updates" primarily means continued engineering
maintenance and iteration, not automatic desktop software installation.

The selected workflow is:

- The user requests a feature or reports a problem.
- An AI developer can continue reliably using clear documentation, defined responsibilities,
  and meaningful tests.
- Deliver usable increments rather than waiting for the entire long-term feature set.

No scheduled maintenance agent, automatic PR bot, unattended merge, or automatic production
release has been requested. No recurring task should be created from this requirement alone.

Client application auto-install/update policy is not a first-release requirement established
by this interview. Normal delivery and upgrade details can be proposed during design.

Maintainability acceptance should include enough documentation and verification for another
developer/AI session to reproduce development, understand domain assumptions, and make changes
without relying on this chat. Specific repository structure and tools are intentionally deferred.

## 13. Proposed first-release acceptance checks

These translate the selected workflow into reviewable behavior; numeric thresholds are
not yet benchmarked or fixed.

1. On supported Windows and macOS setups, create and save a two-player postflop scenario
   with a fixed flop, weighted ranges, pot/stack/rake settings, and a fixed opponent model.
2. Adjust an opponent tendency, inspect its concrete effect, and edit a specific strategy detail.
3. Compute a baseline and opponent-specific response with automatic sizing appropriate to
   the release's supported mode; report assumptions and solve status.
4. Estimate resource demand before a job; handle a scenario that cannot fit available memory
   without silently changing its meaning.
5. Pause/resume supported long-running work and reuse saved completed results.
6. Mark a training scenario ready only for continuation branches covered by its saved solution.
7. Play repeated hands using precomputed sizes without triggering a blocking solve.
8. After a hand, inspect decisions, both modeled ranges, action EV feedback, and comparisons
   appropriate to the chosen training objective.
9. Save mistakes and basic statistics; export/import a reusable scenario without requiring
   a cloud account.
10. Start in English and switch the interface to Chinese.

The first milestone may implement a bounded sizing mode and scenario family; their exact
boundaries must be explicit in its implementation plan. The longer-term request for both
sizing modes and both complexity controls remains intact.

## 14. Engineering decisions intentionally deferred

The product interview delegates technical recommendations; the following are not silently decided:

- Application packaging, implementation languages, architecture, module interfaces, and storage.
- Solver choice and precise licensing/integration arrangement.
- Concrete mapping of tendency controls to valid full opponent strategies.
- Definition of the strategy-deviation control.
- Algorithms and verification for sizing selection and simplification loss.
- Numerical accuracy targets and benchmark configurations.
- Practical 8 GB solve limits and full-turn/river coverage costs.
- Hardware-specific acceleration, checkpoint semantics, and file compatibility details.
- Preflop source selection and measured feasibility of local heads-up / 6-max solving.
- Precise later-milestone ordering after the fixed-flop training workflow.

These should be resolved as explicit design decisions and experiments after review of
this requirements baseline, rather than claimed as completed capabilities.
