# Review of Siemens `ctlCoverageReport` (reuse, adapt or fork)

Reviewed: <https://github.com/siemens/CtrlppCheck/tree/main/devTools/ctlCoverageReport> (`coverage_report.ts` / `coverage_report.js`).

## Findings

| Topic | Finding |
| --- | --- |
| License | The CtrlppCheck repository is **GPL-3.0**. Copying or adapting the code would make this package GPL-3.0; the winccoa-tools-pack repositories are MIT. |
| Maintenance | Single script, no package, no versioning; last changed with the 3.21 quality-gate work. The CtrlppCheck repository itself is active. |
| Input | `CovRep_*.xml` files from the current directory or one given path (non-recursive), plus an optional single file. |
| Parsing | Regular expressions without validation. Content that does not match is silently ignored; an unreadable file only prints a warning and the run still succeeds. |
| Coverage data | Lines (maximum of `<node>` counts, taken from inside `<func>` only), functions (by name only) and branches (summed per `<func>` and per input, which double-counts when inputs overlap). |
| Output | Console report; optional Cobertura XML. No JSON/Markdown, no filtering by glob, no untested-file handling. |
| Platform | Plain Node.js, no platform assumptions; paths are normalized with `path.normalize` (Windows separators only on Windows). |

## Decision

**Reuse the idea, reimplement** (clean room, MIT):

- The XML structure is a documented WinCC OA output and the merge semantics (maximum per line / function) are the natural choice, so the behavior stays compatible with the Siemens tool.
- Code is not copied because of the GPL-3.0 license.
- Gaps of the original are closed by design: strict validation with non-zero exit on invalid input, no double counting of branches, nodes outside `<func>` counted, functions keyed by name, signature and line, glob filters, untested-file listing, JSON/Markdown output, unit tests with fixtures.

WinCC OA 3.21 additionally ships `ctrlCoverage` CTRL classes (`CtrlCoverage`, `CtrlCoverageToCoberturaConverter`) that run inside WinCC OA. They need a WinCC OA installation; this package works on plain Node.js and can therefore run in a lightweight CI step.
