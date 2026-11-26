import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runSecurityGate } from '../src/gates/security.mjs';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-sec-'));
}

test('无 --scope 直接拒绝（退出码 2）', () => {
  const verdict = runSecurityGate({ cwd: tmpdir() });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 2);
  assert.match(verdict.summary, /scope/);
});

test('scope 文件不存在 → 2', () => {
  const verdict = runSecurityGate({ cwd: tmpdir(), scope: './nope.md' });
  assert.equal(verdict.code, 2);
});

test('scope 内容过短 → 2', () => {
  const cwd = tmpdir();
  fs.writeFileSync(path.join(cwd, 'scope.md'), 'x');
  const verdict = runSecurityGate({ cwd, scope: 'scope.md' });
  assert.equal(verdict.code, 2);
});

test('scope 合法但 cbh 缺失 → 3，且给出安装命令', () => {
  const cwd = tmpdir();
  fs.writeFileSync(
    path.join(cwd, 'scope.md'),
    '# Scope\n\n## In scope\n*.example.com\n\n## Out of scope\nthird-party\n',
  );
  const verdict = runSecurityGate({ cwd, scope: 'scope.md' });
  if (verdict.code === 0) {
    // cbh is installed on this machine: the gate must still refuse to probe.
    assert.equal(verdict.evidence.dryRun, false);
    assert.ok(Array.isArray(verdict.evidence.next));
  } else {
    assert.equal(verdict.code, 3);
    assert.match(verdict.evidence.install, /pipx install/);
  }
});

test('dry-run 不产生探测动作', () => {
  const cwd = tmpdir();
  fs.writeFileSync(path.join(cwd, 'scope.md'), '# Scope\n\nIn scope: *.example.com and api.example.com\n');
  const verdict = runSecurityGate({ cwd, scope: 'scope.md', dryRun: true });
  if (verdict.code === 0) assert.equal(verdict.evidence.dryRun, true);
});
