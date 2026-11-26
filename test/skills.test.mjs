import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  installAgents,
  installCommands,
  installSkills,
  listAgentNames,
  listCommandNames,
  listSkillNames,
  pruneSkills,
  skillsSource,
} from '../src/lib/skills.mjs';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-skills-'));
}

test('技能包至少 27 个，且每个都有 SKILL.md', () => {
  const names = listSkillNames();
  assert.ok(names.length >= 27, `只有 ${names.length} 个`);
  for (const name of names) {
    assert.ok(fs.existsSync(path.join(skillsSource(), name, 'SKILL.md')), `${name} 缺 SKILL.md`);
  }
});

test('22 个 full-dev skill 与 5 个闸 skill 都在', () => {
  const names = new Set(listSkillNames());
  const required = [
    'ai-spec',
    'prd',
    'intent-grill',
    'goal-driven-development',
    'code-review',
    'code-debugger',
    'ralph',
    'ralph-yolo',
    'iteration-manager',
    'project-health-audit',
    'dev-host-init',
    'security-audit',
    'ux-experience-audit',
    'api-first-modular',
    'codebase-context',
    'debug-ui',
    'dev-env-scan',
    'discover-skill-opportunities',
    'fork-sync',
    'gh-actions-architect',
    'loop-engineer',
    'nodejs-npm-auto-release',
    'shipgate',
    'shipgate-spec',
    'shipgate-quality',
    'shipgate-security',
    'shipgate-install',
  ];
  for (const name of required) assert.ok(names.has(name), `缺 ${name}`);
});

test('每个 SKILL.md 的 frontmatter 有 name 与 description', () => {
  for (const name of listSkillNames()) {
    const text = fs.readFileSync(path.join(skillsSource(), name, 'SKILL.md'), 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(front, `${name} 无 frontmatter`);
    assert.match(front[1], /^name\s*:/m, `${name} 缺 name`);
    assert.match(front[1], /^description\s*:/m, `${name} 缺 description`);
  }
});

test('commands 与 agents 清单非空', () => {
  assert.equal(listCommandNames().length, 22);
  assert.equal(listAgentNames().length, 2);
});

test('installSkills 复制到目标目录并写入 manifest', () => {
  const root = tmpdir();
  const harness = { id: 'x', skillsPath: path.join(root, 'skills') };
  const record = {};
  const result = installSkills(harness, record, { dryRun: false });
  assert.ok(result.installed.length >= 27);
  assert.ok(fs.existsSync(path.join(root, 'skills', 'ai-spec', 'SKILL.md')));
  assert.ok(Object.keys(record.skills).length >= 27);
});

test('installSkills 第二次运行全部跳过（幂等）', () => {
  const root = tmpdir();
  const harness = { id: 'x', skillsPath: path.join(root, 'skills') };
  const record = {};
  installSkills(harness, record, { dryRun: false });
  const second = installSkills(harness, record, { dryRun: false });
  assert.equal(second.installed.length, 0);
  assert.ok(second.skipped.length >= 27);
});

test('installCommands / installAgents 在 harness 无对应目录时明确跳过', () => {
  const record = {};
  const harness = { id: 'pi', skillsPath: null, commandsPath: null, agentsPath: null };
  assert.equal(installCommands(harness, record).skippedReason, 'harness 无 commands 目录');
  assert.equal(installAgents(harness, record).skippedReason, 'harness 无 agents 目录');
});

test('pruneSkills 只删 manifest 记录且包里已不存在的 skill', () => {
  const root = tmpdir();
  const skillsDir = path.join(root, 'skills');
  fs.mkdirSync(path.join(skillsDir, 'ghost-skill'), { recursive: true });
  fs.mkdirSync(path.join(skillsDir, 'user-own-skill'), { recursive: true });
  const record = { skills: { 'ghost-skill': { hash: 'x' } } };

  const removed = pruneSkills({ id: 'x', skillsPath: skillsDir }, record, { dryRun: false });
  assert.deepEqual(removed, ['ghost-skill']);
  assert.equal(fs.existsSync(path.join(skillsDir, 'ghost-skill')), false);
  assert.equal(fs.existsSync(path.join(skillsDir, 'user-own-skill')), true, '不碰用户自己的 skill');
});
