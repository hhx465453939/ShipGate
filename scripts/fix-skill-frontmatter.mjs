#!/usr/bin/env node
/**
 * Adds the `name:` field to SKILL.md frontmatter when it is missing.
 *
 * Why: the source skill package relied on the file name being the skill name.
 * After distribution the file is always `SKILL.md`, so the harness has no way
 * to derive the name — a skill without `name:` loads but never triggers.
 * Run after migrate-skillpack, then `--check` must be clean.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');

function firstSentence(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('>'));
  return (line ?? '').slice(0, 180).replace(/\s+/g, ' ');
}

function fixOne(name) {
  const file = path.join(SKILLS, name, 'SKILL.md');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!front) {
    const description = firstSentence(text) || `Use when working on ${name}.`;
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n${text}`);
    return 'inserted-frontmatter';
  }

  let body = front[1];
  let changed = false;

  if (!/^name\s*:/m.test(body)) {
    body = `name: ${name}\n${body}`;
    changed = true;
  }
  if (!/^description\s*:/m.test(body)) {
    body = `${body}\ndescription: ${firstSentence(text) || `Use when working on ${name}.`}`;
    changed = true;
  }

  if (!changed) return null;
  fs.writeFileSync(file, text.replace(front[0], `---\n${body}\n---`));
  return 'filled-fields';
}

const report = [];
for (const entry of fs.readdirSync(SKILLS, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const result = fixOne(entry.name);
  if (result) report.push(`${entry.name}: ${result}`);
}

if (report.length === 0) console.log('✔ 所有 SKILL.md 的 frontmatter 已完整，无需修改');
else {
  console.log(`✔ 修正 ${report.length} 个：`);
  for (const line of report) console.log(`  - ${line}`);
}
