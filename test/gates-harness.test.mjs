import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mergePolicy } from '../src/lib/gate.mjs';
import { allHarnesses, capabilities, resolveHarness } from '../src/harness/index.mjs';
import { askSelection, canPrompt } from '../src/commands/ask.mjs';
import { DEFAULTS, mergeConfig } from '../src/lib/cfg.mjs';

test('mergePolicy：config 以全局为准，protected 取并集', () => {
  const globalPolicy = { config: { destructive_mode: 'enforce', protected_worktrees: ['/a'] } };
  const existing = { config: { destructive_mode: 'bypass', protected_worktrees: ['/b'] }, extra: { keep: true } };
  const merged = mergePolicy(globalPolicy, existing);
  assert.equal(merged.config.destructive_mode, 'enforce');
  assert.deepEqual(merged.config.protected_worktrees.sort(), ['/a', '/b']);
  assert.deepEqual(merged.extra, { keep: true }, '既有非 config 段必须保留');
});

test('mergePolicy：无既有文件时直接用全局', () => {
  const globalPolicy = { config: { destructive_mode: 'enforce', protected_worktrees: ['/x'] } };
  const merged = mergePolicy(globalPolicy, null);
  assert.deepEqual(merged.config.protected_worktrees, ['/x']);
});

test('claude 有 skills/commands/agents；pi 有硬门控与 prompts 命令', () => {
  const claude = resolveHarness(allHarnesses(DEFAULTS).find((h) => h.id === 'claude'));
  const claudeCaps = capabilities(claude);
  assert.equal(claudeCaps.commands, true);
  assert.equal(claudeCaps.agents, true);
  assert.equal(claudeCaps.gate, false);

  const pi = resolveHarness(allHarnesses(DEFAULTS).find((h) => h.id === 'pi'));
  const piCaps = capabilities(pi);
  assert.equal(piCaps.gate, true);
  assert.equal(piCaps.commands, true, 'pi 的 ~/.pi/agent/prompts 可直接复用 commands');
  assert.equal(piCaps.agents, false, 'pi 没有 subagent 目录');
  assert.equal(pi.commandsPath.endsWith(path.join('.pi', 'agent', 'prompts')), true);
});

test('内置 dsh 带 dsh 适配的硬门控', () => {
  const dsh = resolveHarness(allHarnesses(DEFAULTS).find((h) => h.id === 'dsh'));
  assert.ok(dsh, '应存在内置 dsh profile');
  assert.equal(capabilities(dsh).gate, true);
  assert.equal(dsh.gate.kind, 'dsh');
});

test('自定义 harness 可带 commands/agents/gate', () => {
  const cfg = mergeConfig(DEFAULTS, {
    custom: {
      myagent: {
        label: 'My Agent',
        skills: '~/.myagent/skills',
        commands: '~/.myagent/commands',
        inject: '~/.myagent/AGENTS.md',
        gate: { dest: '~/.myagent/extensions/enforce-rules', kind: 'dsh' },
      },
    },
  });
  const mine = resolveHarness(allHarnesses(cfg).find((h) => h.id === 'myagent'));
  const caps = capabilities(mine);
  assert.equal(caps.commands, true);
  assert.equal(caps.gate, true);
  assert.equal(mine.gate.kind, 'dsh');
});

test('非 TTY 时 askSelection 直接返回全部，不挂起', async () => {
  assert.equal(canPrompt(), false, '测试环境应非 TTY');
  const harnesses = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const result = await askSelection(harnesses);
  assert.equal(result.selected.length, 2);
  assert.match(result.note, /非交互环境/);
});

// --- CHG-20261128-gate-bundle-integrity ---

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('mergePolicy：global 只提供 config，不污染出厂文档', () => {
  const shipped = { name: 'graph-first-gate', version: 7, checks: ['a'], reminder: 'SHIPPED', config: { x: 1 } };
  const pollutedTruth = { name: 'graph-first-gate', version: 5, reminder: 'STALE', config: { destructive_mode: 'bypass' } };
  const merged = mergePolicy(pollutedTruth, shipped);
  assert.equal(merged.version, 7, '文档必须来自 base（出厂）');
  assert.equal(merged.reminder, 'SHIPPED', '真源里的旧文档字段不得覆盖 base');
  assert.deepEqual(merged.checks, ['a']);
  assert.equal(merged.config.destructive_mode, 'bypass', 'config 仍以真源为准');
});

test('installGateBundle：出厂文档 + 真源 config-only + dsh 可加载产物', () => {
  const home = tmp('sg-gate-install-');
  const piDir = path.join(home, '.pi', 'agent', 'extensions', 'enforce-rules');
  const dshDir = path.join(home, '.dsh', 'extensions', 'enforce-rules');
  fs.mkdirSync(dshDir, { recursive: true });
  // 历史遗留：一份 v5 旧文档，且用户在本地登记过受保护目录
  fs.writeFileSync(
    path.join(dshDir, 'policy.json'),
    JSON.stringify(
      {
        name: 'graph-first-gate',
        version: 5,
        reminder: 'OLD-V5-REMINDER',
        config: { destructive_mode: 'bypass', protected_worktrees: ['/opt/keep-me'] },
      },
      null,
      2,
    ),
  );

  const gateUrl = new URL('../src/lib/gate.mjs', import.meta.url).href;
  const script = `
    import { installGateBundle } from ${JSON.stringify(gateUrl)};
    const dsh = { id: 'dsh', gateDest: ${JSON.stringify(dshDir)}, gate: { kind: 'dsh' } };
    const pi = { id: 'pi', gateDest: ${JSON.stringify(piDir)}, gate: { kind: 'pi' } };
    installGateBundle(dsh);
    installGateBundle(pi);
  `;
  const runOnce = () =>
    spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: path.resolve('.'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf-8',
    });

  const first = runOnce();
  assert.equal(first.status, 0, first.stderr);

  const truthFile = path.join(home, '.config', 'shipgate', 'gate-policy.json');
  const truth = JSON.parse(fs.readFileSync(truthFile, 'utf-8'));
  assert.deepEqual(Object.keys(truth), ['config'], '真源只保存 config');
  assert.ok(truth.config.protected_worktrees.includes('/opt/keep-me'), 'harness 本地受保护目录必须提升回真源');

  const dshPolicy = JSON.parse(fs.readFileSync(path.join(dshDir, 'policy.json'), 'utf-8'));
  const shippedDsh = JSON.parse(fs.readFileSync(path.resolve('assets/gates/dsh/policy.json'), 'utf-8'));
  assert.equal(dshPolicy.version, shippedDsh.version, '文档版本必须是 dsh 出厂版');
  assert.notEqual(dshPolicy.reminder, 'OLD-V5-REMINDER', '旧文档不得残留');
  assert.ok(dshPolicy.checks.length > 0, '出厂 checks 必须保留');
  assert.match(fs.readFileSync(path.join(dshDir, 'index.js'), 'utf-8'), /\.\/dsh\/index\.js/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dshDir, 'package.json'), 'utf-8')).type, 'module');

  const piPolicy = JSON.parse(fs.readFileSync(path.join(piDir, 'policy.json'), 'utf-8'));
  const shippedPi = JSON.parse(fs.readFileSync(path.resolve('assets/gates/pi/policy.json'), 'utf-8'));
  assert.equal(piPolicy.version, shippedPi.version);
  assert.match(fs.readFileSync(path.join(piDir, 'index.js'), 'utf-8'), /\.\/pi\/index\.js/);
  assert.equal(fs.existsSync(path.join(piDir, 'package.json')), false, 'pi 不需要 type:module 垫片');

  const second = runOnce();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(truthFile, 'utf-8'))), ['config'], '重复安装必须幂等');
});
