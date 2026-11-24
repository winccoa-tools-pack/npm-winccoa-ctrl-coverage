export { CoverageInputError } from './errors';
export { parseCoverageXml, normalizePath } from './parse';
export { readCoverage, findCoverageFiles, mergeScript, createCoverageData } from './read';
export type { ReadResult } from './read';
export { buildReport, buildDetailedReport, globToRegExp } from './report';
export type { ReportOptions, DetailedReport } from './report';
export { renderText, renderJson, renderMarkdown, renderCobertura } from './render';
export type { CoberturaInput } from './render';
export type {
    CoverageData,
    CoverageReport,
    CoverageSummary,
    FileCoverage,
    FileSummary,
    FunctionCoverage,
    ParsedScript,
    ParseResult,
    Rate,
} from './types';
export { VERSION } from './version';
