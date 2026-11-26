import os from 'node:os';
import path from 'node:path';
import { readIfExists } from './fsx.mjs';

export const HOME = os.homedir();

export function expand(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return p;
}

export const DEFAULTS = {
  version: 1,
  harnesses: ['claude', 'pi'],
  custom: {},
  quality: { min: 80 },
  spec: { dir: 'tasks' },
  security: { scope: null },
  update: { autoUpdate: false },
  engines: { aislop: 'auto', cbh: 'auto', allowNpx: false },
};

const DEEP_KEYS = ['quality', 'spec', 'security', 'update', 'engines', 'custom'];

export function mergeConfig(base, over) {
  const out = { ...base, ...over };
  for (const key of DEEP_KEYS) {
    if (over[key] && typeof over[key] === 'object' && !Array.isArray(over[key])) {
      out[key] = { ...(base[key] ?? {}), ...over[key] };
    }
  }
  return out;
}

export function globalConfigPath() {
  return path.join(HOME, '.config', 'shipgate', 'config.json');
}

export function projectConfigPath(cwd) {
  return path.join(cwd, '.shipgate', 'config.json');
}

function readJson(file) {
  const text = readIfExists(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`配置文件不是合法 JSON: ${file}\n${error.message}`);
  }
}

/**
 * Precedence: built-in defaults < global config < project config.
 * A malformed file is a hard error, not a silent fallback — a typo must not
 * silently downgrade the gate threshold.
 */
export function loadConfig(cwd = process.cwd()) {
  const globalCfg = readJson(globalConfigPath()) ?? {};
  const projectCfg = readJson(projectConfigPath(cwd)) ?? {};
  return mergeConfig(mergeConfig(DEFAULTS, globalCfg), projectCfg);
}
