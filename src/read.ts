import fs from 'node:fs';
import path from 'node:path';
import { CoverageInputError } from './errors';
import { normalizePath, parseCoverageXml } from './parse';
import { CoverageData, FileCoverage, FunctionCoverage, ParsedScript } from './types';

const COVERAGE_FILE = /^(CovRep|CoverageReport)_.*\.xml$/i;

export interface ReadResult {
    data: CoverageData;
    /** Coverage files that were read. */
    inputs: string[];
    warnings: string[];
}

export function createCoverageData(): CoverageData {
    return { files: new Map() };
}

function functionKey(func: FunctionCoverage): string {
    return `${func.name}|${func.signature}|${func.line}`;
}

/** Merges one parsed script into `data`: line hits and function counts keep the maximum. */
export function mergeScript(data: CoverageData, script: ParsedScript): void {
    let file: FileCoverage | undefined = data.files.get(script.path);
    if (!file) {
        file = { path: script.path, lines: new Map(), functions: new Map() };
        data.files.set(script.path, file);
    }

    for (const [line, hits] of script.lines) {
        file.lines.set(line, Math.max(file.lines.get(line) ?? 0, hits));
    }

    for (const func of script.functions) {
        const key = functionKey(func);
        const existing = file.functions.get(key);
        file.functions.set(
            key,
            existing
                ? {
                      ...existing,
                      count: Math.max(existing.count, func.count),
                      branchesTotal: Math.max(existing.branchesTotal, func.branchesTotal),
                      branchesExecuted: Math.max(existing.branchesExecuted, func.branchesExecuted),
                  }
                : { ...func },
        );
    }
}

function collectCoverageFiles(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectCoverageFiles(fullPath, out);
        } else if (entry.isFile() && COVERAGE_FILE.test(entry.name)) {
            out.push(fullPath);
        }
    }
}

/** Resolves files and directories (searched recursively for `CovRep_*.xml`) to coverage files. */
export function findCoverageFiles(inputs: string[]): string[] {
    const files: string[] = [];
    for (const input of inputs) {
        const resolved = path.resolve(input);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(resolved);
        } catch {
            throw new CoverageInputError('input does not exist', input);
        }

        if (stat.isDirectory()) {
            const found: string[] = [];
            collectCoverageFiles(resolved, found);
            if (found.length === 0) {
                throw new CoverageInputError('no CovRep_*.xml coverage files found', input);
            }
            files.push(...found.sort());
        } else {
            files.push(resolved);
        }
    }
    return [...new Set(files)];
}

/**
 * Reads, parses and merges all coverage files. The inputs are never modified.
 *
 * @throws CoverageInputError on the first unreadable or malformed file; no partial result is returned.
 */
export function readCoverage(inputs: string[]): ReadResult {
    if (inputs.length === 0) {
        throw new CoverageInputError('no coverage input given');
    }

    const files = findCoverageFiles(inputs);
    const data = createCoverageData();
    const warnings: string[] = [];

    for (const file of files) {
        let xml: string;
        try {
            xml = fs.readFileSync(file, 'utf8');
        } catch (error) {
            throw new CoverageInputError(`cannot read file (${(error as Error).message})`, file);
        }

        const parsed = parseCoverageXml(xml, file);
        warnings.push(...parsed.warnings);
        for (const script of parsed.scripts) {
            mergeScript(data, script);
        }
    }

    return { data, inputs: files.map(normalizePath), warnings };
}
