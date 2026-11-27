import path from 'node:path';
import { exists } from '../lib/fsx.mjs';
import { run, which } from '../lib/exec.mjs';

export function resolveAislop(cwd) {
  const local = path.join(cwd, 'node_modules', '.bin', 'aislop');
  if (exists(local)) return local;
  return which('aislop');
}

function parseJsonPayload(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Wraps `aislop scan --json`. The gate owns the threshold decision so the
 * verdict does not depend on a project-local .aislop/config.yml.
 * scoreable === false is a failure, never a pass: a scan that could not run the
 * lint engine must not be reported as green.
 */
export function runQualityGate({ cwd = process.cwd(), target = '.', min = 80, timeout = 900_000 } = {}) {
  const scanDir = path.resolve(cwd, target);
  const bin = resolveAislop(cwd);

  if (!bin) {
    return {
      gate: 'quality',
      ok: false,
      code: 3,
      summary: 'aislop 未安装（ShipGate 不做临时 npx 兜底，避免每次拉包失败）',
      findings: [],
      evidence: { install: 'npm i -g aislop' },
    };
  }

  // assets/pi-gate is vendored upstream (agent-config-bridge); it is not this
  // repo's code, so it must not count against this repo's quality score.
  const excludes = ['assets/pi-gate'];
  const result = run(bin, ['scan', scanDir, '--json', ...excludes.flatMap((p) => ['--exclude', p])], { timeout });
  const data = parseJsonPayload(result.stdout);

  if (!data) {
    return {
      gate: 'quality',
      ok: false,
      code: 3,
      summary: `aislop 输出无法解析（exit=${result.code}）`,
      findings: [],
      evidence: { stderr: result.stderr.slice(0, 2000), stdout: result.stdout.slice(0, 2000) },
    };
  }

  const diagnostics = data.diagnostics ?? [];
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const failedEngines = data.coverage?.failedEngines ?? [];

  if (data.scoreable !== true) {
    const hint = failedEngines.includes('lint')
      ? 'lint 引擎跑不起来：先运行 `aislop doctor`；若是 oxlint 二进制与 CPU 指令集不兼容（无 AVX2 的老 CPU 会 SIGILL），在项目 .aislop/config.yml 里设 engines.lint: false，或换到 CI 机器跑'
      : '先运行 `aislop doctor` 看哪个引擎失败，再决定禁用该引擎或补依赖';
    // Not the code's fault: the engine never ran. Report as environment gap (3)
    // so CI distinguishes "fix your code" from "fix this machine". It is still
    // non-zero — an unrunnable scan must never read as green.
    return {
      gate: 'quality',
      ok: false,
      code: 3,
      summary: `无法评分（引擎未跑起来：${failedEngines.join(', ') || '未知'}）——环境问题，不是代码问题`,
      findings: errors.slice(0, 20),
      evidence: { score: data.score ?? null, failedEngines, coverage: data.coverage, hint },
    };
  }

  const ok = data.score >= min && errors.length === 0;
  return {
    gate: 'quality',
    ok,
    code: ok ? 0 : 1,
    summary: ok
      ? `score ${data.score} ≥ ${min}，无 error 级发现`
      : `score ${data.score}${data.score < min ? ` < ${min}` : ''}${errors.length ? `，${errors.length} 个 error 级发现` : ''}`,
    findings: errors.slice(0, 20),
    evidence: {
      score: data.score,
      label: data.label,
      min,
      errorCount: errors.length,
      totalFindings: diagnostics.length,
      engineVersion: data.cliVersion,
      bin,
    },
  };
}
