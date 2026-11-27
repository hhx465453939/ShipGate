import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function exists(p) {
  return fs.existsSync(p);
}

export function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

export function readIfExists(p) {
  return exists(p) ? readText(p) : null;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function writeText(p, text) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, text);
}

export function listDir(p) {
  if (!exists(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true });
}

export function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function hashFile(p) {
  return hashText(fs.readFileSync(p));
}

export function copyTree(src, dest, { skip = [] } = {}) {
  const written = [];
  ensureDir(dest);
  for (const entry of listDir(src)) {
    if (skip.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      written.push(...copyTree(from, to, { skip }));
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
      written.push(to);
    }
  }
  return written;
}

export function removeDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One backup per file per day. Backups of user-authored entry docs are the only
 * safety net for inject/revoke, so the name is deterministic: <file>.shipgate-bak.<YYYYMMDD>
 */
export function backupOnce(file) {
  if (!exists(file)) return null;
  const target = `${file}.shipgate-bak.${today()}`;
  if (exists(target)) return target;
  fs.copyFileSync(file, target);
  return target;
}

export function backupList(file) {
  const dir = path.dirname(file);
  const base = path.basename(file) + '.shipgate-bak.';
  return listDir(dir)
    .filter((e) => e.isFile() && e.name.startsWith(base))
    .map((e) => path.join(dir, e.name))
    .sort();
}

export function latestBackup(file) {
  return backupList(file).at(-1) ?? null;
}

/**
 * The oldest backup is the only one taken before ShipGate ever wrote to the
 * file. `revoke` must use it: restoring the latest would put back an older
 * injected block instead of the user's original document.
 */
export function earliestBackup(file) {
  return backupList(file)[0] ?? null;
}
