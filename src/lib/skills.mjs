import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../version.mjs';
import { backupOnce, copyTree, exists, hashFile, listDir, readText, removeDir, today } from './fsx.mjs';
import { stateDir } from './state.mjs';

/** Agent Skills spec limits — the same thresholds pi enforces on load. */
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
const SKILL_NAME_RE = /^[a-z0-9-]+$/;

export function skillsSource() {
  return path.join(packageRoot(), 'skills');
}

export function commandsSource() {
  return path.join(packageRoot(), 'commands');
}

export function agentsSource() {
  return path.join(packageRoot(), 'agents');
}

/**
 * Every skill directory carrying a SKILL.md is distributable — the 5
 * shipgate-* gate skills plus the 22 full-dev lifecycle skills shipped here.
 * Discovered from disk so adding a skill never needs a code change.
 */
export function listSkillNames() {
  return listDir(skillsSource())
    .filter((entry) => entry.isDirectory() && exists(path.join(skillsSource(), entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

export function listCommandNames() {
  return listDir(commandsSource())
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

export function listAgentNames() {
  return listDir(agentsSource())
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Legacy installs copied a skill as a flat `<name>.md`; the current layout is
 * `<name>/SKILL.md`. When both exist, the same skill `name:` is declared twice —
 * harnesses then load it twice or pick a stale copy, and which one wins is not
 * something the user can see. Report it; never delete (the flat file may be the
 * user's own hand-written copy).
 */
export function detectFlatSkillDuplicates(dir) {
  if (!dir) return [];
  const entries = listDir(dir);
  const dirSkillNames = new Set(
    entries
      .filter((entry) => entry.isDirectory() && exists(path.join(dir, entry.name, 'SKILL.md')))
      .map((entry) => entry.name),
  );
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .filter((name) => dirSkillNames.has(name))
    .sort();
}

/**
 * Where a cleanup may park what it moves out of a skills root.
 *
 * It must not be a child of the root: every `.md` inside a root is a skill
 * candidate. When such a directory is loaded as a skill path, pi names each of
 * its flat files after the parent directory (`name = frontmatter.name ??
 * parentDirName`), so parking the old flat skills in `<root>/_flat-backup`
 * re-registers them — and a re-registered flat file collides with, and wins
 * over, the real `<name>/SKILL.md`. Keeping the backup outside the root makes
 * that impossible for every harness at once.
 */
export function skillsBackupDir(kind, date = today()) {
  return path.join(stateDir(), 'backups', `${kind}-${date}`);
}

/**
 * Frontmatter reader for the two fields the spec constrains. Deliberately
 * minimal: no dependency, no nested-map support, block scalars (`|`, `>`) are
 * joined the way a loader would see them so a length check is not fooled by a
 * wrapped description.
 */
export function parseSkillFrontmatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!block) return {};
  const lines = block[1].split(/\r?\n/);
  const fields = {};
  for (let i = 0; i < lines.length; i += 1) {
    const hit = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i]);
    if (!hit) continue;
    let value = hit[2].trim();
    if (/^[|>][-+]?\d*$/.test(value)) {
      const body = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) body.push(lines[++i].trim());
      value = value.startsWith('|') ? body.join('\n') : body.join(' ');
    }
    fields[hit[1]] = value.replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return fields;
}

/** Same accept/reject rules as the Agent Skills spec, in operator wording. */
export function validateSkillName(name) {
  if (typeof name !== 'string' || name === '') return ['name 缺失'];
  const issues = [];
  if (name.length > SKILL_NAME_MAX) issues.push(`name 超过 ${SKILL_NAME_MAX} 字符（${name.length}）`);
  if (!SKILL_NAME_RE.test(name)) issues.push('name 只能含 a-z、0-9、-（当前有其他字符）');
  if (/^-|-$/.test(name)) issues.push('name 不能以 - 开头或结尾');
  if (name.includes('--')) issues.push('name 不能含连续 --');
  return issues;
}

/**
 * Audit one skill root the way a loader walks it: a directory holding SKILL.md
 * is a skill and is not descended into; only the root's *direct* .md children
 * count as flat skills (that is what `includeRootFiles` means on load); `.`
 * prefixed entries are skipped. Every finding is report-only.
 */
export function auditSkillRoot(root) {
  const result = { root, skills: 0, invalidNames: [], longDescriptions: [], collisions: [], strayDirs: [] };
  if (!root || !exists(root)) return result;
  const claimed = new Map();

  const register = (dir, file) => {
    const front = parseSkillFrontmatter(readText(file));
    const declared = path.basename(file) === 'SKILL.md';
    const name = typeof front.name === 'string' && front.name !== '' ? front.name : path.basename(dir);
    const description = typeof front.description === 'string' ? front.description.trim() : '';
    // A flat file without a description is not loaded at all, so it is not a
    // skill and must not be reported as one.
    if (!declared && description === '') return;
    result.skills += 1;
    const nameIssues = validateSkillName(name);
    if (nameIssues.length) result.invalidNames.push({ name, file, messages: nameIssues });
    if (description.length > SKILL_DESCRIPTION_MAX) {
      result.longDescriptions.push({ file, length: description.length });
    }
    const owners = claimed.get(name) ?? [];
    owners.push(file);
    claimed.set(name, owners);
  };

  const walk = (dir, includeFlat) => {
    const entries = listDir(dir);
    if (entries.some((entry) => entry.name === 'SKILL.md' && entry.isFile())) {
      register(dir, path.join(dir, 'SKILL.md'));
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDir = fs.statSync(full).isDirectory();
        } catch {
          continue;
        }
      }
      if (isDir) walk(full, false);
      else if (includeFlat && entry.name.endsWith('.md')) register(dir, full);
    }
  };

  walk(root, true);

  for (const [name, owners] of claimed) {
    if (owners.length > 1) result.collisions.push({ name, winner: owners[0], losers: owners.slice(1) });
  }

  // A child directory with .md files but no SKILL.md is the shape a backup
  // folder takes. It is inert until something passes it as a skill path, and
  // then its files become skills under the directory's name — a silent trap.
  for (const entry of listDir(root)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(root, entry.name);
    if (exists(path.join(dir, 'SKILL.md'))) continue;
    const mdCount = listDir(dir).filter((child) => child.isFile() && child.name.endsWith('.md')).length;
    if (mdCount > 0) result.strayDirs.push({ dir, mdCount });
  }

  return result;
}

function copyFile(src, dest, { dryRun }) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Overwriting a file the user already had (e.g. a hand-copied command) is
  // still a destructive act: keep one backup per day before replacing it.
  if (fs.existsSync(dest)) backupOnce(dest);
  fs.copyFileSync(src, dest);
}

function installFileSet(files, srcDir, destDir, recordKey, record, { dryRun }) {
  const result = { installed: [], skipped: [], overwritten: [] };
  record[recordKey] ??= {};
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    const hash = hashFile(src);
    if (record[recordKey][file]?.hash === hash && exists(dest)) {
      result.skipped.push(file);
      continue;
    }
    // The file exists but was not put there by ShipGate (no manifest record):
    // it is the user's own copy. Overwriting is reasonable for a shared skill
    // pack, but it must never be silent.
    if (exists(dest) && !record[recordKey][file]) result.overwritten.push(file);
    copyFile(src, dest, { dryRun });
    if (!dryRun) record[recordKey][file] = { hash, installedAt: new Date().toISOString() };
    result.installed.push(file);
  }
  return result;
}

/**
 * Digest of a whole skill directory.
 *
 * A skill ships more than its entry file: `scripts/`, `references/`, templates.
 * Hashing only SKILL.md froze those at first install — a fixed script never
 * reached any harness, and `install` reported "no change" while the copies were
 * stale. The digest covers relative path + content for every regular file, in a
 * sorted order so it does not depend on directory iteration.
 */
export function hashTree(dir) {
  const entries = [];
  const walk = (current, prefix) => {
    for (const entry of listDir(current)) {
      const full = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      entries.push(`${rel}\u0000${hashFile(full)}`);
    }
  };
  walk(dir, '');
  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

/**
 * Is any source file missing or different in the destination?
 *
 * Only the source's file set is compared: a harness skill directory may carry
 * files a user put there (extra notes, a local asset), and treating those as
 * drift would make every install a "change". What this does catch is the case
 * that matters — a tampered or half-copied skill is repaired on the next run.
 */
export function sourceTreeDrift(srcDir, destDir) {
  let drift = false;
  const walk = (src, dest, prefix) => {
    for (const entry of listDir(src)) {
      const from = path.join(src, entry.name);
      const to = path.join(dest, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(from, to, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!exists(to) || hashFile(to) !== hashFile(from)) drift = true;
    }
  };
  walk(srcDir, destDir, '');
  return drift;
}

/**
 * Copy-on-change: a skill whose directory digest already matches the manifest is
 * skipped, so re-running install does not touch mtimes or churn backups.
 */
export function installSkills(harness, record, { dryRun = false } = {}) {
  const result = { installed: [], skipped: [] };
  if (!harness.skillsPath) return result;
  // A link whose target is gone cannot be written through. Creating the link is
  // agent-config-bridge's job, so fail-closed and name the owner instead of
  // silently replacing the link with a copy (which would fork the skill set).
  if (harness.skillsBroken) {
    throw new Error(
      `skills 链接已断开：${harness.skillsDeclaredPath}（目标不存在）。` +
        `请在 agent-config-bridge 中重新 adopt ${harness.id} 以重建链接，或先删除该链接再重试。`,
    );
  }
  record.skills ??= {};

  for (const name of listSkillNames()) {
    const srcDir = path.join(skillsSource(), name);
    const destDir = path.join(harness.skillsPath, name);
    const hash = hashTree(srcDir);

    if (record.skills[name]?.hash === hash && exists(path.join(destDir, 'SKILL.md')) && !sourceTreeDrift(srcDir, destDir)) {
      result.skipped.push(name);
      continue;
    }
    if (!dryRun) {
      const destSkill = path.join(destDir, 'SKILL.md');
      if (exists(destSkill)) backupOnce(destSkill);
      copyTree(srcDir, destDir);
      record.skills[name] = { hash, installedAt: new Date().toISOString() };
    }
    result.installed.push(name);
  }
  return result;
}

export function installCommands(harness, record, { dryRun = false } = {}) {
  if (!harness.commandsPath) return { installed: [], skipped: [], skippedReason: 'harness 无 commands 目录' };
  return installFileSet(listCommandNames(), commandsSource(), harness.commandsPath, 'commands', record, { dryRun });
}

export function installAgents(harness, record, { dryRun = false } = {}) {
  if (!harness.agentsPath) return { installed: [], skipped: [], skippedReason: 'harness 无 agents 目录' };
  return installFileSet(listAgentNames(), agentsSource(), harness.agentsPath, 'agents', record, { dryRun });
}

/**
 * --prune only removes directories this manifest recorded whose skill no longer
 * exists in the package; user-authored skills in the same folder are untouched.
 */
export function pruneSkills(harness, record, { dryRun = false } = {}) {
  const removed = [];
  if (!harness.skillsPath) return removed;
  const shipped = new Set(listSkillNames());

  for (const name of Object.keys(record.skills ?? {})) {
    if (shipped.has(name)) continue;
    const dest = path.join(harness.skillsPath, name);
    if (exists(dest) && !dryRun) removeDir(dest);
    delete record.skills[name];
    removed.push(name);
  }
  return removed;
}
