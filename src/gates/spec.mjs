import path from 'node:path';
import { exists, listDir, readText } from '../lib/fsx.mjs';

const REQUIRED = ['PRD.md', 'SPEC.md', 'TRACEABILITY.md'];

export function specStatus(text) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) return null;
  const line = front[1].split(/\r?\n/).find((l) => /^status\s*:/.test(l));
  if (!line) return null;
  return line.slice(line.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
}

export function hasAcceptanceCriteria(text) {
  return /验收判据|验收标准|AC-\d+/.test(text);
}

export function checkChangeDir(dir) {
  const findings = [];
  for (const name of REQUIRED) {
    if (!exists(path.join(dir, name))) {
      findings.push({ level: 'error', file: name, message: `缺少 ${name}` });
    }
  }
  const specPath = path.join(dir, 'SPEC.md');
  if (exists(specPath)) {
    const spec = readText(specPath);
    const status = specStatus(spec);
    if (!status) {
      findings.push({ level: 'error', file: 'SPEC.md', message: 'SPEC.md 缺少 frontmatter 的 status 字段' });
    } else if (status === 'draft') {
      findings.push({ level: 'error', file: 'SPEC.md', message: 'SPEC.md status 仍为 draft，契约未成立' });
    }
    if (!hasAcceptanceCriteria(spec)) {
      findings.push({ level: 'error', file: 'SPEC.md', message: 'SPEC.md 未写验收判据（需含「验收判据」或 AC-x）' });
    }
  }
  return findings;
}

/**
 * Accepts either a single change directory (tasks/CHG-x) or a parent that holds
 * change directories (tasks). A parent with zero CHG-* children fails: "no
 * contract" is the failure this gate exists to catch.
 */
export function runSpecGate({ cwd = process.cwd(), dir = 'tasks' } = {}) {
  const base = path.resolve(cwd, dir);
  const direct = exists(path.join(base, 'SPEC.md')) ? [path.basename(base)] : null;

  const changeDirs = direct
    ? [{ name: direct[0], path: base }]
    : listDir(base)
        .filter((e) => e.isDirectory() && /^CHG-/.test(e.name))
        .map((e) => ({ name: e.name, path: path.join(base, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));

  if (changeDirs.length === 0) {
    return {
      gate: 'spec',
      ok: false,
      code: 1,
      summary: `${base} 下没有任何 CHG-* 变更目录：没有契约，不允许改代码`,
      findings: [{ level: 'error', message: '缺少 tasks/CHG-<id>/ 契约目录' }],
      evidence: { dir: base },
    };
  }

  const findings = changeDirs.flatMap((chg) =>
    checkChangeDir(chg.path).map((f) => ({ ...f, change: chg.name })),
  );

  const ok = findings.length === 0;
  return {
    gate: 'spec',
    ok,
    code: ok ? 0 : 1,
    summary: ok
      ? `${changeDirs.length} 个变更契约成立（${changeDirs.map((c) => c.name).join(', ')}）`
      : `${findings.length} 处契约缺口`,
    findings,
    evidence: { dir: base, changes: changeDirs.map((c) => c.name) },
  };
}
