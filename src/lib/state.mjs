import path from 'node:path';
import { HOME } from './cfg.mjs';
import { readIfExists, writeText } from './fsx.mjs';

export function stateDir() {
  return path.join(HOME, '.config', 'shipgate');
}

export function manifestPath() {
  return path.join(stateDir(), 'manifest.json');
}

export function cacheDir() {
  return path.join(HOME, '.cache', 'shipgate');
}

const EMPTY = { version: 1, harnesses: {} };

export function loadManifest() {
  const text = readIfExists(manifestPath());
  if (text === null) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(text);
    return { ...structuredClone(EMPTY), ...parsed, harnesses: parsed.harnesses ?? {} };
  } catch (error) {
    throw new Error(`manifest 损坏，请检查 ${manifestPath()}：${error.message}`);
  }
}

export function saveManifest(manifest) {
  writeText(manifestPath(), JSON.stringify(manifest, null, 2) + '\n');
}

export function harnessRecord(manifest, id) {
  return manifest.harnesses[id];
}

export function ensureHarnessRecord(manifest, id) {
  manifest.harnesses[id] ??= { managed: false, skills: {}, inject: null, gate: null };
  return manifest.harnesses[id];
}
