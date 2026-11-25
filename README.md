# npm-winccoa-ctrl-coverage

> **Not published to npm yet.** This package is still under development and has no release. Its API and contents may change before the first release. This notice is removed with the first release.

<!-- markdownlint-disable MD033 -->
<div align="center">

[![npm version](https://img.shields.io/npm/v/@winccoa-tools-pack/npm-winccoa-ctrl-coverage.svg?label=npm)](https://www.npmjs.com/package/@winccoa-tools-pack/npm-winccoa-ctrl-coverage)
![License](https://img.shields.io/github/license/winccoa-tools-pack/npm-winccoa-ctrl-coverage)
[![CI/CD](https://github.com/winccoa-tools-pack/npm-winccoa-ctrl-coverage/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/winccoa-tools-pack/npm-winccoa-ctrl-coverage/actions/workflows/ci-cd.yml)
[![Release](https://github.com/winccoa-tools-pack/npm-winccoa-ctrl-coverage/actions/workflows/release.yml/badge.svg)](https://github.com/winccoa-tools-pack/npm-winccoa-ctrl-coverage/actions/workflows/release.yml)

</div>
<!-- markdownlint-enable MD033 -->

CLI and API that merge WinCC OA **CTRL coverage reports** (`CovRep_*.xml`) and produce text, JSON, Markdown and Cobertura reports.

WinCC OA writes the raw data itself: a `WCCOActrl`/`WCCOAui` manager started with the config entry `CTRL_COVERAGE = "dbg"` and `-coveragereportfile <file>` records which CTRL lines and functions were executed.
The TestFramework switches this on per test project (`"CTRL_COVERAGE": true` in `testProj*.config`) and stores one `CovRep_<date>_<script>_<manager>.xml` per manager in the test project's `log` directory.
This package merges those files and turns them into a report.

## Install and run

```sh
npm install --save-dev @winccoa-tools-pack/npm-winccoa-ctrl-coverage
npx winccoa-ctrl-coverage <input...> [options]
```

Inputs are files or directories. Directories are searched recursively for `CovRep_*.xml` (and `CoverageReport_*.xml`). Inputs are never modified.

```sh
# merge everything in a test project's log directory, report only the repository sources
winccoa-ctrl-coverage Projects/Running/Unit_3.22/log \
  --root "$PWD" --include "src/Splash/**" --sources src/Splash \
  --json coverage.json --cobertura cobertura.xml --markdown coverage.md
```

| Option | Meaning |
| --- | --- |
| `--root <dir>` | Report paths below `<dir>` relative to it. |
| `--include <glob>` / `--exclude <glob>` | Keep only / drop matching reported paths. Repeatable. `*` does not match `/`, `**` matches any path, `?` is one character. Matching is case-insensitive. |
| `--sources <dir>` | List `*.ctl` files below `<dir>` that have no coverage data as **untested**. Repeatable. |
| `--json`, `--cobertura`, `--markdown <file>` | Write the report in that format (parent directories are created). |
| `--min-lines <pct>`, `--min-functions <pct>` | Exit with `1` when the rate is below the threshold. |
| `--allow-empty` | Do not fail when no file has coverage data. |
| `--verbose`, `--quiet` | Per-file rows on the console / no console report. |

Exit codes: `0` ok, `1` threshold not met, `2` invalid input or usage.

API:

```ts
import { readCoverage, buildDetailedReport, renderJson, renderCobertura } from '@winccoa-tools-pack/npm-winccoa-ctrl-coverage';

const { data, inputs, warnings } = readCoverage(['Projects/Running/Unit_3.22/log']);
const detailed = buildDetailedReport(data, { root: process.cwd(), include: ['src/Splash/**'], inputs, warnings });
const json = renderJson(detailed.report);
```

## What is measured

- **Lines:** a line is _coverable_ if the WinCC OA interpreter emitted at least one `<node>` for it, and _covered_ if the highest hit count of its nodes is greater than 0.
  Comments, blank lines and lines without executable nodes are not counted.
  Nodes outside a function (script globals) are counted; `line <= 0` is ignored.
- **Functions:** every `<func>` (including class methods) is coverable; it is covered if it was called at least once. The synthetic `[init script globals]` function is included.
- **Branches:** the `executed`/`total` values WinCC OA reports per function, summed.
- **Merging:** several inputs (managers, test runs) are merged per file. Line hits and function call counts keep the **maximum**; functions are identified by name, signature and line. Merging is therefore "covered by at least one run", not a sum of calls.
- **Rates** are fractions in the range 0..1 (`covered / total`); `0` when there is nothing coverable.

### Which files are included

The coverage data contains **every script a manager loaded**: the code under test, the test scripts themselves, and the WinCC OA product libraries (`<WinCC OA>/scripts/libs/...`). The package does not decide what is "yours":

- **Library / product files:** use `--include` / `--exclude` to keep only your sources, e.g. `--include "src/Splash/**"`.
- **Test and generated files:** appear like any other script. Exclude them (`--exclude "tests/**"`) if they should not count.
- **Untested files:** a script that no manager loaded has no data and cannot be counted line by line. With `--sources` such files are listed separately and are **not** part of any rate, so the percentages describe only code that was loaded. Compare the untested list with the rates before drawing conclusions.

## Report formats

- **Text:** console summary, optionally one row per file.
- **JSON** (`schemaVersion: 1`): `{ schemaVersion, tool, inputs, summary, files[], untested[], warnings[] }`, where `summary` and every entry of `files` hold `lines`, `functions` and `branches` as `{ covered, total, rate }`. Field names are stable within a `schemaVersion`.
- **Cobertura XML:** coverage-04 DTD, one package per directory, usable with common coverage viewers and CI plugins. Only line and method data are included; per-class branch rates are `0`.
- **Markdown:** summary table, per-file table and the untested list, suitable for `$GITHUB_STEP_SUMMARY`.

## Failure behavior

Invalid input is an error, never a clean report:

- a missing path, an unreadable file, an empty or non-XML file, mismatched tags, stray markup or non-numeric counters stop the run with exit code `2` and a message naming the file and line;
- if the filters leave no file with coverage data the run fails (`2`) unless `--allow-empty` is given;
- all outputs are rendered first and written afterwards, so a failing run never leaves a partial report; the input files are never touched, so raw artifacts stay available for analysis.

A `<script>` without a `<file path>` is skipped with a warning (printed and stored in the report). A coverage file without any script (for example from `pmon`) is valid and contributes nothing.

## Limitations

- Coverage is only produced by WinCC OA managers started with `CTRL_COVERAGE`; the TestFramework enables it per test project. It was verified with WinCC OA 3.21 on Windows; check the entry on other platforms and versions.
- Only executed CTRL lines and functions are measured, not data-flow or condition coverage beyond the branch counters WinCC OA reports.
- The files are large (several MB per manager); merging 9 files / 33 MB takes about one second.
- `.zip` archives (for example stored test projects) are not read directly; extract them first.

## Origin and license

This package does not reuse, adapt or fork an existing coverage reporter. It is based only on the `CovRep` XML that WinCC OA itself writes. See [docs/origin.md](docs/origin.md).

## Development

```sh
npm install
npm test            # style check, build, unit tests
npm run style-fix   # eslint --fix, prettier, markdownlint --fix
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the Git flow and release process.

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## Disclaimer

**WinCC OA** and **Siemens** are trademarks of Siemens AG.
This project is not affiliated with, endorsed by, or sponsored by Siemens AG.
This is a community-driven open source project created to enhance the development experience for WinCC OA developers.

---

Made with ❤️ for and by the WinCC OA community
