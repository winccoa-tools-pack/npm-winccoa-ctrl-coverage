import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CoverageInputError, normalizePath, parseCoverageXml } from '../../src';

const fixtures = path.join(__dirname, '..', 'fixtures');
const read = (...parts: string[]): string => fs.readFileSync(path.join(fixtures, ...parts), 'utf8');

test('parses scripts, lines (max per line), functions and branches', () => {
    const { scripts, warnings } = parseCoverageXml(
        read('merge', 'CovRep_unit_WCCOActrl0.xml'),
        'unit.xml',
    );

    assert.deepEqual(warnings, []);
    assert.deepEqual(
        scripts.map((s) => s.path),
        ['C:/proj/src/lib/a.ctl', 'C:/WinCC_OA/3.21/scripts/libs/std.ctl'],
    );

    const a = scripts[0];
    assert.deepEqual(
        [...a.lines.entries()],
        [
            [1, 1],
            [2, 1],
            [3, 1],
            [6, 0],
            [7, 0],
        ],
    );
    assert.equal(a.functions.length, 2);
    assert.equal(a.functions[0].signature, 'int f1(const string &s)');
    assert.equal(a.functions[0].branchesTotal, 2);
    assert.equal(a.functions[0].branchesExecuted, 1);
    assert.equal(a.functions[1].count, 0);
});

test('a report without scripts is valid and empty', () => {
    const { scripts } = parseCoverageXml(read('empty', 'CovRep_empty_WCCILpmon1.xml'), 'empty.xml');
    assert.deepEqual(scripts, []);
});

test('ignores lines <= 0 (synthetic global init function)', () => {
    const xml = `<report><coverage><script><location><file path="x.ctl"/></location>
        <func line="-1" name="[init]" signature="void [init]()" count="1">[init]
        <node line="-1" count="1" type="id"/><node line="4" count="2" type="id"/></func>
        </script></coverage></report>`;
    const { scripts } = parseCoverageXml(xml, 'x.xml');
    assert.deepEqual([...scripts[0].lines.entries()], [[4, 2]]);
    assert.equal(scripts[0].functions[0].line, -1);
});

test('warns about and skips a script without file location', () => {
    const xml =
        '<report><coverage><script><node line="1" count="1" type="id"/></script></coverage></report>';
    const { scripts, warnings } = parseCoverageXml(xml, 'x.xml');
    assert.deepEqual(scripts, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /x\.xml: skipped a <script> without <file path>/);
});

for (const [name, file, message] of [
    ['unclosed elements', 'unclosed.xml', /unexpected closing tag <\/report>|is not closed/],
    [
        'non-numeric counters',
        'bad-count.xml',
        /<node> needs an integer attribute 'count'.*"many".*line 8/,
    ],
    ['garbage', 'garbage.xml', /malformed markup \(line 1\)/],
] as const) {
    test(`rejects ${name}`, () => {
        assert.throws(
            () => parseCoverageXml(read('malformed', file), file),
            (error: unknown) => {
                assert.ok(error instanceof CoverageInputError);
                assert.match(error.message, new RegExp(`^${file.replace('.', '\\.')}: `));
                assert.match(error.message, message);
                return true;
            },
        );
    });
}

for (const [name, xml] of [
    ['an empty document', ''],
    ['whitespace only', '  \n\n'],
    ['a foreign root element', '<html></html>'],
    ['two root elements', '<report></report><report></report>'],
    ['a nested script', '<report><coverage><script><script></script></script></coverage></report>'],
    [
        'a func outside a script',
        '<report><func line="1" name="a" signature="" count="1"></func></report>',
    ],
    ['a node outside a script', '<report><node line="1" count="1" type="id"/></report>'],
    ['a file without path', '<report><script><file/></script></report>'],
    ['a truncated document', '<report><coverage><script>'],
] as const) {
    test(`rejects ${name}`, () => {
        assert.throws(() => parseCoverageXml(xml, 'bad.xml'), CoverageInputError);
    });
}

test('normalizePath unifies separators and removes dot segments', () => {
    assert.equal(normalizePath('C:\\a\\b/../c\\.\\d.ctl'), 'C:/a/c/d.ctl');
    assert.equal(normalizePath('/usr//lib/x.ctl'), '/usr/lib/x.ctl');
    assert.equal(normalizePath('a\\b.ctl'), 'a/b.ctl');
});
