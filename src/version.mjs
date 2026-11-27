import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const VERSION = pkg.version;
export const NAME = pkg.name;
export const REPO = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? '';

export function packageRoot() {
  // fileURLToPath, not URL.pathname: on Windows the latter yields "/E:/repo/...",
  // and path.resolve() then prepends the current drive, producing "E:\E:\repo".
  return fileURLToPath(new URL('..', import.meta.url));
}
