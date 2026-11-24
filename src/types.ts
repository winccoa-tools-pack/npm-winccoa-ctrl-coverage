/** Executed/total counters with the resulting rate as a fraction in the range 0..1. */
export interface Rate {
    covered: number;
    total: number;
    /** `covered / total`, or `0` when `total` is `0`. */
    rate: number;
}

export interface FunctionCoverage {
    name: string;
    signature: string;
    /** Declaration line, `-1` for the synthetic `[init script globals]` function. */
    line: number;
    /** Number of calls. */
    count: number;
    branchesTotal: number;
    branchesExecuted: number;
}

export interface FileCoverage {
    /** Normalized path (forward slashes). */
    path: string;
    /** Line number to hit count (maximum over all merged inputs). */
    lines: Map<number, number>;
    /** Function key (`name|signature|line`) to merged function data. */
    functions: Map<string, FunctionCoverage>;
}

export interface CoverageData {
    files: Map<string, FileCoverage>;
}

export interface ParsedScript {
    path: string;
    lines: Map<number, number>;
    functions: FunctionCoverage[];
}

export interface ParseResult {
    scripts: ParsedScript[];
    warnings: string[];
}

export interface FileSummary {
    path: string;
    lines: Rate;
    functions: Rate;
    branches: Rate;
}

export interface CoverageSummary {
    /** Files with coverage data (untested files are not counted). */
    files: number;
    lines: Rate;
    functions: Rate;
    branches: Rate;
}

export interface CoverageReport {
    schemaVersion: 1;
    tool: { name: string; version: string };
    inputs: string[];
    summary: CoverageSummary;
    files: FileSummary[];
    /** Sources found by `sources` that have no coverage data; excluded from all rates. */
    untested: string[];
    warnings: string[];
}
