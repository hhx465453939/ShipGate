#!/usr/bin/env node
/**
 * One-shot migration of the private full-dev skill package into ShipGate's
 * distributable layout: every skill becomes skills/<name>/SKILL.md, and the
 * slash commands / subagents / shared references come along.
 *
 * Usage:
 *   node scripts/migrate-skillpack.mjs --apply [--src <dir>]
 *   node scripts/migrate-skillpack.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SRC = '/mnt/500G-1/Development/Claude_skill_pool/package/full-dev-脚手架/.claude';
const SRC = process.argv.includes('--src')
  ? process.argv[process.argv.indexOf('--src') + 1]
  : process.env.SKILLPACK_SRC ?? DEFAULT_SRC;

const SKIP_SKILLS = new Set(['_archived', 'shipgate', 'shipgate-spec', 'shipgate-quality', 'shipgate-security', 'shipgate-install']);

function frontmatterIssue(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return 'no-frontmatter';
  if (!/^name\s*:/m.test(match[1])) return 'missing-name';
  if (!/^description\s*:/m.test(match[1])) return 'missing-description';
  return null;
}

function listSkillDirs(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_SKILLS.has(e.name))
    .map((e) => e.name)
    .sort();
}

function apply() {
  const srcSkills = path.join(SRC, 'skills');
  if (!fs.existsSync(srcSkills)) throw new Error(`源技能目录不存在：${srcSkills}`);

  const copied = [];
  for (const entry of fs.readdirSync(srcSkills, { withFileTypes: true })) {
    if (SKIP_SKILLS.has(entry.name)) continue;
    const from = path.join(srcSkills, entry.name);

    if (entry.isFile() && entry.name.endsWith('.md')) {
      const name = entry.name.replace(/\.md$/, '');
      const dest = path.join(ROOT, 'skills', name, 'SKILL.md');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
      copied.push(`skill: ${name}`);
    } else if (entry.isDirectory()) {
      const dest = path.join(ROOT, 'skills', entry.name);
      fs.cpSync(from, dest, { recursive: true });
      copied.push(`skill-dir: ${entry.name}`);
    }
  }

  for (const [name, target] of [
    ['commands', 'commands'],
    ['agents', 'agents'],
    ['references', 'references'],
  ]) {
    const from = path.join(SRC, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(ROOT, target), { recursive: true });
    copied.push(`${name}: ${fs.readdirSync(from).length} files`);
  }

  const templates = [['dev-profile.schema.json'], ['prd.json.example'], ['rule.json.example']];
  for (const [file] of templates) {
    const from = path.join(SRC, 'templates', file);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.join(ROOT, 'templates'), { recursive: true });
      fs.copyFileSync(from, path.join(ROOT, 'templates', file));
      copied.push(`template: ${file}`);
    }
  }

  console.log(`从 ${SRC} 迁移 ${copied.length} 项：`);
  for (const line of copied) console.log(`  ✔ ${line}`);
  return check();
}

function check() {
  const dirs = listSkillDirs(ROOT);
  const problems = [];

  for (const name of dirs) {
    const file = path.join(ROOT, 'skills', name, 'SKILL.md');
    if (!fs.existsSync(file)) {
      problems.push(`${name}: 缺少 SKILL.md`);
      continue;
    }
    const issue = frontmatterIssue(fs.readFileSync(file, 'utf8'));
    if (issue) problems.push(`${name}: ${issue}`);
  }

  for (const dir of ['commands', 'agents']) {
    const p = path.join(ROOT, dir);
    const count = fs.existsSync(p) ? fs.readdirSync(p).length : 0;
    if (count === 0) problems.push(`${dir}/ 为空`);
  }

  console.log(`\n技能目录 ${dirs.length} 个（含 5 个 shipgate-*/）；命令 ${countOf('commands')}；subagent ${countOf('agents')}`);
  if (problems.length === 0) {
    console.log('✔ frontmatter 体检通过');
    return 0;
  }
  console.error(`✖ ${problems.length} 处问题：`);
  for (const p of problems) console.error(`  - ${p}`);
  return 1;
}

function countOf(dir) {
  const p = path.join(ROOT, dir);
  return fs.existsSync(p) ? fs.readdirSync(p).length : 0;
}

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : null;
if (!mode) {
  console.error('用法：node scripts/migrate-skillpack.mjs --apply | --check [--src <dir>]');
  process.exit(2);
}
process.exit(mode === 'apply' ? apply() : check());
