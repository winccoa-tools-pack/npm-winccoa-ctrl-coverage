import fs from 'node:fs';
import path from 'node:path';
import { CoverageInputError } from './errors';
import { normalizePath } from './parse';
import { CoverageData, CoverageReport, FileCoverage, FileSummary, Rate } from './types';
import { VERSION } from './version';

export interface ReportOptions {
    /** Paths below this directory are reported relative to it. */
    root?: string;
    /** Glob patterns (`*`, `**`, `?`) a reported path must match; default: everything. */
    include?: string[];
    /** Glob patterns that remove matching reported paths. */
    exclude?: string[];
    /** Directories scanned recursively for `*.ctl` files; files without coverage data are listed as untested. */
    sources?: string[];
    inputs?: string[];
    warnings?: string[];
}

export function globToRegExp(glob: string): RegExp {
    let source = '';
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === '*') {
            if (glob[i + 1] === '*') {
                i++;
                if (glob[i + 1] === '/') {
                    i++;
                    source += '(?:.*/)?';
                } else {
                    source += '.*';
                }
            } else {
                source += '[^/]*';
            }
        } else if (char === '?') {
            source += '[^/]';
        } else {
            source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`, 'i');
}

function relativeTo(root: string | undefined, filePath: string): string {
    if (!root) return filePath;
    const absolute = /^([A-Za-z]:[\\/]|\/)/.test(root) ? root : path.resolve(root);
    const base = normalizePath(absolute).replace(/\/$/, '');
    const insensitive = /^[A-Za-z]:/.test(base);
    const left = insensitive ? filePath.toLowerCase() : filePath;
    const right = insensitive ? base.toLowerCase() : base;
    return left.startsWith(`${right}/`) ? filePath.slice(base.length + 1) : filePath;
}

function rate(covered: number, total: number): Rate {
    return { covered, total, rate: total > 0 ? covered / total : 0 };
}

function summarizeFile(file: FileCoverage, displayPath: string): FileSummary {
    const lines = [...file.lines.values()];
    const functions = [...file.functions.values()];
    return {
        path: displayPath,
        lines: rate(lines.filter((hits) => hits > 0).length, lines.length),
        functions: rate(functions.filter((func) => func.count > 0).length, functions.length),
        branches: rate(
            functions.reduce((sum, func) => sum + func.branchesExecuted, 0),
            functions.reduce((sum, func) => sum + func.branchesTotal, 0),
        ),
    };
}

function listCtlFiles(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            listCtlFiles(fullPath, out);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ctl')) {
            out.push(normalizePath(fullPath));
        }
    }
}

export interface DetailedReport {
    report: CoverageReport;
    /** Merged coverage per reported (display) path. */
    details: Map<string, FileCoverage>;
}

/** Builds the summary report from merged coverage data. */
export function buildReport(data: CoverageData, options: ReportOptions = {}): CoverageReport {
    return buildDetailedReport(data, options).report;
}

/** Like {@link buildReport}, but also returns the merged per-file data for detailed formats. */
export function buildDetailedReport(
    data: CoverageData,
    options: ReportOptions = {},
): DetailedReport {
    const include = (options.include ?? []).map(globToRegExp);
    const exclude = (options.exclude ?? []).map(globToRegExp);
    const accepted = (displayPath: string): boolean =>
        (include.length === 0 || include.some((re) => re.test(displayPath))) &&
        !exclude.some((re) => re.test(displayPath));

    const files: FileSummary[] = [];
    const details = new Map<string, FileCoverage>();
    const covered = new Set<string>();
    for (const file of data.files.values()) {
        const displayPath = relativeTo(options.root, file.path);
        if (accepted(displayPath)) {
            files.push(summarizeFile(file, displayPath));
            details.set(displayPath, file);
            covered.add(displayPath.toLowerCase());
        }
    }
    files.sort((a, b) => a.path.localeCompare(b.path));

    const untested: string[] = [];
    for (const dir of options.sources ?? []) {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
            throw new CoverageInputError('sources directory does not exist', dir);
        }
        const found: string[] = [];
        listCtlFiles(path.resolve(dir), found);
        for (const file of found) {
            const displayPath = relativeTo(options.root, file);
            if (accepted(displayPath) && !covered.has(displayPath.toLowerCase())) {
                untested.push(displayPath);
            }
        }
    }
    untested.sort((a, b) => a.localeCompare(b));

    const sum = (pick: (f: FileSummary) => Rate): Rate =>
        rate(
            files.reduce((total, f) => total + pick(f).covered, 0),
            files.reduce((total, f) => total + pick(f).total, 0),
        );

    const report: CoverageReport = {
        schemaVersion: 1,
        tool: { name: '@winccoa-tools-pack/npm-winccoa-ctrl-coverage', version: VERSION },
        inputs: options.inputs ?? [],
        summary: {
            files: files.length,
            lines: sum((f) => f.lines),
            functions: sum((f) => f.functions),
            branches: sum((f) => f.branches),
        },
        files,
        untested: [...new Set(untested)],
        warnings: options.warnings ?? [],
    };
    return { report, details };
}
