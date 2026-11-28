import fs from 'node:fs';
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
 * The aislop package root, found by walking up from the binary until a
 * `tools/python` directory appears. Used to name the exact bundled binary when
 * it cannot run: the failure is silent (empty stdout → JSON parse error), so a
 * hint without a path is not actionable.
 */
export function resolveAislopPackageRoot(bin) {
  if (!bin) return null;
  let current;
  try {
    current = fs.realpathSync(bin);
  } catch {
    return null;
  }
  for (let depth = 0; depth < 5; depth += 1) {
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
    if (exists(path.join(current, 'tools', 'python'))) return current;
  }
  return null;
}

function pythonEnginePath(root) {
  const exe = process.platform === 'win32' ? 'aislop-python.exe' : 'aislop-python';
  return path.join(root, 'tools', 'python', `${process.platform}-${process.arch}`, exe);
}

/**
 * aislop bundles a Python engine binary (used for ruff). On an older glibc that
 * binary cannot load, ruff prints nothing, and the failure surfaces only as a
 * `ruff/engine-error` finding. `aislop doctor` still reports lint as ready, so
 * the incompatibility is checked here and named before anyone runs a gate.
 */
export function aislopPythonEngine(aislopBin) {
  const root = resolveAislopPackageRoot(aislopBin);
  if (!root) return null;
  const file = pythonEnginePath(root);
  if (!exists(file)) return null;

  const executable = process.platform === 'win32' ? true : (fs.statSync(file).mode & 0o111) !== 0;
  const glibc = process.report?.getReport?.()?.header?.glibcVersionRuntime ?? null;
  const parts = glibc ? String(glibc).split('.').map((n) => Number.parseInt(n, 10)) : null;
  const needsNewerGlibc = Boolean(
    process.platform === 'linux' && parts && (parts[0] < 2 || (parts[0] === 2 && parts[1] < 34)),
  );
  return { path: file, executable, glibc, needsNewerGlibc, broken: executable && needsNewerGlibc };
}

/**
 * Turning an engine crash into an instruction. The bundled Python engine cannot
 * load on an old glibc and says nothing about it, so the gate carries the
 * diagnosis rather than echoing "unexpected end of JSON input".
 */
export function engineHint(rules, bin) {
  const ruff = rules.some((rule) => String(rule).startsWith('ruff/'));
  const root = resolveAislopPackageRoot(bin);
  const bundled = root ? pythonEnginePath(root) : null;
  if (ruff && bundled && exists(bundled)) {
    return [
      `aislop 自带的 Python 引擎跑不起来：${bundled}`,
      'Linux 上 0.23.0 的这份二进制要求 GLIBC ≥ 2.34；老发行版（如 Ubuntu 20.04 / 2.31）会静默失败，ruff 输出为空 → JSON 解析错误。',
      `处置：chmod a-x "${bundled}"   # 去掉可执行位，aislop 回退到 PATH 上的 ruff`,
      '然后确认 `which ruff` 有输出；仍失败就换到 CI 机器跑。',
    ].join('\n');
  }
  if (ruff) {
    return 'ruff 引擎报错：先 `which ruff` 确认可执行，再 `aislop doctor` 看 lint 引擎；必要时在 .aislop/config.yml 里设 engines.lint: false 或换 CI 机器。';
  }
  return '先运行 `aislop doctor` 看哪个引擎失败，再决定禁用该引擎或补依赖。';
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
    pythonEngine: aislopPythonEngine(aislopBin),
  };
}

/**
 * A missing engine must always print the exact command that installs it, and an
 * installed engine must never print an empty version cell (that reads as a
 * broken parse).
 */
export function reportEngines(engines, { withPath = true } = {}) {
  for (const [name, info] of Object.entries(engines)) {
    // `pythonEngine` is a sub-probe of aislop, not an engine of its own; doctor
    // prints its finding separately.
    if (name === 'pythonEngine') continue;
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
