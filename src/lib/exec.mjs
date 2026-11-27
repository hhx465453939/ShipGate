import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function which(cmd) {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      // statSync throws EACCES (not just ENOENT) on Windows' App Execution
      // Aliases such as the Store stub python3.exe; throwIfNoEntry only covers
      // ENOENT. An unreadable candidate is simply not a usable binary.
      let stat;
      try {
        stat = fs.statSync(candidate, { throwIfNoEntry: false });
      } catch {
        continue;
      }
      if (!stat?.isFile()) continue;
      if (process.platform === 'win32' || (stat.mode & 0o111) !== 0) return candidate;
    }
  }
  return null;
}

export function run(cmd, args = [], { timeout = 600_000, cwd, env } = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout,
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

export function version(cmd, args = ['--version']) {
  const r = run(cmd, args, { timeout: 20_000 });
  if (!r.ok) return null;
  return (r.stdout || r.stderr).trim().split('\n')[0] || null;
}
