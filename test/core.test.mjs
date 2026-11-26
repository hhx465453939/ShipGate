import assert from 'node:assert/strict';
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
  const cfg = mergeConfig(DEFAULTS, { custom: { dsh: { label: 'DSH', skills: '~/.dsh/skills', inject: '~/.dsh/AGENTS.md' } } });
  const dsh = resolveHarness(allHarnesses(cfg).find((h) => h.id === 'dsh'));
  assert.equal(dsh.skillsPath.endsWith('/.dsh/skills'), true);
  const { selected } = selectHarnesses({ requested: 'dsh', cfg });
  assert.equal(selected.length, 1);
});

test('checkLatest 网络失败不抛异常', async () => {
  const result = await checkLatest({ timeoutMs: 1 });
  assert.equal(typeof result.ok, 'boolean');
  if (!result.ok) assert.equal(typeof result.error, 'string');
});

test('checkedToday 返回布尔', () => {
  assert.equal(typeof checkedToday(), 'boolean');
});
