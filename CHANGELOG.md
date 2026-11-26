# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-11-26

### Added

- add CTRL coverage merge and report CLI/API (#5)

### Fixed

- resolve katex and js-yaml security alerts in dev dependencies (#25)
- use client-id instead of the deprecated app-id for the bot token (#19)
- ignore TypeScript 7 and ESLint 10 updates until the lint tooling supports them (#17)
- ignore TypeScript 7 and ESLint 10 updates until the lint tooling supports them (#17)
- use the real repository description (#15)

### Changed

- replace the old Pre-Release (Develop) workflow with the Pre-Release (Alpha) variant (#21)
- align .github files and scripts with the template (#22)
- prefer REPO_ADMIN_TOKEN over the bot app token for merges and branch updates (#20)
- deps-dev(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#9)
- use the winccoa-tools-pack-bot app token for automated PR actions (#18)
- auto-release patch and minor releases (#14)
- re-register dispatch-only workflows with GitHub Actions (#11)
- align .github with template-npm-shared-library (#8)
- bump minimatch and markdownlint-cli (#6)
- bump actions/upload-artifact from 6 to 7 (#1)

## [0.1.1] - 2026-11-24

### Added

- add CTRL coverage merge and report CLI/API (#5)

### Changed

- re-register dispatch-only workflows with GitHub Actions (#11)
- align .github with template-npm-shared-library (#8)
- bump minimatch and markdownlint-cli (#6)
- bump actions/upload-artifact from 6 to 7 (#1)

## [Unreleased]

### Added

- CLI `winccoa-ctrl-coverage` and API to merge WinCC OA CTRL coverage reports (`CovRep_*.xml`) and render text, JSON, Markdown and Cobertura reports.
