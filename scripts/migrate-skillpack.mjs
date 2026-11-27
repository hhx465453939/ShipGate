#!/usr/bin/env node
/**
 * One-shot migration of the private full-dev skill package into ShipGate's
 * distributable layout: every skill becomes skills/<name>/SKILL.md, and the
 * slash commands / subagents / shared references come along.
 *
 * `--apply` is the complete, repeatable operation: copy → fix broken command
 * references → fill missing frontmatter → verify. Splitting those steps let a
 * re-run clobber post-migration fixes, so they live together by design.
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

const SKIP_SKILLS = new Set([
  '_archived',
  'shipgate',
  'shipgate-spec',
  'shipgate-quality',
  'shipgate-security',
  'shipgate-install',
]);

// The source wraps the path in backticks (`` `.claude/skills/x.md` ``); the
// replacement must consume those too, otherwise the rewrite nests backticks and
// produces broken markdown.
const LEGACY_REF = /`\.claude\/skills\/([a-z0-9-]+)\.md`/g;

function frontmatterIssue(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return 'no-frontmatter';
  if (!/^name\s*:/m.test(match[1])) return 'missing-name';
  if (!/^description\s*:/m.test(match[1])) return 'missing-description';
  return null;
}

function listMigratedSkills() {
  const dir = path.join(ROOT, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_SKILLS.has(e.name))
    .map((e) => e.name)
    .sort();
}

function countOf(dir) {
  const p = path.join(ROOT, dir);
  return fs.existsSync(p) ? fs.readdirSync(p).length : 0;
}

function copyFromSource() {
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
      fs.cpSync(from, path.join(ROOT, 'skills', entry.name), { recursive: true });
      copied.push(`skill-dir: ${entry.name}`);
    }
  }

  for (const name of ['commands', 'agents', 'references']) {
    const from = path.join(SRC, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(ROOT, name), { recursive: true });
    copied.push(`${name}: ${fs.readdirSync(from).length} files`);
  }

  for (const file of ['dev-profile.schema.json', 'prd.json.example', 'rule.json.example']) {
    const from = path.join(SRC, 'templates', file);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.join(ROOT, 'templates'), { recursive: true });
    fs.copyFileSync(from, path.join(ROOT, 'templates', file));
    copied.push(`template: ${file}`);
  }

  return copied;
}

/**
 * Commands were authored against the old single-file layout
 * (`.claude/skills/ai-spec.md`). After migration every skill is a directory and
 * the installed path differs per harness, so a hardcoded path is guaranteed to
 * break somewhere. Rewrite the reference to resolve by skill name instead.
 */
function fixCommandRefs() {
  const dir = path.join(ROOT, 'commands');
  if (!fs.existsSync(dir)) return [];
  const fixed = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const full = path.join(dir, file);
    const before = fs.readFileSync(full, 'utf8');
    const after = before.replace(LEGACY_REF, (_, name) => `skill \`${name}\``);
    if (after !== before) {
      fs.writeFileSync(full, after);
      fixed.push(file);
    }
  }
  return fixed;
}

function firstSentence(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('>'));
  return (line ?? '').slice(0, 180).replace(/\s+/g, ' ');
}

/**
 * The source package relied on the file name being the skill name. After
 * distribution the file is always SKILL.md, so a skill without `name:` loads
 * but never triggers — the silent failure this migration must prevent.
 */
function fixFrontmatter() {
  const fixed = [];

  for (const name of listMigratedSkills()) {
    const file = path.join(ROOT, 'skills', name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);

    if (!front) {
      const description = firstSentence(text) || `Use when working on ${name}.`;
      fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n${text}`);
      fixed.push(name);
      continue;
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
    if (!changed) continue;

    fs.writeFileSync(file, text.replace(front[0], `---\n${body}\n---`));
    fixed.push(name);
  }
  return fixed;
}

function apply() {
  const copied = copyFromSource();
  console.log(`从 ${SRC} 迁移 ${copied.length} 项`);

  const refs = fixCommandRefs();
  if (refs.length) console.log(`  修复命令内断裂引用 ${refs.length} 个：${refs.join(', ')}`);

  const fm = fixFrontmatter();
  if (fm.length) console.log(`  补齐 frontmatter ${fm.length} 个：${fm.join(', ')}`);

  return check();
}

function check() {
  const migrated = listMigratedSkills();
  const problems = [];

  for (const name of migrated) {
    const file = path.join(ROOT, 'skills', name, 'SKILL.md');
    if (!fs.existsSync(file)) {
      problems.push(`${name}: 缺少 SKILL.md`);
      continue;
    }
    const issue = frontmatterIssue(fs.readFileSync(file, 'utf8'));
    if (issue) problems.push(`${name}: ${issue}`);
  }

  for (const dir of ['commands', 'agents']) {
    if (countOf(dir) === 0) problems.push(`${dir}/ 为空`);
  }

  // A command pointing at the pre-migration single-file skill path is broken at
  // runtime: the skill is a directory now and lives elsewhere per harness.
  const cmdDir = path.join(ROOT, 'commands');
  if (fs.existsSync(cmdDir)) {
    for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md'))) {
      const hit = fs.readFileSync(path.join(cmdDir, file), 'utf8').match(/\.claude\/skills\/[a-z0-9-]+\.md/);
      if (hit) problems.push(`commands/${file}: 仍在引用旧路径 ${hit[0]}`);
    }
  }

  console.log(
    `\n技能目录 ${migrated.length + 5} 个（${migrated.length} full-dev + 5 shipgate）；命令 ${countOf('commands')}；subagent ${countOf('agents')}`,
  );
  if (problems.length === 0) {
    console.log('✔ 迁移体检通过');
    return 0;
  }
  console.error(`✖ ${problems.length} 处问题：`);
  for (const p of problems) console.error(`  - ${p}`);
  return 1;
}

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : null;
if (!mode) {
  console.error('用法：node scripts/migrate-skillpack.mjs --apply | --check [--src <dir>]');
  process.exit(2);
}
process.exit(mode === 'apply' ? apply() : check());
