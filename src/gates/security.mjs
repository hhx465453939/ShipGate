import path from 'node:path';
import { exists, readText } from '../lib/fsx.mjs';
import { which } from '../lib/exec.mjs';

const SCOPE_HINT = /in[- ]scope|在范围内|scope|资产|targets?/i;

/**
 * Red line: an active probing tool must never run automatically.
 * This gate therefore only validates that a scope exists and hands the operator
 * the next commands — it does not fire recon itself.
 */
export function runSecurityGate({ cwd = process.cwd(), scope = null, dryRun = false } = {}) {
  if (!scope) {
    return {
      gate: 'security',
      ok: false,
      code: 2,
      summary: '必须显式指定 --scope <scope.md>：主动探测不可自动执行',
      findings: [{ level: 'error', message: '缺少 scope 文件，ShipGate 拒绝执行 security 闸' }],
      evidence: {
        example: 'shipgate security --scope ./scope.md',
        why: '没有书面授权范围就发起探测属于越界；范围必须由人确认',
      },
    };
  }

  const file = path.resolve(cwd, scope);
  if (!exists(file)) {
    return {
      gate: 'security',
      ok: false,
      code: 2,
      summary: `scope 文件不存在：${file}`,
      findings: [{ level: 'error', message: 'scope 文件不存在' }],
      evidence: { scope: file },
    };
  }

  const text = readText(file);
  const findings = [];
  if (text.trim().length < 20) {
    findings.push({ level: 'error', message: 'scope 文件内容过短，无法确认授权范围' });
  }
  if (!SCOPE_HINT.test(text)) {
    findings.push({ level: 'warn', message: 'scope 文件里没找到 in-scope / 范围 段落，请人工确认' });
  }

  const errors = findings.filter((f) => f.level === 'error');
  if (errors.length > 0) {
    return {
      gate: 'security',
      ok: false,
      code: 2,
      summary: 'scope 校验不通过',
      findings,
      evidence: { scope: file },
    };
  }

  const cbh = which('cbh');
  if (!cbh) {
    return {
      gate: 'security',
      ok: false,
      code: 3,
      summary: 'cbh 未安装（安全审计引擎缺失）',
      findings,
      evidence: {
        scope: file,
        install: 'pipx install git+https://github.com/elementalsouls/Claude-BugHunter',
      },
    };
  }

  const next = [
    'cbh recon <target>',
    'cbh surface <target>',
    'cbh classify <url>',
    'cbh triage <finding.md>',
  ];

  return {
    gate: 'security',
    ok: true,
    code: 0,
    summary: dryRun
      ? 'scope 校验通过（dry-run：未执行任何探测）'
      : 'scope 校验通过；按 shipgate-security skill 执行探测与取证',
    findings,
    evidence: { scope: file, cbh, dryRun, next },
  };
}
