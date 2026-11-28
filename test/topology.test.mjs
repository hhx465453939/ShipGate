import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { allHarnesses, capabilities, resolveHarness } from '../src/harness/index.mjs';
import { DEFAULTS } from '../src/lib/cfg.mjs';
import { detectLegacyGates } from '../src/lib/gate.mjs';
import { installSkills, detectFlatSkillDuplicates } from '../src/lib/skills.mjs';
import { checkEngines, missingEngineHints } from '../src/lib/engines.mjs';
import { install, reportLegacyGates } from '../src/commands/deploy.mjs';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function builtin(id) {
  return resolveHarness(allHarnesses(DEFAULTS).find((h) => h.id === id));
}

test('kimi：skills 与注入落在 ~/.kimi-code，无 commands/agents/gate', () => {
  const h = builtin('kimi');
  const caps = capabilities(h);
  assert.equal(caps.skills, true);
  assert.equal(caps.inject, true);
  assert.equal(caps.commands, false, 'Kimi 不支持 Claude custom commands');
  assert.equal(caps.agents, false);
  assert.equal(caps.gate, false, 'Kimi 没有可挂扩展的钩子面');
  assert.ok(h.skillsPath.endsWith(path.join('.kimi-code', 'skills')));
  assert.ok(h.injectPath.endsWith(path.join('.kimi-code', 'AGENTS.md')));
});

test('antigravity：skills 落在 ~/.gemini/antigravity/skills，不猜注入路径', () => {
  const h = builtin('antigravity');
  const caps = capabilities(h);
  assert.equal(caps.skills, true);
  assert.equal(caps.inject, false, '全局规则文档路径未验证，不得编造');
  assert.equal(caps.gate, false);
  assert.ok(h.skillsPath.endsWith(path.join('.gemini', 'antigravity', 'skills')));
});

test('dsh 的 skills 落点是与 pi 共享的 ~/.agents/skills（不是 ~/.dsh/skills）', () => {
  const dsh = builtin('dsh');
  const pi = builtin('pi');
  // 声明路径才是共享根；skillsPath 已跟随链接到 claude/skills。
  assert.ok(
    dsh.skillsDeclaredPath.endsWith(path.join('.agents', 'skills')),
    `dsh skillsDeclaredPath=${dsh.skillsDeclaredPath}`,
  );
  assert.equal(dsh.skillsDeclaredPath, pi.skillsDeclaredPath, 'dsh 与 pi 必须共用同一条技能根');
  assert.equal(dsh.skillsPath, pi.skillsPath, '跟随链接后的真实落点也必须一致');
});

test('zcode 不纳入内置（未装 + GUI IDE 自有内核）', () => {
  const ids = allHarnesses(DEFAULTS).map((h) => h.id);
  assert.equal(ids.includes('zcode'), false);
});

test('skills 路径是链接时跟随到真实目标，并标记 followed', () => {
  const root = tmp('sg-link-');
  const real = path.join(root, 'claude-skills');
  const link = path.join(root, 'agents-skills');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, link, 'junction');

  const h = resolveHarness({ id: 'x', label: 'x', skills: link, commands: null, agents: null, inject: null, gate: null });
  assert.equal(h.skillsFollowed, true);
  assert.equal(h.skillsBroken, false);
  assert.equal(fs.realpathSync(h.skillsPath), fs.realpathSync(real));
});

test('skills 链接断开时 fail-closed，不静默替换链接', () => {
  const root = tmp('sg-broken-');
  const link = path.join(root, 'gone');
  fs.symlinkSync(path.join(root, 'nope'), link, 'junction');

  const h = resolveHarness({ id: 'x', label: 'x', skills: link, commands: null, agents: null, inject: null, gate: null });
  assert.equal(h.skillsFollowed, true);
  assert.equal(h.skillsBroken, true);
  assert.throws(() => installSkills(h, {}, { dryRun: true }), /链接已断开/);
});

test('detectLegacyGates：识别第二份硬门控、第二 policy 真源与 dsh 误挂', () => {
  const home = tmp('sg-legacy-');
  // 第二份门控必须是真门控产物（含 policy.js），不能凭目录名猜。
  fs.mkdirSync(path.join(home, '.pi', 'agent', 'extensions', 'legacy-gate'), { recursive: true });
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'extensions', 'legacy-gate', 'policy.js'), '// engine\n');
  fs.mkdirSync(path.join(home, '.pi', 'agent', 'extensions', 'enforce-rules'), { recursive: true });
  fs.mkdirSync(path.join(home, '.dsh', 'plugins', 'agent-config-gates'), { recursive: true });
  fs.writeFileSync(path.join(home, '.dsh', 'plugins', 'agent-config-gates', 'policy.js'), '// engine\n');
  fs.mkdirSync(path.join(home, '.dsh', 'profiles', 'main'), { recursive: true });
  fs.mkdirSync(path.join(home, '.config', 'agent-config-bridge'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.config', 'agent-config-bridge', 'gate-policy.json'),
    JSON.stringify({ config: { destructive_mode: 'bypass' } }),
  );
  fs.writeFileSync(
    path.join(home, '.dsh', 'profiles', 'main', 'cordis.patch.yml'),
    "- insert:\n    - id: enforce-rules\n      name: '../../plugins/agent-config-gates/dsh/index.js'\n",
  );

  const found = detectLegacyGates({ home });
  assert.equal(found.bridgePiGate, path.join(home, '.pi', 'agent', 'extensions', 'legacy-gate'));
  assert.ok(found.shipGatePi);
  assert.ok(found.bridgeDshGate);
  assert.ok(found.bridgePolicy);
  assert.equal(found.bridgePolicyMode, 'bypass');
  assert.deepEqual(found.dshMounted, ['agent-config-gates']);
});

test('detectLegacyGates：provider 扩展（只有 index.ts）不得被当成门控', () => {
  // 回归：旧检测只看目录是否存在，把用户自己的 provider 网关扩展误报为
  // 「第二份门控」，并建议移走——移走会让模型接入直接失败。
  const home = tmp('sg-provider-');
  const ext = path.join(home, '.pi', 'agent', 'extensions');
  fs.mkdirSync(path.join(ext, 'enforce-rules'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'enforce-rules', 'policy.js'), '// engine\n');
  fs.mkdirSync(path.join(ext, 'coding-gateways'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'coding-gateways', 'index.ts'), '// provider gateway\n');
  fs.writeFileSync(path.join(ext, 'coding-gateways', 'README.md'), '# gateway\n');

  const found = detectLegacyGates({ home });
  assert.equal(found.bridgePiGate, null, 'provider 扩展不是门控');
  assert.deepEqual(found.rivalGates, []);
  assert.deepEqual(reportLegacyGates(home).filter((f) => f.code === 'LEGACY_GATE_DUPLICATE'), []);
});

test('detectLegacyGates：干净机器不误报', () => {
  const home = tmp('sg-clean-');
  const found = detectLegacyGates({ home });
  assert.equal(found.bridgePiGate, null);
  assert.equal(found.bridgePolicy, null);
  assert.deepEqual(found.dshMounted, []);
});

test('LEGACY_GATE_DUPLICATE 的停用命令把目录移出 extensions（留在目录内改名仍会被加载）', () => {
  const home = tmp('sg-quarantine-');
  const ext = path.join(home, '.pi', 'agent', 'extensions');
  fs.mkdirSync(path.join(ext, 'legacy-gate'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'legacy-gate', 'policy.js'), '// engine\n');
  fs.mkdirSync(path.join(ext, 'enforce-rules'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'enforce-rules', 'policy.js'), '// engine\n');

  const findings = reportLegacyGates(home);
  const dup = findings.find((f) => f.code === 'LEGACY_GATE_DUPLICATE');
  assert.ok(dup, '应报告 LEGACY_GATE_DUPLICATE');
  assert.ok(dup.command.includes('extensions-disabled'), '目标必须在 extensions 之外');
  assert.equal(dup.command.includes('legacy-gate.disabled'), false, '不能只在 extensions 内改名');
});

test('detectFlatSkillDuplicates：扁平 md 与同名目录并存时全部命中，不误报无关 md', () => {
  const dir = tmp('sg-flat-');
  fs.mkdirSync(path.join(dir, 'ai-spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ai-spec', 'SKILL.md'), 'name: ai-spec\n');
  fs.writeFileSync(path.join(dir, 'ai-spec.md'), 'name: ai-spec\n');
  fs.mkdirSync(path.join(dir, 'only-dir'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'only-dir', 'SKILL.md'), 'name: only-dir\n');
  fs.writeFileSync(path.join(dir, 'loose.md'), 'notes\n');

  assert.deepEqual(detectFlatSkillDuplicates(dir), ['ai-spec']);
  assert.deepEqual(detectFlatSkillDuplicates(null), []);
});

test('LEGACY_POLICY_SOURCE：两份 mode 相同时降为 info，不同时才是 warn', () => {
  const home = tmp('sg-policy-level-');
  fs.mkdirSync(path.join(home, '.config', 'agent-config-bridge'), { recursive: true });
  const file = path.join(home, '.config', 'agent-config-bridge', 'gate-policy.json');
  fs.writeFileSync(file, JSON.stringify({ config: { destructive_mode: 'bypass' } }));

  const sameMode = reportLegacyGates(home).find((f) => f.code === 'LEGACY_POLICY_SOURCE');
  assert.ok(sameMode, '应报告 LEGACY_POLICY_SOURCE');
  // 只有当 ShipGate 真源也确为 bypass 时，才断言已被降级为 info。
  if (sameMode.message.includes('与 ShipGate 相同')) assert.equal(sameMode.level, 'info');

  fs.writeFileSync(file, JSON.stringify({ config: { destructive_mode: 'enforce' } }));
  const other = reportLegacyGates(home).find((f) => f.code === 'LEGACY_POLICY_SOURCE');
  assert.ok(other.command, '必须给出一条可执行命令');
  if (process.platform === 'win32') {
    assert.ok(other.command.startsWith('Move-Item'), 'Windows 必须给 PowerShell 语法');
  } else {
    assert.ok(other.command.startsWith('mv '), 'POSIX 必须给 mv');
  }
});

test('--with-goal-mode 与 --with-auto-continue 互斥，退出码 2', async () => {
  const code = await install({
    cwd: process.cwd(),
    cfg: DEFAULTS,
    flags: { 'with-goal-mode': true, 'with-auto-continue': true },
    args: [],
  });
  assert.equal(code, 2);
});

test('cursor：skills 分发到 ~/.cursor/skills（内置 skill 另在 skills-cursor）', () => {
  const h = builtin('cursor');
  assert.ok(h.skillsPath, 'cursor 不该再是 skills: null');
  assert.equal(h.skillsPath.endsWith(path.join('.cursor', 'skills')), true, h.skillsPath);
  assert.equal(capabilities(h).skills, true);
  assert.ok(h.injectPath.endsWith(path.join('.cursor', 'rules', 'shipgate.mdc')));
});

test('checkEngines：无 pipx 给两步式命令，有 pipx 才给 pipx', () => {
  const original = process.env.PATH;
  try {
    // 没有 pipx：提示必须能照拄执行（clone + 显式索引），不能只写 pipx
    process.env.PATH = tmp('shipgate-nopipx-');
    const bare = checkEngines({ cwd: process.cwd() });
    assert.match(bare.cbh.install, /git clone/);
    assert.match(bare.cbh.install, /pypi\.org\/simple/);
    assert.equal(bare.cbh.noVersionFlag, true);
    assert.equal(typeof bare.cbh.onPath, 'boolean');

    // 有 pipx：走隔离 venv 的一步式
    const stub = tmp('shipgate-pipx-');
    const exe = path.join(stub, process.platform === 'win32' ? 'pipx.EXE' : 'pipx');
    fs.writeFileSync(exe, '');
    if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
    process.env.PATH = [stub, original].join(path.delimiter);
    const withPipx = checkEngines({ cwd: process.cwd() });
    assert.match(withPipx.cbh.install, /^pipx install git\+/);
  } finally {
    process.env.PATH = original;
  }
});

test('missingEngineHints：齐全时为空，缺哪个就只给哪个的命令', () => {
  const both = {
    aislop: { bin: '/x/aislop', install: 'npm i -g aislop' },
    cbh: { bin: '/y/cbh', install: 'pipx install git+https://example/cbh' },
  };
  assert.deepEqual(missingEngineHints(both), []);

  const onlyCbhMissing = { ...both, cbh: { bin: null, install: 'git clone … && pip install -i https://pypi.org/simple …' } };
  const hints = missingEngineHints(onlyCbhMissing);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].name, 'cbh');
  assert.match(hints[0].install, /pypi\.org\/simple/);
});
