import assert from 'node:assert/strict';
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
  assert.equal(pi.commandsPath.endsWith('/.pi/agent/prompts'), true);
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
