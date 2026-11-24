import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = path.join(__dirname, '..', '..');
const fixtures = path.join(root, 'test', 'fixtures');

function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', path.join(root, 'src', 'cli.ts'), ...args],
        { encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('prints the report and writes json, markdown and cobertura', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'covcli-'));
    try {
        const result = cli(
            path.join(fixtures, 'merge'),
            '--root',
            'C:/proj',
            '--include',
            'src/**',
            '--json',
            path.join(out, 'nested', 'coverage.json'),
            '--markdown',
            path.join(out, 'coverage.md'),
            '--cobertura',
            path.join(out, 'cobertura.xml'),
        );

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Lines: +4 \/ 6 \(66\.7%\)/);
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(out, 'nested', 'coverage.json'), 'utf8')).summary
                .files,
            2,
        );
        assert.match(fs.readFileSync(path.join(out, 'coverage.md'), 'utf8'), /^## CTRL coverage/);
        assert.match(
            fs.readFileSync(path.join(out, 'cobertura.xml'), 'utf8'),
            /<coverage version="1\.0"/,
        );
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('exits 2 and writes no report for malformed input', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'covcli-'));
    try {
        const json = path.join(out, 'coverage.json');
        const result = cli(path.join(fixtures, 'malformed', 'bad-count.xml'), '--json', json);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /bad-count\.xml: <node> needs an integer attribute 'count'/);
        assert.equal(result.stdout, '');
        assert.equal(fs.existsSync(json), false);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('exits 2 when nothing matches unless --allow-empty is given', () => {
    const empty = path.join(fixtures, 'empty');
    const failing = cli(empty);
    assert.equal(failing.status, 2);
    assert.match(failing.stderr, /no coverage data for any file/);

    const allowed = cli(empty, '--allow-empty');
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /Files: +0/);
});

test('exits 2 when the filter removes every file', () => {
    const result = cli(path.join(fixtures, 'merge'), '--include', 'nothing/**');
    assert.equal(result.status, 2);
});

test('enforces minimum rates with exit code 1', () => {
    const merge = path.join(fixtures, 'merge');
    const failing = cli(merge, '--min-lines', '99', '--quiet');
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /line coverage 71\.4% is below 99%/);
    assert.equal(failing.stdout, '');

    assert.equal(cli(merge, '--min-lines', '70', '--min-functions', '70', '--quiet').status, 0);
    assert.equal(cli(merge, '--min-functions', '90', '--quiet').status, 1);
});

test('rejects bad usage with exit code 2', () => {
    assert.equal(cli().status, 2);
    assert.match(cli('--bogus', 'x').stderr, /unknown option --bogus/);
    assert.match(cli('x', '--json').stderr, /option --json needs a value/);
    assert.match(cli('x', '--min-lines', '120').stderr, /percentage between 0 and 100/);
    assert.match(cli('does-not-exist').stderr, /does-not-exist: input does not exist/);
});

test('--help and --version exit 0', () => {
    assert.match(cli('--help').stdout, /Usage: winccoa-ctrl-coverage/);
    assert.match(cli('--version').stdout, /^\d+\.\d+\.\d+\n$/);
});
