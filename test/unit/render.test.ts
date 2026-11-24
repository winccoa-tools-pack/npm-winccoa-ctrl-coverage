import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
    buildDetailedReport,
    readCoverage,
    renderCobertura,
    renderJson,
    renderMarkdown,
    renderText,
    VERSION,
} from '../../src';

const fixtures = path.join(__dirname, '..', 'fixtures');
const detailed = (): ReturnType<typeof buildDetailedReport> => {
    const { data, inputs, warnings } = readCoverage([path.join(fixtures, 'merge')]);
    return buildDetailedReport(data, { root: 'C:/proj', include: ['src/**'], inputs, warnings });
};

test('version constant matches package.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    assert.equal(require('../../package.json').version, VERSION);
});

test('text report shows the summary and per-file rows when verbose', () => {
    const { report } = detailed();
    const brief = renderText(report);
    assert.match(brief, /Lines: +4 \/ 6 \(66\.7%\)/);
    assert.match(brief, /Functions: +2 \/ 3 \(66\.7%\)/);
    assert.match(brief, /Branches: +1 \/ 2 \(50\.0%\)/);
    assert.doesNotMatch(brief, /src\/lib\/a\.ctl/);
    assert.match(renderText(report, true), /src\/lib\/a\.ctl/);
});

test('json report has a stable documented shape', () => {
    const parsed = JSON.parse(renderJson(detailed().report));
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.tool.version, VERSION);
    assert.deepEqual(Object.keys(parsed), [
        'schemaVersion',
        'tool',
        'inputs',
        'summary',
        'files',
        'untested',
        'warnings',
    ]);
    assert.deepEqual(parsed.files[0], {
        path: 'src/lib/a.ctl',
        lines: { covered: 4, total: 5, rate: 0.8 },
        functions: { covered: 2, total: 2, rate: 1 },
        branches: { covered: 1, total: 2, rate: 0.5 },
    });
});

test('markdown report contains the summary table and file rows', () => {
    const markdown = renderMarkdown(detailed().report, 'Unit coverage');
    assert.match(markdown, /^## Unit coverage/);
    assert.match(markdown, /\| Lines \| 4 \| 6 \| 66\.7% \|/);
    assert.match(markdown, /\| `src\/lib\/a\.ctl` \| 80\.0% \| 100\.0% \|/);
});

test('cobertura report is escaped, grouped per directory and deterministic', () => {
    const xml = renderCobertura({ ...detailed(), sourceRoot: 'C:/proj' });
    assert.match(
        xml,
        /<coverage version="1\.0" timestamp="0" lines-valid="6" lines-covered="4" line-rate="0\.6667"/,
    );
    assert.match(xml, /<package name="src\/lib" line-rate="0\.6667"/);
    assert.match(xml, /<class name="a\.ctl" filename="src\/lib\/a\.ctl" line-rate="0\.8000"/);
    assert.match(xml, /signature="int f1\(const string &amp;s\)" line-rate="1\.0"/);
    assert.match(xml, /<line number="6" hits="2" branch="false"\/>/);
    assert.equal(xml, renderCobertura({ ...detailed(), sourceRoot: 'C:/proj' }));
});

test('untested files and warnings are reported', () => {
    const { report } = detailed();
    report.untested.push('src/lib/missing.ctl');
    report.warnings.push('x.xml: skipped a <script> without <file path>');
    assert.match(renderText(report), /Untested files .*: 1\n {2}src\/lib\/missing\.ctl/);
    assert.match(renderText(report), /warning: x\.xml: skipped/);
    assert.match(renderMarkdown(report), /- `src\/lib\/missing\.ctl`/);
});
