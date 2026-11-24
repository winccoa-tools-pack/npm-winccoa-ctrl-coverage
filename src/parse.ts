import { CoverageInputError } from './errors';
import { FunctionCoverage, ParsedScript, ParseResult } from './types';

const TOKEN =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const INTEGER = /^-?\d+$/;

function unescapeXml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function parseAttributes(raw: string): Map<string, string> {
    const attributes = new Map<string, string>();
    for (const match of raw.matchAll(ATTRIBUTE)) {
        attributes.set(match[1], unescapeXml(match[2] ?? match[3] ?? ''));
    }
    return attributes;
}

function normalizePath(filePath: string): string {
    const slashed = filePath.replace(/\\/g, '/');
    const drive = /^[A-Za-z]:/.exec(slashed)?.[0] ?? '';
    const rest = slashed.slice(drive.length);
    const parts: string[] = [];
    for (const part of rest.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
            parts.pop();
        } else {
            parts.push(part);
        }
    }
    return drive + (rest.startsWith('/') ? '/' : '') + parts.join('/');
}

export { normalizePath };

/**
 * Strictly parses one `CovRep_*.xml` document written by `WCCOActrl -coveragereportfile`.
 *
 * Structure: `report > coverage > script > (location > file[path], func > (node*, branches))`.
 * `node` elements are attributed to the enclosing script, so lines outside a function
 * (e.g. script globals) are counted. A document without any `script` is valid but empty.
 *
 * @throws CoverageInputError for empty input, mismatched tags, stray markup or non-numeric counters.
 */
export function parseCoverageXml(xml: string, source: string): ParseResult {
    const fail = (message: string, offset: number): never => {
        const line = xml.slice(0, offset).split('\n').length;
        throw new CoverageInputError(`${message} (line ${line})`, source);
    };

    const integer = (
        attributes: Map<string, string>,
        element: string,
        name: string,
        offset: number,
    ): number => {
        const value = attributes.get(name);
        if (value === undefined || !INTEGER.test(value.trim())) {
            return fail(
                `<${element}> needs an integer attribute '${name}', got ${JSON.stringify(value)}`,
                offset,
            );
        }
        return parseInt(value, 10);
    };

    const scripts: ParsedScript[] = [];
    const warnings: string[] = [];
    const stack: string[] = [];
    let rootSeen = false;
    let script:
        { path?: string; lines: Map<number, number>; functions: FunctionCoverage[] } | undefined;
    let func: FunctionCoverage | undefined;
    let last = 0;

    TOKEN.lastIndex = 0;
    for (let match = TOKEN.exec(xml); match !== null; match = TOKEN.exec(xml)) {
        if (xml.indexOf('<', last) < match.index) {
            fail('malformed markup', xml.indexOf('<', last));
        }
        last = match.index + match[0].length;

        const name = match[2];
        if (name === undefined) continue; // comment or processing instruction

        const closing = match[1] === '/';
        const selfClosing = match[4] === '/';

        if (closing) {
            if (stack.pop() !== name) {
                fail(`unexpected closing tag </${name}>`, match.index);
            }
            if (name === 'func' && func && script) {
                script.functions.push(func);
                func = undefined;
            } else if (name === 'script' && script) {
                if (script.path === undefined) {
                    warnings.push(`${source}: skipped a <script> without <file path>`);
                } else {
                    scripts.push({
                        path: script.path,
                        lines: script.lines,
                        functions: script.functions,
                    });
                }
                script = undefined;
            }
            continue;
        }

        if (stack.length === 0) {
            if (rootSeen || name !== 'report') {
                fail(`expected a single <report> root element, found <${name}>`, match.index);
            }
            rootSeen = true;
        }

        const attributes = parseAttributes(match[3]);
        switch (name) {
            case 'script':
                if (script) fail('nested <script>', match.index);
                script = { lines: new Map(), functions: [] };
                break;
            case 'file': {
                if (!script) break;
                const filePath = attributes.get('path');
                if (!filePath) fail('<file> needs a path attribute', match.index);
                script.path ??= normalizePath(filePath as string);
                break;
            }
            case 'func': {
                if (!script) fail('<func> outside <script>', match.index);
                func = {
                    name: attributes.get('name') ?? '',
                    signature: attributes.get('signature') ?? '',
                    line: integer(attributes, 'func', 'line', match.index),
                    count: integer(attributes, 'func', 'count', match.index),
                    branchesTotal: 0,
                    branchesExecuted: 0,
                };
                if (selfClosing) {
                    script?.functions.push(func);
                    func = undefined;
                }
                break;
            }
            case 'branches': {
                const total = integer(attributes, 'branches', 'total', match.index);
                const executed = integer(attributes, 'branches', 'executed', match.index);
                if (func) {
                    func.branchesTotal = total;
                    func.branchesExecuted = executed;
                }
                break;
            }
            case 'node': {
                if (!script) fail('<node> outside <script>', match.index);
                const line = integer(attributes, 'node', 'line', match.index);
                const count = integer(attributes, 'node', 'count', match.index);
                if (line > 0 && script) {
                    script.lines.set(line, Math.max(script.lines.get(line) ?? 0, count));
                }
                break;
            }
            default:
                break;
        }

        if (!selfClosing) stack.push(name);
    }

    if (xml.indexOf('<', last) !== -1) {
        fail('malformed markup', xml.indexOf('<', last));
    }
    if (!rootSeen) {
        throw new CoverageInputError(
            'no <report> element found (empty or not a coverage file)',
            source,
        );
    }
    if (stack.length > 0) {
        throw new CoverageInputError(
            `unexpected end of file, <${stack[stack.length - 1]}> is not closed`,
            source,
        );
    }

    return { scripts, warnings };
}
