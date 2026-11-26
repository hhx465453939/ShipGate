import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderBlock, upsertBlock, blockVersion } from '../src/inject/render.mjs';
import { backupOnce } from '../src/lib/fsx.mjs';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shipgate-inject-'));
}

const block = renderBlock({ version: '0.1.0', min: 80 });

test('渲染出的区块有 begin/end 标记且无时间戳', () => {
  assert.equal(blockVersion(block), 'v1');
  assert.match(block, /<!-- shipgate:begin v1 -->/);
  assert.match(block, /<!-- shipgate:end -->/);
  assert.doesNotMatch(block, /\d{4}-\d{2}-\d{2}T/);
});

test('文件不存在 → created，且内容含区块', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  const result = upsertBlock(file, block);
  assert.equal(result.action, 'created');
  assert.match(fs.readFileSync(file, 'utf8'), /shipgate:begin/);
});

test('已有用户内容但无区块 → appended，用户内容一字不动', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  const user = '# 我的规则\n\n第一行\n第二行\n';
  fs.writeFileSync(file, user);
  const result = upsertBlock(file, block);
  assert.equal(result.action, 'appended');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(user.trimEnd()));
  assert.ok(after.includes('shipgate:begin'));
});

test('幂等：第二次执行 unchanged，字节完全一致', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  fs.writeFileSync(file, '# 用户内容\n');
  upsertBlock(file, block);
  const first = fs.readFileSync(file, 'utf8');
  const second = upsertBlock(file, block);
  assert.equal(second.action, 'unchanged');
  assert.equal(fs.readFileSync(file, 'utf8'), first);
});

test('区块内更新只替换区块，区块外行数不变', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  const user = '# 头部\nA\nB\nC\n# 尾部\n';
  fs.writeFileSync(file, user);
  upsertBlock(file, block);
  const before = fs.readFileSync(file, 'utf8');
  const next = upsertBlock(file, renderBlock({ version: '9.9.9', min: 90 }));
  assert.equal(next.action, 'updated');
  const after = fs.readFileSync(file, 'utf8');
  assert.equal(after.split('\n').length - block.split('\n').length, before.split('\n').length - block.split('\n').length);
  assert.match(after, /9\.9\.9/);
});

test('备份每天只留一份', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  fs.writeFileSync(file, 'x');
  const first = backupOnce(file);
  const second = backupOnce(file);
  assert.equal(first, second);
  assert.ok(first.endsWith('.shipgate-bak.' + new Date().toISOString().slice(0, 10)));
});

test('dry-run 不写盘', () => {
  const file = path.join(tmpdir(), 'CLAUDE.md');
  const result = upsertBlock(file, block, { dryRun: true });
  assert.equal(result.action, 'created');
  assert.equal(fs.existsSync(file), false);
});
