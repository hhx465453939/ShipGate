import path from 'node:path';
import { version as toolVersion, which } from './exec.mjs';
import { c, log } from './log.mjs';
import { exists } from './fsx.mjs';

/**
 * Engine discovery lives here so every command reports the same thing. It used
 * to be duplicated: `gates` printed a hardcoded install hint even when both
 * engines were present, while `doctor` used the real one.
 */

export function resolveAislop(cwd) {
  const local = path.join(cwd, 'node_modules', '.bin', 'aislop');
  if (exists(local)) return local;
  return which('aislop');
}

/**
 * Engine installation hints must be copy-pasteable on the machine that prints
 * them. Two traps found on 2026-11-28: the default pip index answered "no
 * versions" for pipx and even for setuptools, and `pip install git+…` died in
 * build isolation with a checkout error (exit 128). So when pipx is absent the
 * hint is two steps — clone, then install from the checkout — with the index
 * named explicitly.
 */
export function cbhInstallHint(hasPipx) {
  const src = 'https://github.com/elementalsouls/Claude-BugHunter';
  if (hasPipx) return `pipx install git+${src}`;
  const win = process.platform === 'win32';
  const dir = win ? '"$HOME\\.local\\src\\Claude-BugHunter"' : '~/.local/src/Claude-BugHunter';
  const python = win ? 'python' : 'python3';
  const clone = `git clone --depth 1 ${src} ${dir}`;
  const install = `${python} -m pip install --user -i https://pypi.org/simple ${dir}`;
  return win ? `${clone}; ${install}` : `${clone} && ${install}`;
}

/** A binary outside PATH still exists, but no other agent can invoke it. */
function onPath(bin) {
  if (!bin) return false;
  const dir = path.dirname(bin);
  const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const key = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const wanted = key(dir);
  return entries.some((entry) => {
    try {
      return key(entry) === wanted;
    } catch {
      return false;
    }
  });
}

export function checkEngines(ctx) {
  const aislopBin = resolveAislop(ctx.cwd);
  const cbhBin = which('cbh');
  const pipx = which('pipx');

  return {
    aislop: {
      bin: aislopBin,
      version: aislopBin ? toolVersion(aislopBin) : null,
      install: 'npm i -g aislop',
      path: aislopBin ? path.dirname(aislopBin) : null,
      onPath: onPath(aislopBin),
    },
    cbh: {
      bin: cbhBin,
      // cbh has no --version switch; say so instead of printing a blank.
      version: cbhBin ? toolVersion(cbhBin, null) : null,
      noVersionFlag: true,
      install: cbhInstallHint(Boolean(pipx)),
      packageManager: pipx ? 'pipx' : 'pip',
      path: cbhBin ? path.dirname(cbhBin) : null,
      onPath: onPath(cbhBin),
    },
  };
}

/**
 * A missing engine must always print the exact command that installs it, and an
 * installed engine must never print an empty version cell (that reads as a
 * broken parse).
 */
export function reportEngines(engines, { withPath = true } = {}) {
  for (const [name, info] of Object.entries(engines)) {
    if (!info.bin) {
      log.warn(`${name} 未安装 → ${info.install}`);
      continue;
    }
    const version = info.version ?? (info.noVersionFlag ? '(无版本开关)' : '(版本未知)');
    const where = withPath ? ` ${c.dim(info.bin)}` : '';
    const offPath = info.onPath === false ? ` ${c.yellow('（bin 目录不在 PATH：其他 agent 调不到）')}` : '';
    log.ok(`${name} ${version}${where}${offPath}`);
  }
}

/** Only the engines that are actually absent, each with its own command. */
export function missingEngineHints(engines) {
  return Object.entries(engines)
    .filter(([, info]) => !info.bin)
    .map(([name, info]) => ({ name, install: info.install }));
}
