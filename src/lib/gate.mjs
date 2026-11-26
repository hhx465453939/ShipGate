import path from 'node:path';
import { HOME } from './cfg.mjs';
import { stateDir } from './state.mjs';
import { packageRoot } from '../version.mjs';
import { backupOnce, copyTree, exists, readIfExists, writeText } from './fsx.mjs';

const DEFAULT_POLICY = {
  config: {
    destructive_mode: 'enforce',
    destructive_mode_until: 0,
    protected_worktrees: [],
  },
};

export function globalPolicyPath() {
  return path.join(stateDir(), 'gate-policy.json');
}

export function gatesSource() {
  return path.join(packageRoot(), 'assets', 'gates');
}

/**
 * Single source of truth for gate policy. Harness policy.json files are
 * projections of this file, so `policy --sync` can always rebuild them.
 */
export function loadPolicy() {
  const text = readIfExists(globalPolicyPath());
  if (text === null) return structuredClone(DEFAULT_POLICY);
  try {
    const parsed = JSON.parse(text);
    return { ...structuredClone(DEFAULT_POLICY), ...parsed, config: { ...DEFAULT_POLICY.config, ...(parsed.config ?? {}) } };
  } catch (error) {
    throw new Error(`gate-policy.json 损坏，请检查 ${globalPolicyPath()}：${error.message}`);
  }
}

export function savePolicy(policy) {
  writeText(globalPolicyPath(), JSON.stringify(policy, null, 2) + '\n');
  return policy;
}

function normalizeDir(dir) {
  return path.resolve(dir.startsWith('~') ? path.join(HOME, dir.slice(1)) : dir);
}

export function addProtected(dir) {
  const policy = loadPolicy();
  const target = normalizeDir(dir);
  const list = policy.config.protected_worktrees ?? [];
  if (!list.includes(target)) list.push(target);
  policy.config.protected_worktrees = list;
  return savePolicy(policy);
}

export function removeProtected(dir) {
  const policy = loadPolicy();
  const target = normalizeDir(dir);
  policy.config.protected_worktrees = (policy.config.protected_worktrees ?? []).filter((p) => p !== target);
  return savePolicy(policy);
}

export function setMode(mode) {
  if (!['enforce', 'bypass'].includes(mode)) {
    throw new Error(`destructive_mode 只能是 enforce 或 bypass，收到：${mode}`);
  }
  const policy = loadPolicy();
  policy.config.destructive_mode = mode;
  policy.config.destructive_mode_until = 0;
  return savePolicy(policy);
}

/**
 * Merge rule: global policy wins on `config`; everything else already in the
 * harness policy file is preserved; protected worktrees are unioned so a
 * harness never silently loses a protection the operator just added.
 */
export function mergePolicy(globalPolicy, existing) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const existingConfig = base.config && typeof base.config === 'object' ? base.config : {};
  const union = [
    ...new Set([...(globalPolicy.config.protected_worktrees ?? []), ...(existingConfig.protected_worktrees ?? [])]),
  ];
  return {
    ...base,
    ...globalPolicy,
    config: { ...existingConfig, ...globalPolicy.config, protected_worktrees: union },
  };
}

function readJson(file) {
  const text = readIfExists(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A malformed harness policy is not silently discarded: we keep the raw
    // file under a backup name and let the caller re-seed from global policy.
    return { __malformed: true };
  }
}

/**
 * Sync projection: the global policy is authoritative, so protected worktrees
 * are replaced rather than unioned. Unioning here would make --rm-protected
 * impossible to apply (the removed entry keeps coming back from the harness
 * copy). Union happens exactly once, at install time, and is then promoted
 * back to the global file.
 */
export function projectPolicy(globalPolicy, existing) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const existingConfig = base.config && typeof base.config === 'object' ? base.config : {};
  return {
    ...base,
    ...globalPolicy,
    config: {
      ...existingConfig,
      ...globalPolicy.config,
      protected_worktrees: [...(globalPolicy.config.protected_worktrees ?? [])],
    },
  };
}

export function installGateBundle(harness, { dryRun = false } = {}) {
  if (!harness.gateDest) return { action: 'none' };
  const source = gatesSource();
  if (!exists(source)) return { action: 'missing-source', source };

  const kind = harness.gate?.kind ?? 'pi';
  const target = path.join(harness.gateDest, 'policy.json');
  const existing = readJson(target);

  if (!dryRun) {
    copyTree(source, harness.gateDest, { skip: ['policy.json'] });
    if (exists(target)) backupOnce(target);
    const merged = mergePolicy(loadPolicy(), existing?.__malformed ? null : existing);
    writeText(target, JSON.stringify(merged, null, 2) + '\n');
    // Promote anything the harness already had so the next sync can project
    // from a complete source of truth instead of losing it.
    savePolicy(merged);
  }

  return { action: dryRun ? 'would-install' : 'installed', kind, target };
}

export function syncPolicyToHarnesses(harnesses, { dryRun = false } = {}) {
  const globalPolicy = loadPolicy();
  const touched = [];

  for (const harness of harnesses) {
    if (!harness.gateDest) continue;
    const target = path.join(harness.gateDest, 'policy.json');
    if (!exists(harness.gateDest)) continue;
    const existing = readJson(target);
    const merged = projectPolicy(globalPolicy, existing?.__malformed ? null : existing);
    if (!dryRun) {
      if (exists(target)) backupOnce(target);
      writeText(target, JSON.stringify(merged, null, 2) + '\n');
    }
    touched.push({ harness: harness.id, target, mode: merged.config.destructive_mode, protected: merged.config.protected_worktrees.length });
  }
  return touched;
}

export function gateStatus(harness) {
  if (!harness.gateDest) return { installed: false, reason: 'harness 无 gate 配置' };
  if (!exists(harness.gateDest)) return { installed: false, reason: '目录不存在' };
  const policy = readJson(path.join(harness.gateDest, 'policy.json'));
  return {
    installed: exists(path.join(harness.gateDest, 'policy.js')) && exists(path.join(harness.gateDest, 'classifier.js')),
    dir: harness.gateDest,
    mode: policy?.config?.destructive_mode ?? 'unknown',
    protected: policy?.config?.protected_worktrees?.length ?? 0,
  };
}
