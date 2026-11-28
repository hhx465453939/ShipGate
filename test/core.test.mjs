import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareVersions, checkLatest, checkedToday } from '../src/lib/update.mjs';
import { DEFAULTS, mergeConfig, loadConfig } from '../src/lib/cfg.mjs';
import { run } from '../src/lib/exec.mjs';
import { runQualityGate } from '../src/gates/quality.mjs';
import { allHarnesses, resolveHarness, selectHarnesses } from '../src/harness/index.mjs';

test('版本比较', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('配置深合并，项目覆盖全局', () => {
  const merged = mergeConfig(DEFAULTS, { quality: { min: 95 } });
  assert.equal(merged.quality.min, 95);
  assert.deepEqual(merged.harnesses, DEFAULTS.harnesses);
});

test('loadConfig 在无配置时返回默认值', () => {
  const cfg = loadConfig('/tmp/shipgate-no-such-dir');
  assert.equal(cfg.quality.min, 80);
});

test('harness 列表含内置五个', () => {
  const ids = allHarnesses(DEFAULTS).map((h) => h.id);
  for (const id of ['claude', 'pi', 'codex', 'gemini', 'cursor']) assert.ok(ids.includes(id));
});

test('自定义 harness 可解析且无 detect 时视为存在', () => {
  // 不能叫 dsh：dsh 已是内置 profile（带 detect），自定义项以 'myagent' 验证。
  const cfg = mergeConfig(DEFAULTS, {
    custom: { myagent: { label: 'My Agent', skills: '~/.myagent/skills', inject: '~/.myagent/AGENTS.md' } },
  });
  const mine = resolveHarness(allHarnesses(cfg).find((h) => h.id === 'myagent'));
  assert.equal(mine.skillsPath.endsWith(path.join('.myagent', 'skills')), true);
  assert.equal(mine.detectPath, null, '未声明 detect 应视为总是存在');
  const { selected } = selectHarnesses({ requested: 'myagent', cfg });
  assert.equal(selected.length, 1);
});

test('harnesses=auto 时默认取全部已探测 harness', () => {
  const { selected } = selectHarnesses({ cfg: DEFAULTS });
  const ids = selected.map((h) => h.id);
  assert.ok(ids.includes('claude'), `实际：${ids.join(',')}`);
  assert.ok(selected.every((h) => h.detectPath), 'auto 只应包含有探测路径且存在的 harness');
});

test('checkLatest 网络失败不抛异常', async () => {
  const result = await checkLatest({ timeoutMs: 1 });
  assert.equal(typeof result.ok, 'boolean');
  if (!result.ok) assert.equal(typeof result.error, 'string');
});

test('checkedToday 返回布尔', () => {
  assert.equal(typeof checkedToday(), 'boolean');
});

test('earliestBackup 取最早一份，latestBackup 取最新一份', async () => {
  const { earliestBackup, latestBackup, backupOnce } = await import('../src/lib/fsx.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-bak-'));
  const file = path.join(dir, 'CLAUDE.md');
  fs.writeFileSync(file, 'original');
  const only = backupOnce(file);
  assert.ok(only, '应生成一份备份');
  assert.equal(earliestBackup(file), only);
  assert.equal(latestBackup(file), only);
  // 模拟次日再备份
  fs.writeFileSync(`${file}.shipgate-bak.2999-01-01`, 'next-day');
  assert.equal(earliestBackup(file), only, 'revoke 必须回到最早那份');
  assert.ok(latestBackup(file).endsWith('2999-01-01'));
});

// --- exec：Windows .cmd 垫片（CHG-20261128）---

test('run() 能启动 .cmd 垫片，且带空格的参数不被拆开', { skip: process.platform !== 'win32' }, () => {
  // 每个 npm 全局命令在 Windows 上都是 .cmd；直接 spawnSync 会 EINVAL，
  // 而 npm 全局安装目录与临时路径都可能含空格，两者都要活下来。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate shim '));
  const shim = path.join(dir, 'echo args.cmd');
  fs.writeFileSync(shim, '@echo off\r\necho %~1\r\necho %~2\r\n');
  const result = run(shim, ['has space', 'plain'], { timeout: 30_000 });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /has space/);
  assert.match(result.stdout, /plain/);
});

// --- CHG-20261128-gate-bundle-integrity：引擎级错误不得当成代码问题 ---

function stubAislop(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-aislop-'));
  const binDir = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, 'aislop');
  fs.writeFileSync(stub, `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(payload)}\nJSON\n`);
  fs.chmodSync(stub, 0o755);
  return dir;
}

const ENGINE_ERROR_PAYLOAD = {
  schemaVersion: '1',
  cliVersion: '0.0.0-stub',
  score: 86,
  scoreable: true,
  coverage: { failedEngines: [] },
  engines: { lint: { issues: 1, skipped: false } },
  diagnostics: [{ severity: 'error', rule: 'ruff/engine-error', message: 'Unexpected end of JSON input', engine: 'lint' }],
};

test('quality：引擎崩溃报退出码 3 + 处置提示，不冒充代码 error', { skip: process.platform === 'win32' }, () => {
  const cwd = stubAislop(ENGINE_ERROR_PAYLOAD);
  const verdict = runQualityGate({ cwd, target: '.', min: 80 });
  assert.equal(verdict.code, 3, verdict.summary);
  assert.equal(verdict.ok, false);
  assert.match(verdict.summary, /环境问题，不是代码问题/);
  assert.ok(verdict.evidence.rules.includes('ruff/engine-error'));
  assert.ok(verdict.evidence.hint && verdict.evidence.hint.length > 20, '必须给出可执行的处置提示');
  assert.equal(verdict.findings.length, 0, '引擎错误不是代码发现');
});

test('quality：普通 error 级发现仍是代码问题（退出码 1）', { skip: process.platform === 'win32' }, () => {
  const cwd = stubAislop({
    ...ENGINE_ERROR_PAYLOAD,
    diagnostics: [{ severity: 'error', rule: 'complexity/too-long', message: 'function too long', engine: 'code-quality' }],
  });
  const verdict = runQualityGate({ cwd, target: '.', min: 80 });
  assert.equal(verdict.code, 1, verdict.summary);
  assert.equal(verdict.findings.length, 1);
});
