import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareVersions, checkLatest, checkedToday } from '../src/lib/update.mjs';
import { DEFAULTS, mergeConfig, loadConfig } from '../src/lib/cfg.mjs';
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
