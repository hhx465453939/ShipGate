import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../version.mjs';
import { backupOnce, copyTree, exists, hashFile, listDir, removeDir } from './fsx.mjs';

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

function copyFile(src, dest, { dryRun }) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Overwriting a file the user already had (e.g. a hand-copied command) is
  // still a destructive act: keep one backup per day before replacing it.
  if (fs.existsSync(dest)) backupOnce(dest);
  fs.copyFileSync(src, dest);
}

function installFileSet(files, srcDir, destDir, recordKey, record, { dryRun }) {
  const result = { installed: [], skipped: [] };
  record[recordKey] ??= {};
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    const hash = hashFile(src);
    if (record[recordKey][file]?.hash === hash && exists(dest)) {
      result.skipped.push(file);
      continue;
    }
    copyFile(src, dest, { dryRun });
    if (!dryRun) record[recordKey][file] = { hash, installedAt: new Date().toISOString() };
    result.installed.push(file);
  }
  return result;
}

/**
 * Copy-on-change: a skill whose SKILL.md hash already matches the manifest is
 * skipped, so re-running install does not touch mtimes or churn backups.
 */
export function installSkills(harness, record, { dryRun = false } = {}) {
  const result = { installed: [], skipped: [] };
  if (!harness.skillsPath) return result;
  record.skills ??= {};

  for (const name of listSkillNames()) {
    const srcDir = path.join(skillsSource(), name);
    const srcFile = path.join(srcDir, 'SKILL.md');
    const destDir = path.join(harness.skillsPath, name);
    const hash = hashFile(srcFile);

    if (record.skills[name]?.hash === hash && exists(path.join(destDir, 'SKILL.md'))) {
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
