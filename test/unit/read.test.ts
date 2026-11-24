import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildReport, CoverageInputError, globToRegExp, readCoverage } from '../../src';

const fixtures = path.join(__dirname, '..', 'fixtures');

test('merges multiple inputs: max hits per line, max count per function', () => {
    const { data, inputs } = readCoverage([path.join(fixtures, 'merge')]);
    assert.equal(inputs.length, 2);

    const a = data.files.get('C:/proj/src/lib/a.ctl');
    assert.ok(a);
    assert.equal(a.lines.get(6), 2);
    assert.equal(a.lines.get(7), 0);
    const f2 = [...a.functions.values()].find((f) => f.name === 'f2');
    assert.equal(f2?.count, 2);
});

test('reads explicit files regardless of their name and de-duplicates inputs', () => {
    const file = path.join(fixtures, 'merge', 'CovRep_cli_WCCOActrl0.xml');
    const { inputs } = readCoverage([file, file]);
    assert.equal(inputs.length, 1);
});

test('rejects missing inputs, empty directories and malformed files', () => {
    assert.throws(() => readCoverage([]), CoverageInputError);
    assert.throws(
        () => readCoverage([path.join(fixtures, 'does-not-exist')]),
        /does-not-exist: input does not exist/,
    );

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covrep-'));
    try {
        assert.throws(() => readCoverage([dir]), /no CovRep_\*\.xml coverage files found/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }

    assert.throws(
        () =>
            readCoverage([
                path.join(fixtures, 'merge'),
                path.join(fixtures, 'malformed', 'unclosed.xml'),
            ]),
        /unclosed\.xml/,
    );
});

test('summary rates over all files', () => {
    const { report } = { report: buildReport(readCoverage([path.join(fixtures, 'merge')]).data) };
    assert.equal(report.summary.files, 3);
    assert.deepEqual(report.summary.lines, { covered: 5, total: 7, rate: 5 / 7 });
    assert.deepEqual(report.summary.functions, { covered: 3, total: 4, rate: 3 / 4 });
    assert.deepEqual(report.summary.branches, { covered: 1, total: 2, rate: 0.5 });
});

test('root makes paths relative; include/exclude filter product libraries', () => {
    const { data } = readCoverage([path.join(fixtures, 'merge')]);
    const report = buildReport(data, {
        root: 'C:/proj',
        include: ['src/**'],
        exclude: ['**/b.ctl'],
    });

    assert.deepEqual(
        report.files.map((f) => f.path),
        ['src/lib/a.ctl'],
    );
    assert.deepEqual(report.summary.lines, { covered: 4, total: 5, rate: 0.8 });
    assert.deepEqual(report.summary.functions, { covered: 2, total: 2, rate: 1 });
});

test('files outside the root keep their absolute path', () => {
    const { data } = readCoverage([path.join(fixtures, 'merge')]);
    const paths = buildReport(data, { root: 'C:/proj' }).files.map((f) => f.path);
    assert.deepEqual(paths, [
        'C:/WinCC_OA/3.21/scripts/libs/std.ctl',
        'src/lib/a.ctl',
        'src/lib/b.ctl',
    ]);
});

test('an empty report has zero rates and no files', () => {
    const { data } = readCoverage([path.join(fixtures, 'empty')]);
    const report = buildReport(data);
    assert.equal(report.summary.files, 0);
    assert.deepEqual(report.summary.lines, { covered: 0, total: 0, rate: 0 });
});

test('sources without coverage data are listed as untested and not counted', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covsrc-'));
    try {
        const lib = path.join(dir, 'lib');
        fs.mkdirSync(path.join(lib, 'sub'), { recursive: true });
        for (const name of ['a.ctl', 'c.ctl', path.join('sub', 'd.ctl')]) {
            fs.writeFileSync(path.join(lib, name), '// ctl');
        }
        fs.writeFileSync(path.join(lib, 'notes.txt'), 'not a ctl file');

        const aPath = path.join(lib, 'a.ctl').replace(/\\/g, '/');
        const xml = `<report><coverage><script><location><file path="${aPath}"/></location>
            <func line="1" name="f" signature="void f()" count="1">f
            <node line="2" count="1" type="id"/></func></script></coverage></report>`;
        fs.writeFileSync(path.join(dir, 'CovRep_x.xml'), xml);

        const { data } = readCoverage([dir]);
        const report = buildReport(data, { root: dir, sources: [lib] });

        assert.deepEqual(report.untested, ['lib/c.ctl', 'lib/sub/d.ctl']);
        assert.deepEqual(
            report.files.map((f) => f.path),
            ['lib/a.ctl'],
        );
        assert.equal(report.summary.files, 1);
        assert.throws(
            () => buildReport(data, { sources: [path.join(dir, 'missing')] }),
            CoverageInputError,
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('globToRegExp supports *, ** and ?', () => {
    assert.ok(globToRegExp('src/**').test('src/a/b.ctl'));
    assert.ok(globToRegExp('**/b.ctl').test('b.ctl'));
    assert.ok(globToRegExp('**/b.ctl').test('src/lib/b.ctl'));
    assert.ok(globToRegExp('src/*.ctl').test('src/a.ctl'));
    assert.ok(!globToRegExp('src/*.ctl').test('src/lib/a.ctl'));
    assert.ok(globToRegExp('a?.ctl').test('ab.ctl'));
    assert.ok(!globToRegExp('a?.ctl').test('a/.ctl'));
    assert.ok(!globToRegExp('a.ctl').test('aXctl'));
});
