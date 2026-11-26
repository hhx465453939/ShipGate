import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runSpecGate, specStatus, hasAcceptanceCriteria } from '../src/gates/spec.mjs';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-spec-'));
}

function writeChange(root, id, { prd = true, spec = '# SPEC\n\n验收判据：AC-1 跑通\n', trace = true } = {}) {
  const dir = path.join(root, 'tasks', id);
  fs.mkdirSync(dir, { recursive: true });
  if (prd) fs.writeFileSync(path.join(dir, 'PRD.md'), '# PRD\n');
  if (spec) fs.writeFileSync(path.join(dir, 'SPEC.md'), spec);
  if (trace) fs.writeFileSync(path.join(dir, 'TRACEABILITY.md'), '# TRACE\n');
  return dir;
}

const APPROVED_SPEC = `---
change_id: CHG-1
status: approved
---

# SPEC

## 验收判据

- AC-1 \`shipgate gates\` 退出码 0
`;

test('空目录判不通过', () => {
  const cwd = tmpdir();
  const verdict = runSpecGate({ cwd, dir: 'tasks' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 1);
});

test('三件齐 + approved + AC → 通过', () => {
  const cwd = tmpdir();
  writeChange(cwd, 'CHG-20260101-demo', { spec: APPROVED_SPEC });
  const verdict = runSpecGate({ cwd, dir: 'tasks' });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.findings));
  assert.equal(verdict.code, 0);
});

test('缺 TRACEABILITY → 不通过', () => {
  const cwd = tmpdir();
  writeChange(cwd, 'CHG-x', { trace: false, spec: APPROVED_SPEC });
  const verdict = runSpecGate({ cwd, dir: 'tasks' });
  assert.equal(verdict.ok, false);
  assert.match(JSON.stringify(verdict.findings), /TRACEABILITY/);
});

test('status: draft → 不通过', () => {
  const cwd = tmpdir();
  writeChange(cwd, 'CHG-y', { spec: APPROVED_SPEC.replace('approved', 'draft') });
  const verdict = runSpecGate({ cwd, dir: 'tasks' });
  assert.equal(verdict.ok, false);
  assert.match(JSON.stringify(verdict.findings), /draft/);
});

test('无验收判据 → 不通过', () => {
  const cwd = tmpdir();
  writeChange(cwd, 'CHG-z', { spec: '---\nstatus: approved\n---\n\n# SPEC\n\n功能正常\n' });
  const verdict = runSpecGate({ cwd, dir: 'tasks' });
  assert.equal(verdict.ok, false);
});

test('direct CHG 目录可单独校验', () => {
  const cwd = tmpdir();
  const dir = writeChange(cwd, 'CHG-direct', { spec: APPROVED_SPEC });
  const verdict = runSpecGate({ cwd, dir });
  assert.equal(verdict.ok, true);
});

test('frontmatter 解析与 AC 识别', () => {
  assert.equal(specStatus(APPROVED_SPEC), 'approved');
  assert.equal(specStatus('# no frontmatter'), null);
  assert.equal(hasAcceptanceCriteria('验收判据：x'), true);
  assert.equal(hasAcceptanceCriteria('AC-3 通过'), true);
  assert.equal(hasAcceptanceCriteria('功能正常'), false);
});
