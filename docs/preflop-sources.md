# Public preflop source review

Reviewed 2026-10-30. No third-party range library has been imported or redistributed.

## GTO Wizard

Primary documentation: https://help.gtowizard.com/study-mode/ (Ranges tab).

The documented user-operated export path copies either the whole range or a particular action's range in Pio/GTO+ format. A future import should retain the selected table format, stack, positions, action history, open/raise sizes, ante and rake assumptions alongside the pasted weights. This help page does not establish a bulk-download or redistribution license. The trainer has not accessed private or paid solutions and does not claim possession of those ranges.

## Open-source range viewer candidate

Repository: https://github.com/jensbaagaard/poker-practice
Data notes: https://github.com/jensbaagaard/poker-practice/blob/main/data/openSourcePokerData/README.md

The repository advertises MIT and describes data as free to use. Its data notes describe extraction from another application's JavaScript chunks without clearly identifying the original rights grant or independent numerical validation. The candidate therefore has unresolved data provenance despite the repository-level statement. It was inspected but not copied into this trainer.

The described cash sets cover 100 bb with 2, 2.5 or 3 bb opens and variants for simplified and mixed action frequencies; positions span six through nine seats. Data is hand-class frequency JSON, rather than individual suited combinations. Rake assumptions and a reproducible solve/error certificate are not established by the inspected notes. Do not label it a validated GTO dependency.

## Current decision

Keep source acquisition separate from numerical claims. The bundled postflop scenario is an original synthetic regression fixture, not a preflop recommendation. Support user-supplied, provenance-tagged range text first. Expand to a redistributable built-in library only after establishing the data's original permission, exact game assumptions, and quality evidence.
