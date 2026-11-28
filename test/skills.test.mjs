import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SKILL_DESCRIPTION_MAX,
  auditSkillRoot,
  installAgents,
  installCommands,
  installSkills,
  hashTree,
  listAgentNames,
  listCommandNames,
  listSkillNames,
  parseSkillFrontmatter,
  pruneSkills,
  skillsBackupDir,
  skillsSource,
  validateSkillName,
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

// --- skill 根卫生（CHG-20261128-skill-root-hygiene）---

function writeSkill(file, front) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${front}\n---\n\n# x\n`);
}

test('分发的每个 skill 都满足 Agent Skills 规范（name / description）', () => {
  const issues = [];
  for (const name of listSkillNames()) {
    const file = path.join(skillsSource(), name, 'SKILL.md');
    const front = parseSkillFrontmatter(fs.readFileSync(file, 'utf8'));
    for (const message of validateSkillName(front.name ?? name)) issues.push(`${name}: ${message}`);
    const description = (front.description ?? '').trim();
    if (description === '') issues.push(`${name}: description 缺失`);
    else if (description.length > SKILL_DESCRIPTION_MAX) {
      issues.push(`${name}: description ${description.length} > ${SKILL_DESCRIPTION_MAX}`);
    }
  }
  assert.deepEqual(issues, []);
});

test('skillsBackupDir 永远落在 skills 根之外（根内备份会被当成 skill 加载）', () => {
  const backup = skillsBackupDir('skills-flat', '2026-01-01');
  assert.ok(path.isAbsolute(backup));
  assert.ok(backup.endsWith(path.join('backups', 'skills-flat-2026-01-01')), backup);
  for (const root of [path.join(os.homedir(), '.claude', 'skills'), path.join(os.homedir(), '.agents', 'skills')]) {
    const rel = path.relative(root, backup);
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), `备份 ${backup} 落进了 ${root}`);
  }
});

test('validateSkillName 与 loader 规则一致', () => {
  for (const bad of ['_flat-backup', 'auto version and publish', 'a--b', '-a', 'a'.repeat(65), 'Upper']) {
    assert.ok(validateSkillName(bad).length > 0, `${bad} 应判非法`);
  }
  assert.deepEqual(validateSkillName('a-b-1'), []);
});

test('auditSkillRoot：伪技能目录、同名碰撞、超长 description 都报出来', () => {
  const root = tmpdir();
  writeSkill(path.join(root, 'ai-spec', 'SKILL.md'), 'name: ai-spec\ndescription: 真身');
  writeSkill(path.join(root, 'ai-spec.md'), 'name: ai-spec\ndescription: 旧版扁平');
  writeSkill(path.join(root, 'deep', 'nested', 'SKILL.md'), 'name: nested\ndescription: 深层目录也是 skill');
  writeSkill(path.join(root, 'long', 'SKILL.md'), `name: long\ndescription: ${'x'.repeat(1100)}`);
  writeSkill(path.join(root, '_flat-backup', 'a.md'), 'description: 无 name，会被回落成目录名');
  writeSkill(path.join(root, '_flat-backup', 'b.md'), 'name: b\ndescription: 同名旧版');
  fs.mkdirSync(path.join(root, 'empty-dir'), { recursive: true });

  const audit = auditSkillRoot(root);
  assert.equal(audit.skills, 4, 'ai-spec / nested / long / 根级扁平 md');
  assert.deepEqual(audit.strayDirs.map((s) => path.basename(s.dir)), ['_flat-backup']);
  assert.equal(audit.strayDirs[0].mdCount, 2);
  assert.deepEqual(audit.collisions.map((c) => c.name), ['ai-spec']);
  assert.equal(audit.collisions[0].winner, path.join(root, 'ai-spec', 'SKILL.md'));
  assert.deepEqual(audit.longDescriptions.map((d) => d.length), [1100]);
  assert.deepEqual(audit.invalidNames, [], '根内子目录的扁平 md 不重复报 name 问题，只作为 strayDir');
  assert.deepEqual(auditSkillRoot(null), { root: null, skills: 0, invalidNames: [], longDescriptions: [], collisions: [], strayDirs: [] });
});

test('auditSkillRoot：干净目录零发现', () => {
  const root = tmpdir();
  writeSkill(path.join(root, 'one', 'SKILL.md'), 'name: one\ndescription: ok');
  const audit = auditSkillRoot(root);
  assert.equal(audit.skills, 1);
  assert.deepEqual(
    [audit.invalidNames, audit.longDescriptions, audit.collisions, audit.strayDirs],
    [[], [], [], []],
  );
});

// --- CHG-20261128-gate-bundle-integrity v2：技能目录整棵哈希 ---

test('hashTree：入口或嵌套文件任一变化都改变摘要', () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'name: x\ndescription: y\n');
  fs.writeFileSync(path.join(dir, 'scripts', 'run.py'), 'print(1)\n');

  const base = hashTree(dir);
  fs.writeFileSync(path.join(dir, 'scripts', 'run.py'), 'print(2)\n');
  const nestedChanged = hashTree(dir);
  assert.notEqual(nestedChanged, base, '嵌套文件改动必须改变摘要');

  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'name: x\ndescription: z\n');
  assert.notEqual(hashTree(dir), nestedChanged, '入口改动也必须改变摘要');
});

test('installSkills：目的目录的嵌套文件被篡改后会重新分发', () => {
  const dest = tmpdir();
  const harness = { id: 'probe', skillsPath: dest };
  const record = {};

  installSkills(harness, record);
  const nested = path.join(dest, 'dev-host-init', 'scripts', 'tools-catalog.py');
  assert.ok(fs.existsSync(nested), '安装后应存在嵌套脚本');
  fs.writeFileSync(nested, '# tampered\n');

  const again = installSkills(harness, record);
  assert.ok(again.installed.includes('dev-host-init'), '嵌套文件与源不一致时必须重拷');
  assert.notEqual(fs.readFileSync(nested, 'utf-8'), '# tampered\n', '篡改必须被源内容覆盖');
});
