import path from 'node:path';
import { cacheDir } from './state.mjs';
import { readIfExists, today, writeText } from './fsx.mjs';
import { run } from './exec.mjs';
import { VERSION } from '../version.mjs';

const REGISTRY = 'https://registry.npmjs.org/shipgate/latest';

function stampPath() {
  return path.join(cacheDir(), 'last-update-check');
}

export function checkedToday() {
  return readIfExists(stampPath())?.trim() === today();
}

export function markChecked() {
  writeText(stampPath(), today() + '\n');
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Network failure is reported, never thrown: `doctor` and the daily check must
 * work offline.
 */
export async function checkLatest({ timeoutMs = 6000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(REGISTRY, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    const latest = data.version;
    if (!latest) return { ok: false, error: '响应里没有 version' };
    return { ok: true, latest, current: VERSION, outdated: compareVersions(latest, VERSION) > 0 };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? `超时 ${timeoutMs}ms` : error.message };
  } finally {
    clearTimeout(timer);
  }
}

export function selfUpdate() {
  const result = run('npm', ['i', '-g', 'shipgate@latest'], { timeout: 900_000 });
  return { ok: result.ok, code: result.code, stderr: result.stderr.slice(0, 4000), stdout: result.stdout.slice(-2000) };
}
