# Origin and license

Decision for [issue #26](https://github.com/winccoa-tools-pack/winccoa-native-gui-test-framework/issues/26): **do not reuse, adapt or fork** an existing coverage reporter.

- An existing coverage script in the Siemens CtrlppCheck repository is licensed under GPL-3.0, this package under MIT. No code or text of it is copied here.
- The implementation is based only on what WinCC OA itself produces: the `CovRep_*.xml` files written by the CTRL interpreter (`CTRL_COVERAGE` / `-coveragereportfile`, observed on real files of WinCC OA 3.21) and the public Cobertura XML format.
- The package is meant to become the shared tool for CTRL coverage reports in the winccoa-tools-pack repositories and, later, to be consumed from npm by other repositories (such as CtrlppCheck) instead of each keeping its own copy.

Behavior that follows from the data format (maximum hit count per line when several runs are merged, coverable lines are the lines with interpreter nodes) is documented in the [README](../README.md#what-is-measured).
