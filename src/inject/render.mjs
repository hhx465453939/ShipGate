import path from 'node:path';
import { packageRoot } from '../version.mjs';
import { backupOnce, readIfExists, readText, writeText } from '../lib/fsx.mjs';

const BLOCK_RE = /<!-- shipgate:begin v\d+ -->[\s\S]*?<!-- shipgate:end -->/;

const CURSOR_FRONTMATTER = [
  '---',
  'description: ShipGate gate chain (spec / quality / security / ship)',
  'globs: ["**/*"]',
  'alwaysApply: true',
  '---',
  '',
].join('\n');

export function templatePath() {
  return path.join(packageRoot(), 'templates', 'agents-snippet.md');
}

export function renderBlock({ version, min }) {
  const template = readText(templatePath());
  return template
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{MIN}}', String(min))
    .trim();
}

/**
 * Idempotent by construction: the block carries no timestamp, so the same
 * inputs always produce byte-identical output. Content outside the markers is
 * never rewritten — only appended to when no block exists yet.
 */
export function upsertBlock(file, block, { dryRun = false, frontmatter = null } = {}) {
  const current = readIfExists(file);

  if (current === null) {
    const body = (frontmatter ? frontmatter : '') + block + '\n';
    if (!dryRun) writeText(file, body);
    return { action: 'created', file };
  }

  if (BLOCK_RE.test(current)) {
    const next = current.replace(BLOCK_RE, block);
    if (next === current) return { action: 'unchanged', file };
    if (!dryRun) {
      backupOnce(file);
      writeText(file, next);
    }
    return { action: 'updated', file };
  }

  const next = current.replace(/\s*$/, '\n\n') + block + '\n';
  if (!dryRun) {
    backupOnce(file);
    writeText(file, next);
  }
  return { action: 'appended', file };
}

export function blockVersion(text) {
  const match = text?.match(/<!-- shipgate:begin (v\d+) -->/);
  return match ? match[1] : null;
}

export function cursorFrontmatter() {
  return CURSOR_FRONTMATTER;
}
