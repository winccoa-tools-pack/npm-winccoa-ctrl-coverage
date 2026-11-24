#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { CoverageInputError } from './errors';
import { readCoverage } from './read';
import { renderCobertura, renderJson, renderMarkdown, renderText } from './render';
import { buildDetailedReport } from './report';
import { VERSION } from './version';

const USAGE = `winccoa-ctrl-coverage ${VERSION}

Usage: winccoa-ctrl-coverage <input...> [options]

Merges WinCC OA CTRL coverage reports (CovRep_*.xml, written by WCCOActrl
-coveragereportfile / CTRL_COVERAGE in the TestFramework) and reports line,
function and branch coverage. Inputs are files or directories (searched
recursively for CovRep_*.xml) and are never modified.

Options:
  --root <dir>            report paths below <dir> relative to it
  --include <glob>        keep only matching reported paths (repeatable)
  --exclude <glob>        drop matching reported paths (repeatable)
  --sources <dir>         list *.ctl files below <dir> without coverage data as
                          untested (repeatable; not part of the rates)
  --json <file>           write the JSON report
  --cobertura <file>      write the Cobertura XML report
  --markdown <file>       write a Markdown summary
  --min-lines <percent>   exit 1 when the line rate is lower
  --min-functions <pct>   exit 1 when the function rate is lower
  --allow-empty           do not fail when no file matches (empty report)
  --verbose               add one row per file to the console report
  --quiet                 no console report
  -h, --help              show this help
  -v, --version           show the version

Exit codes: 0 ok, 1 threshold not met, 2 invalid input or usage.
Globs: * (not /), ** (any path), ? (one character, not /).
`;

interface Options {
    inputs: string[];
    root?: string;
    include: string[];
    exclude: string[];
    sources: string[];
    json?: string;
    cobertura?: string;
    markdown?: string;
    minLines?: number;
    minFunctions?: number;
    allowEmpty: boolean;
    verbose: boolean;
    quiet: boolean;
}

function usageError(message: string): never {
    throw new CoverageInputError(`${message}\nTry 'winccoa-ctrl-coverage --help'.`);
}

function parseArguments(argv: string[]): Options | undefined {
    const options: Options = {
        inputs: [],
        include: [],
        exclude: [],
        sources: [],
        allowEmpty: false,
        verbose: false,
        quiet: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) usageError(`option ${arg} needs a value`);
            return next;
        };
        const percentage = (): number => {
            const parsed = Number(value());
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                usageError(`option ${arg} needs a percentage between 0 and 100`);
            }
            return parsed;
        };

        switch (arg) {
            case '-h':
            case '--help':
                process.stdout.write(USAGE);
                return undefined;
            case '-v':
            case '--version':
                process.stdout.write(`${VERSION}\n`);
                return undefined;
            case '--root':
                options.root = value();
                break;
            case '--include':
                options.include.push(value());
                break;
            case '--exclude':
                options.exclude.push(value());
                break;
            case '--sources':
                options.sources.push(value());
                break;
            case '--json':
                options.json = value();
                break;
            case '--cobertura':
                options.cobertura = value();
                break;
            case '--markdown':
                options.markdown = value();
                break;
            case '--min-lines':
                options.minLines = percentage();
                break;
            case '--min-functions':
                options.minFunctions = percentage();
                break;
            case '--allow-empty':
                options.allowEmpty = true;
                break;
            case '--verbose':
                options.verbose = true;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            default:
                if (arg.startsWith('-')) usageError(`unknown option ${arg}`);
                options.inputs.push(arg);
        }
    }

    if (options.inputs.length === 0) usageError('no coverage input given');
    return options;
}

function writeOutput(file: string, content: string): void {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
}

function run(argv: string[]): number {
    const options = parseArguments(argv);
    if (!options) return 0;

    const { data, inputs, warnings } = readCoverage(options.inputs);
    const detailed = buildDetailedReport(data, {
        root: options.root,
        include: options.include,
        exclude: options.exclude,
        sources: options.sources,
        inputs,
        warnings,
    });
    const { report } = detailed;

    if (report.summary.files === 0 && !options.allowEmpty) {
        throw new CoverageInputError(
            `no coverage data for any file in ${inputs.length} input file(s); check --include/--exclude/--root or use --allow-empty`,
        );
    }

    // Render everything before writing anything, so a failure never leaves partial outputs.
    const outputs: [string, string][] = [];
    if (options.json) outputs.push([options.json, renderJson(report)]);
    if (options.markdown) outputs.push([options.markdown, renderMarkdown(report)]);
    if (options.cobertura) {
        outputs.push([
            options.cobertura,
            renderCobertura({
                ...detailed,
                sourceRoot: options.root ? path.resolve(options.root) : '.',
                timestamp: Date.now(),
            }),
        ]);
    }
    for (const [file, content] of outputs) writeOutput(file, content);

    if (!options.quiet) process.stdout.write(renderText(report, options.verbose));

    const failures: string[] = [];
    if (options.minLines !== undefined && report.summary.lines.rate * 100 < options.minLines) {
        failures.push(
            `line coverage ${(report.summary.lines.rate * 100).toFixed(1)}% is below ${options.minLines}%`,
        );
    }
    if (
        options.minFunctions !== undefined &&
        report.summary.functions.rate * 100 < options.minFunctions
    ) {
        failures.push(
            `function coverage ${(report.summary.functions.rate * 100).toFixed(1)}% is below ${options.minFunctions}%`,
        );
    }
    for (const failure of failures) process.stderr.write(`error: ${failure}\n`);
    return failures.length > 0 ? 1 : 0;
}

try {
    process.exitCode = run(process.argv.slice(2));
} catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    process.exitCode = 2;
}
