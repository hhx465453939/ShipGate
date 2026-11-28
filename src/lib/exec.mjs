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

/**
 * Node refuses to spawn `.cmd`/`.bat` directly (the CVE-2024-27980 fix returns
 * EINVAL), and on Windows every npm global shim is a `.cmd`. `which('aislop')`
 * therefore resolves to a file that can only run through cmd.exe — spawning it
 * directly made the quality gate unrunnable on this platform (`exit=-1`).
 *
 * Each token is quoted on its own: a path with spaces must stay one argument,
 * and cmd.exe strips the outer pair added here. Arguments containing `"` are
 * rejected by the caller's contract (no ShipGate call passes one).
 */
function cmdShimInvocation(cmd, args) {
  const quote = (value) => `"${String(value).replace(/"/g, '')}"`;
  return [cmd, ...args].map(quote).join(' ');
}

export function run(cmd, args = [], { timeout = 600_000, cwd, env } = {}) {
  const options = {
    encoding: 'utf8',
    timeout,
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 64 * 1024 * 1024,
  };
  const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
  // `windowsVerbatimArguments` is load-bearing: without it Node re-quotes the
  // single command argument and cmd.exe then treats the whole string as the
  // executable's name. This mirrors what `shell: true` does internally.
  const result = isCmdShim
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${cmdShimInvocation(cmd, args)}"`], {
        ...options,
        windowsVerbatimArguments: true,
      })
    : spawnSync(cmd, args, options);
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
