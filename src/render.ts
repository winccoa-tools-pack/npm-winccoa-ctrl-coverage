import path from 'node:path';
import { DetailedReport } from './report';
import { CoverageReport, Rate } from './types';

function percent(value: Rate): string {
    return `${(value.rate * 100).toFixed(1)}%`;
}

function counts(value: Rate): string {
    return `${value.covered} / ${value.total} (${percent(value)})`;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Console report; `verbose` adds one row per file. */
export function renderText(report: CoverageReport, verbose = false): string {
    const out: string[] = ['WinCC OA CTRL coverage report', '='.repeat(60)];
    if (verbose) {
        out.push(`${'File'.padEnd(60)} ${'Lines'.padStart(14)} ${'Funcs'.padStart(14)}`);
        for (const file of report.files) {
            out.push(
                `${file.path.padEnd(60)} ${counts(file.lines).padStart(14)} ${counts(file.functions).padStart(14)}`,
            );
        }
        out.push('-'.repeat(60));
    }
    out.push(
        `Input files: ${report.inputs.length}`,
        `Files:       ${report.summary.files}`,
        `Lines:       ${counts(report.summary.lines)}`,
        `Functions:   ${counts(report.summary.functions)}`,
        `Branches:    ${counts(report.summary.branches)}`,
    );
    if (report.untested.length > 0) {
        out.push(
            '',
            `Untested files (no coverage data, not part of the rates): ${report.untested.length}`,
            ...report.untested.map((file) => `  ${file}`),
        );
    }
    if (report.warnings.length > 0) {
        out.push('', ...report.warnings.map((warning) => `warning: ${warning}`));
    }
    return `${out.join('\n')}\n`;
}

export function renderJson(report: CoverageReport): string {
    return `${JSON.stringify(report, null, 2)}\n`;
}

/** GitHub-flavoured Markdown, suitable for `$GITHUB_STEP_SUMMARY` or a PR comment. */
export function renderMarkdown(report: CoverageReport, title = 'CTRL coverage'): string {
    const out: string[] = [
        `## ${title}`,
        '',
        '| Metric | Covered | Total | Rate |',
        '| --- | ---: | ---: | ---: |',
        `| Lines | ${report.summary.lines.covered} | ${report.summary.lines.total} | ${percent(report.summary.lines)} |`,
        `| Functions | ${report.summary.functions.covered} | ${report.summary.functions.total} | ${percent(report.summary.functions)} |`,
        `| Branches | ${report.summary.branches.covered} | ${report.summary.branches.total} | ${percent(report.summary.branches)} |`,
        '',
        `${report.summary.files} file(s) with coverage data from ${report.inputs.length} input file(s).`,
    ];
    if (report.files.length > 0) {
        out.push('', '| File | Lines | Functions |', '| --- | ---: | ---: |');
        for (const file of report.files) {
            out.push(`| \`${file.path}\` | ${percent(file.lines)} | ${percent(file.functions)} |`);
        }
    }
    if (report.untested.length > 0) {
        out.push(
            '',
            `**Untested files** (no coverage data, not part of the rates): ${report.untested.length}`,
            '',
            ...report.untested.map((file) => `- \`${file}\``),
        );
    }
    if (report.warnings.length > 0) {
        out.push('', ...report.warnings.map((warning) => `> warning: ${warning}`));
    }
    return `${out.join('\n')}\n`;
}

export interface CoberturaInput extends DetailedReport {
    /** Written to `<source>`; rates are fractions (0..1). */
    sourceRoot?: string;
    /** Written to the `timestamp` attribute (epoch); `0` keeps the output deterministic. */
    timestamp?: number;
}

/** Cobertura XML (coverage-04 DTD) with one package per directory. */
export function renderCobertura(input: CoberturaInput): string {
    const { report, details } = input;
    const packages = new Map<string, typeof report.files>();
    for (const file of report.files) {
        const dir = path.posix.dirname(file.path);
        const list = packages.get(dir) ?? [];
        list.push(file);
        packages.set(dir, list);
    }

    const rateOf = (value: Rate): string => value.rate.toFixed(4);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">',
        `<coverage version="1.0" timestamp="${input.timestamp ?? 0}" lines-valid="${report.summary.lines.total}" lines-covered="${report.summary.lines.covered}" line-rate="${rateOf(report.summary.lines)}" branches-valid="${report.summary.branches.total}" branches-covered="${report.summary.branches.covered}" branch-rate="${rateOf(report.summary.branches)}" complexity="0">`,
        `  <sources><source>${escapeXml(input.sourceRoot ?? '.')}</source></sources>`,
        '  <packages>',
    ];

    for (const [dir, files] of [...packages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const total = files.reduce((sum, f) => sum + f.lines.total, 0);
        const covered = files.reduce((sum, f) => sum + f.lines.covered, 0);
        lines.push(
            `    <package name="${escapeXml(dir)}" line-rate="${(total > 0 ? covered / total : 0).toFixed(4)}" branch-rate="0" complexity="0">`,
            '      <classes>',
        );
        for (const file of files) {
            const detail = details.get(file.path);
            lines.push(
                `        <class name="${escapeXml(path.posix.basename(file.path))}" filename="${escapeXml(file.path)}" line-rate="${rateOf(file.lines)}" branch-rate="0" complexity="0">`,
                '          <methods>',
            );
            for (const func of detail?.functions.values() ?? []) {
                lines.push(
                    `            <method name="${escapeXml(func.name)}" signature="${escapeXml(func.signature)}" line-rate="${func.count > 0 ? '1.0' : '0.0'}" branch-rate="0"/>`,
                );
            }
            lines.push('          </methods>', '          <lines>');
            for (const [line, hits] of [...(detail?.lines ?? [])].sort((a, b) => a[0] - b[0])) {
                lines.push(`            <line number="${line}" hits="${hits}" branch="false"/>`);
            }
            lines.push('          </lines>', '        </class>');
        }
        lines.push('      </classes>', '    </package>');
    }

    lines.push('  </packages>', '</coverage>');
    return `${lines.join('\n')}\n`;
}
