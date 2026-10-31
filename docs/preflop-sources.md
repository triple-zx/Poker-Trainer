# Public preflop source review

Reviewed 2026-10-31. The public ART/GTO archive has been downloaded and its text ranges independently checked for import integrity. Five opening ranges have been prepared as local study imports, outside the repository. No third-party range values are bundled or redistributed in the application.

## GTO Wizard

Primary documentation: https://help.gtowizard.com/study-mode/ (Ranges tab).

The documented user-operated export path copies either the whole range or a particular action's range in Pio/GTO+ format. The trainer accepts comma-separated labeled classes or exact combinations with decimal weights, e.g. `AKs:0.5,AhQh:0.25`, plus explicit percentages, plus/interval notation and matching bracketed percentage groups. Record the selected table format, stack, positions, action history, open/raise sizes, ante and rake assumptions in the range editor. This is a supported text subset, not a claim to read every vendor format. Raw numerical vectors and proprietary binary files are rejected. This help page does not establish a bulk-download or redistribution license. The trainer has not accessed private or paid solutions and does not claim possession of those ranges.

## ART/GTO public download

Primary pages: https://artgto.com/gto-solutions/ and https://artgto.com/learn/ranges/. The UTG chart links a direct text download at https://artgto.com/try/ranges/utg/UTG_RFI.txt; the complete advertised free Viewer download redirects to https://dl.artgto.com/artgto-viewer.zip. The reviewed archive is 1,907,419 bytes, SHA-256 `8673a0ab0203b79f4363d58d84a7b6e24abf84c28a97d4e4e8e2f924566de94c`.

The publisher describes 100 bb 6-max cash ranges covering opening, calling, 3-/4-/5-betting and multiway lines. These are not heads-up-table solutions. Published opens are 2 bb for UTG/MP/CO/BU and 3 bb for SB. Our five study imports map MP to HJ and BU to BTN and retain the original source position in the history notes. Rake percentage/cap and antes were not established by the inspected pages or archive; the corresponding metadata stays null, not zero. Per-line continuation sizes beyond those opening ranges are not inferred from filenames. No independently reproducible solve or convergence certificate was found. Treat the numerical strategies as publisher-described output, not independently verified equilibrium data.

All 2,606 range text files passed an independent exact-combination decoder comparison and canonical text round trip. 311 are empty; the remaining 2,295 also passed range-document import/export round trips. Nonempty files include 4–898 combinations. The UTG opening file contains 338 positive-weight combinations with 264.2102 weighted combinations (19.92535% of all starting hands), consistent with the rounded 19.9% page summary. Text files retain decimal weights that charts round visually. See `benchmarks/public-range-import.json` for hashes and verification scope. This measures import integrity, not strategic correctness or six-player exploitability.

The archive and reviewed pages advertise free downloading and studying but did not establish an explicit grant to redistribute the charts with this application. Accordingly, the app ships the parser and reproducible inspection tools, not the range values. No downloaded executable, batch file or viewer was run. The local study files include source links, source-file hashes, unknown assumptions and these limits.

To reproduce the optional acquisition on Windows, run from the repository root:

```powershell
./native/prepare-public-ranges.ps1 -Download
node native/verify-public-ranges.mjs
node native/prepare-public-study.mjs
node node_modules/electron/cli.js . --smoke-test --public-range-smoke
```

The PowerShell helper refuses an archive that differs from the reviewed fingerprint and reads only range text into a local manifest; it does not unpack/run executable files. Omit `-Download` to reuse the archive. The study helper writes five `.range.json` files and instructions to `../preflop-study-imports`. In the app, choose **Ranges → Import range file**, review the source assumptions, then save. These broad ranges exceed the current twelve-combination full-hand limit and are refused when applied, without silent sampling. Full-range postflop integration and built-in redistribution remain separate work.

## Additional candidates reviewed

https://github.com/kunalAgarwal35/preflop-charts-spec/blob/main/DATA.md describes matching hand-built ranges to aggregate action percentages and interpolating other cases. That is not a complete per-hand solver export or a convergence certificate; its chart values were not adopted. https://github.com/bmorrow10/preflopR advertises MIT and approximate positional guidelines, but the inspected source does not establish precise stack/rake/tree assumptions or numerical validation. It was not adopted as a verified GTO library.

## Open-source range viewer candidate

Repository: https://github.com/jensbaagaard/poker-practice
Data notes: https://github.com/jensbaagaard/poker-practice/blob/main/data/openSourcePokerData/README.md

The repository advertises MIT and describes data as free to use. Its data notes describe extraction from another application's JavaScript chunks without clearly identifying the original rights grant or independent numerical validation. The candidate therefore has unresolved data provenance despite the repository-level statement. It was inspected but not copied into this trainer.

The described cash sets cover 100 bb with 2, 2.5 or 3 bb opens and variants for simplified and mixed action frequencies; positions span six through nine seats. Data is hand-class frequency JSON, rather than individual suited combinations. Rake assumptions and a reproducible solve/error certificate are not established by the inspected notes. Do not label it a validated GTO dependency.

## Current decision

Keep acquisition separate from numerical claims. The bundled postflop scenario is an original synthetic regression fixture, not a preflop recommendation. The Ranges tab supports imported text and range JSON with retained provenance, original weights and subsequent edits, including the reviewed public bracket format. Four original construction templates (all starting hands, pocket pairs, broadway and suited connectors) are mathematical hand families, not positional opening/defending recommendations or solved strategies. Their original template data is dedicated under CC0-1.0; no third-party chart values are included. The UI does not certify source or license claims. A numerically verified, redistributable positional GTO library and independent preflop solving remain pending.

Additional source inspection: https://github.com/jbwheatley/preflop-ranger describes a GPL-3.0 desktop chart editor; the inspected repository overview does not establish a numerical strategy dataset suitable for adoption. No data was copied. PioSOLVER's primary UPI documentation (https://piofiles.com/docs/upi_documentation/) ties numerical range vectors to an explicit hand order; the trainer therefore rejects unlabeled vectors rather than guessing their ordering.
