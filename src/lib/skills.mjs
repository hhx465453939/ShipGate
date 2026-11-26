import path from 'node:path';
import { packageRoot } from '../version.mjs';
import { copyTree, exists, hashFile, listDir, removeDir, writeText } from './fsx.mjs';

export const SKILLS = ['shipgate', 'shipgate-spec', 'shipgate-quality', 'shipgate-security', 'shipgate-install'];

export function skillsSource() {
  return path.join(packageRoot(), 'skills');
}

export function gatesSource(name) {
  return path.join(packageRoot(), 'assets', name);
}

/**
 * Copy-on-change: a skill whose SKILL.md hash already matches the manifest is
 * skipped, so re-running install does not touch mtimes or churn backups.
 */
export function installSkills(harness, record, { dryRun = false } = {}) {
  const source = skillsSource();
  const result = { installed: [], skipped: [], pruned: [] };
  if (!harness.skillsPath) return result;

  for (const name of SKILLS) {
    const srcDir = path.join(source, name);
    const srcFile = path.join(srcDir, 'SKILL.md');
    if (!exists(srcFile)) continue;

    const hash = hashFile(srcFile);
    const destDir = path.join(harness.skillsPath, name);
    const known = record.skills?.[name];
    if (known?.hash === hash && exists(path.join(destDir, 'SKILL.md'))) {
      result.skipped.push(name);
      continue;
    }

    if (!dryRun) {
      copyTree(srcDir, destDir);
      record.skills ??= {};
      record.skills[name] = { hash, version: record.version ?? null, installedAt: new Date().toISOString() };
    }
    result.installed.push(name);
  }
  return result;
}

export function pruneSkills(harness, record, { dryRun = false } = {}) {
  const removed = [];
  if (!harness.skillsPath) return removed;

  for (const name of listDir(harness.skillsPath).map((e) => e.name)) {
    if (!name.startsWith('shipgate')) continue;
    if (SKILLS.includes(name)) continue;
    const dest = path.join(harness.skillsPath, name);
    if (!dryRun) removeDir(dest);
    removed.push(name);
  }

  if (!dryRun) {
    for (const name of Object.keys(record.skills ?? {})) {
      if (!exists(path.join(harness.skillsPath, name))) delete record.skills[name];
    }
  }
  return removed;
}

export function installGateBundle(harness, { dryRun = false } = {}) {
  if (!harness.gateDest) return { action: 'none' };
  const source = gatesSource(harness.gate?.assets ?? 'pi-gate');
  if (!exists(source)) return { action: 'missing-source', source };

  const policyPath = path.join(harness.gateDest, 'policy.json');
  const policyExisted = exists(policyPath);

  if (!dryRun) {
    copyTree(source, harness.gateDest, { skip: ['policy.json'] });
    if (!policyExisted) {
      writeText(policyPath, JSON.stringify({ config: { destructive_mode: 'enforce', destructive_mode_until: 0, protected_worktrees: [] } }, null, 2) + '\n');
    }
  }

  return { action: dryRun ? 'would-install' : 'installed', source, policyPreserved: policyExisted };
}
