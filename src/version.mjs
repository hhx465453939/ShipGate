import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const VERSION = pkg.version;
export const NAME = pkg.name;
export const REPO = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? '';

export function packageRoot() {
  return path.resolve(new URL('..', import.meta.url).pathname);
}
