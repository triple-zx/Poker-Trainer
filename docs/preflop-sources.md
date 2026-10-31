# Public preflop source review

Reviewed 2026-10-31. No third-party range library has been imported or redistributed. A local range editor and source-preserving import path are now implemented.

## GTO Wizard

Primary documentation: https://help.gtowizard.com/study-mode/ (Ranges tab).

The documented user-operated export path copies either the whole range or a particular action's range in Pio/GTO+ format. The trainer accepts comma-separated labeled classes or exact combinations with decimal weights, e.g. `AKs:0.5,AhQh:0.25`, plus explicit percentages and plus/interval notation. Record the selected table format, stack, positions, action history, open/raise sizes, ante and rake assumptions in the range editor. This is a supported text subset, not a claim to read every vendor format. Raw numerical vectors, bracket-weight groups and proprietary binary files are rejected. This help page does not establish a bulk-download or redistribution license. The trainer has not accessed private or paid solutions and does not claim possession of those ranges.

## Open-source range viewer candidate

Repository: https://github.com/jensbaagaard/poker-practice
Data notes: https://github.com/jensbaagaard/poker-practice/blob/main/data/openSourcePokerData/README.md

The repository advertises MIT and describes data as free to use. Its data notes describe extraction from another application's JavaScript chunks without clearly identifying the original rights grant or independent numerical validation. The candidate therefore has unresolved data provenance despite the repository-level statement. It was inspected but not copied into this trainer.

The described cash sets cover 100 bb with 2, 2.5 or 3 bb opens and variants for simplified and mixed action frequencies; positions span six through nine seats. Data is hand-class frequency JSON, rather than individual suited combinations. Rake assumptions and a reproducible solve/error certificate are not established by the inspected notes. Do not label it a validated GTO dependency.

## Current decision

Keep source acquisition separate from numerical claims. The bundled postflop scenario is an original synthetic regression fixture, not a preflop recommendation. The Ranges tab supports user-supplied text and range JSON with retained provenance, original weights and subsequent edits. Four original construction templates (all starting hands, pocket pairs, broadway and suited connectors) are mathematical hand families, not positional opening/defending recommendations or solved strategies. Their original template data is dedicated under CC0-1.0; no third-party chart values are included. The UI does not certify user-supplied source or license claims. A verified positional GTO library and independent preflop solving remain pending.

Additional source inspection: https://github.com/jbwheatley/preflop-ranger describes a GPL-3.0 desktop chart editor; the inspected repository overview does not establish a numerical strategy dataset suitable for adoption. No data was copied. PioSOLVER's primary UPI documentation (https://piofiles.com/docs/upi_documentation/) ties numerical range vectors to an explicit hand order; the trainer therefore rejects unlabeled vectors rather than guessing their ordering.
