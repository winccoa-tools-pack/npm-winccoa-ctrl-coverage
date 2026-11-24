import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_NAME = '@winccoa-tools-pack/npm-winccoa-ctrl-coverage';

/** Reads the version from the package.json that owns this module (works from src/ and dist/). */
function readVersion(): string {
    let dir = __dirname;
    for (let depth = 0; depth < 4; depth++) {
        const file = path.join(dir, 'package.json');
        if (fs.existsSync(file)) {
            const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
                name?: string;
                version?: string;
            };
            if (pkg.name === PACKAGE_NAME && pkg.version) return pkg.version;
        }
        dir = path.dirname(dir);
    }
    return '0.0.0';
}

export const VERSION = readVersion();
