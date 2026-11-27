import path from 'node:path';
import { VERSION } from '../version.mjs';
import { c, log, table } from '../lib/log.mjs';
import { backupOnce, exists, latestBackup, readIfExists, writeText } from '../lib/fsx.mjs';
import { ensureHarnessRecord, harnessRecord, loadManifest, saveManifest } from '../lib/state.mjs';
import { allHarnesses, capabilities, detected, getHarness, resolveHarness, selectHarnesses } from '../harness/index.mjs';
import { installAgents, installCommands, installSkills, listSkillNames, pruneSkills, skillsSource } from '../lib/skills.mjs';
import { blockVersion, cursorFrontmatter, renderBlock, upsertBlock } from '../inject/render.mjs';
import { gateStatus, installGateBundle, loadPolicy, syncPolicyToHarnesses } from '../lib/gate.mjs';
import { resolveAislop } from '../gates/quality.mjs';
import { runShipGate } from '../gates/ship.mjs';
import { version as toolVersion, which } from '../lib/exec.mjs';
import { checkLatest, checkedToday, markChecked, selfUpdate } from '../lib/update.mjs';
import { askSelection, printPlan } from './ask.mjs';

function targets(ctx, { includeUndetected = false } = {}) {
  return selectHarnesses({ requested: ctx.flags.harness, cfg: ctx.cfg, includeUndetected });
}

function reportMissing(missing) {
  for (const harness of missing) {
    log.warn(`${harness.label}（${harness.id}）未检测到：${harness.detectPath ?? '无探测路径'}，跳过`);
  }
}

export function injectOne(harness, cfg, { dryRun = false } = {}) {
  if (!harness.injectPath) return { action: 'none' };
  const block = renderBlock({ version: VERSION, min: cfg.quality.min });
  const frontmatter =
    harness.injectPath.endsWith('.mdc') && readIfExists(harness.injectPath) === null ? cursorFrontmatter() : null;
  return upsertBlock(harness.injectPath, block, { dryRun, frontmatter });
}

export function installOne(ctx, harness, manifest) {
  const dryRun = Boolean(ctx.flags['dry-run']);
  const record = ensureHarnessRecord(manifest, harness.id);
  record.version = VERSION;
  record.managed = true;

  const skills = installSkills(harness, record, { dryRun });
  const commands = installCommands(harness, record, { dryRun });
  const agents = installAgents(harness, record, { dryRun });
  const gate = installGateBundle(harness, { dryRun });
  const inject = injectOne(harness, ctx.cfg, { dryRun });

  if (!dryRun && inject.action !== 'none') {
    record.inject = {
      file: harness.injectPath,
      version: blockVersion(renderBlock({ version: VERSION, min: ctx.cfg.quality.min })),
      updatedAt: new Date().toISOString(),
    };
  }

  const pruned = ctx.flags.prune ? pruneSkills(harness, record, { dryRun }) : [];

  log.step(`${harness.label} (${harness.id})${dryRun ? c.dim(' — dry-run') : ''}`);
  if (skills.installed.length) log.ok(`  skills ${skills.installed.length} 个（共 ${listSkillNames().length} 个可分发）`);
  else if (!harness.skillsPath) log.info(`  ${c.dim('skills 跳过：harness 无 skills 目录')}`);
  if (skills.skipped.length) log.info(`  ${c.dim(`skills 无变化 ${skills.skipped.length} 个（hash 一致）`)}`);
  if (commands.installed.length) log.ok(`  commands ${commands.installed.length} 个`);
  if (commands.skippedReason) log.info(`  ${c.dim(`commands 跳过：${commands.skippedReason}`)}`);
  if (agents.installed.length) log.ok(`  agents ${agents.installed.length} 个`);
  if (agents.skippedReason) log.info(`  ${c.dim(`agents 跳过：${agents.skippedReason}`)}`);
  if (harness.gateDest) log.ok(`  硬门控 → ${harness.gateDest}（${gate.kind} 适配，policy 已合并）`);
  if (inject.action !== 'none') log.ok(`  注入 → ${harness.injectPath} [${inject.action}]`);
  for (const name of pruned) log.info(`  ${c.dim(`已清理旧 skill ${name}`)}`);
}

export function checkEngines(ctx) {
  const aislopBin = resolveAislop(ctx.cwd);
  const cbhBin = which('cbh');
  return {
    aislop: { bin: aislopBin, version: aislopBin ? toolVersion(aislopBin) : null, install: 'npm i -g aislop' },
    cbh: {
      bin: cbhBin,
      version: cbhBin ? toolVersion(cbhBin) : null,
      install: 'pipx install git+https://github.com/elementalsouls/Claude-BugHunter',
    },
  };
}

export async function printUpdateHint() {
  if (checkedToday()) return;
  const result = await checkLatest();
  markChecked();
  if (result.ok && result.outdated) {
    log.warn(`ShipGate 有新版本 ${result.latest}（当前 ${VERSION}）→ 运行 \`shipgate update\``);
  }
}

export async function doctor(ctx) {
  const manifest = loadManifest();
  const harnesses = allHarnesses(ctx.cfg).map(resolveHarness);
  const engines = checkEngines(ctx);
  const rows = [];

  for (const harness of harnesses) {
    const record = harnessRecord(manifest, harness.id) ?? {};
    const caps = capabilities(harness);
    const injectState =
      harness.injectPath && exists(harness.injectPath)
        ? (blockVersion(readIfExists(harness.injectPath) ?? '') ?? 'no-block')
        : 'missing';
    const status = caps.gate ? gateStatus(harness) : null;
    rows.push([
      harness.id,
      detected(harness) ? 'yes' : 'no',
      caps.skills ? `${Object.keys(record.skills ?? {}).length}/${listSkillNames().length}` : '-',
      `${Object.keys(record.commands ?? {}).length}${caps.commands ? '' : '(-)'}`,
      `${Object.keys(record.agents ?? {}).length}${caps.agents ? '' : '(-)'}`,
      injectState,
      status ? (status.installed ? `on(${status.mode})` : 'missing') : '-',
    ]);
  }

  if (ctx.flags.json) {
    log.plain(JSON.stringify({ version: VERSION, node: process.version, skillCount: listSkillNames().length, harnesses: rows, engines }, null, 2));
    return 0;
  }

  log.title(`ShipGate ${VERSION}  ·  node ${process.version}  ·  可分发 skill ${listSkillNames().length} 个`);
  log.plain(table(rows, ['harness', 'found', 'skills', 'cmds', 'agents', 'inject', 'gate']));

  log.title('引擎');
  for (const [name, info] of Object.entries(engines)) {
    if (info.bin) log.ok(`${name} ${info.version ?? ''} ${c.dim(info.bin)}`);
    else log.warn(`${name} 未安装 → ${info.install}`);
  }

  const nodeMajor = Number.parseInt(process.version.slice(1), 10);
  if (nodeMajor < 20) log.err(`node ${process.version} 低于最低要求 20`);

  const policy = loadPolicy();
  log.title('硬门控策略');
  log.plain(`${policy.config.destructive_mode} · 受保护工作区 ${policy.config.protected_worktrees.length} 条`);
  const gated = harnesses.filter((h) => h.gateDest).map((h) => h.id);
  const soft = harnesses.filter((h) => !h.gateDest && detected(h)).map((h) => h.id);
  if (gated.length) log.info(`  ${c.yellow('硬拦截')}：${gated.join(', ')}`);
  if (soft.length) log.info(`  ${c.dim(`软约束：${soft.join(', ')}（skills + 注入，无进程级拦截）`)}`);

  const managed = harnesses.filter((h) => Object.keys(harnessRecord(manifest, h.id)?.skills ?? {}).length);
  const ship = runShipGate({ harnesses: managed, manifest, skillsSource: skillsSource() });
  log.title('产物一致性');
  log.plain(`${ship.ok ? c.green('✔') : c.red('✖')} ${ship.summary}`);
  for (const finding of ship.findings.slice(0, 10)) log.info(`  ${c.dim(`${finding.harness ?? ''} ${finding.message}`)}`);

  return 0;
}

export async function install(ctx) {
  const dryRun = Boolean(ctx.flags['dry-run']);
  let selected = [];
  let missing = [];

  if (ctx.flags.ask && !ctx.flags.harness) {
    const candidates = allHarnesses(ctx.cfg).map(resolveHarness).filter(detected);
    if (candidates.length === 0) {
      log.err('没有探测到任何 harness（检查 ~/.claude / ~/.pi / ~/.codex 等目录）');
      return 3;
    }
    printPlan(candidates, ctx.cfg);
    const answer = await askSelection(candidates);
    if (answer.note) log.info(c.dim(answer.note));
    if (answer.selected.length === 0) {
      log.warn('未选择任何 harness，已取消');
      return 0;
    }
    selected = answer.selected;
  } else {
    const picked = targets(ctx, { includeUndetected: true });
    selected = picked.selected;
    missing = picked.missing;
    reportMissing(missing);
    if (selected.length > 0) printPlan(selected, ctx.cfg);
  }

  if (selected.length === 0) {
    log.err('没有可安装的 harness（用 --harness 指定，或检查 ~/.claude ~/.pi 等目录）');
    return 3;
  }

  const manifest = loadManifest();
  log.title(`安装到 ${selected.length} 个 harness${dryRun ? '（dry-run，不写盘）' : ''}`);
  for (const harness of selected) installOne(ctx, harness, manifest);

  if (!dryRun) {
    saveManifest(manifest);
    const gated = selected.filter((h) => h.gateDest).map(resolveHarness);
    if (gated.length > 0) {
      const touched = syncPolicyToHarnesses(gated, { dryRun: false });
      for (const item of touched) log.ok(`policy 同步 → ${item.harness}（${item.mode} / ${item.protected} 条受保护）`);
    }
  }

  const engines = checkEngines(ctx);
  log.title('引擎');
  const missingEngines = Object.entries(engines).filter(([, info]) => !info.bin);
  for (const [name, info] of Object.entries(engines)) {
    if (info.bin) log.ok(`${name} ${info.version ?? ''}`);
    else log.warn(`${name} 未安装 → ${info.install}`);
  }
  if (missingEngines.length === 0 && !dryRun) {
    log.info(c.dim('提示：quality 的 per-edit 钩子需显式启用 → aislop hook install --claude'));
  }

  if (!dryRun) await maybeAutoUpdate(ctx);
  else log.info(c.dim('dry-run 结束；去掉 --dry-run 才会写盘'));
  return 0;
}

export async function maybeAutoUpdate(ctx) {
  if (!ctx.cfg.update?.autoUpdate) return;
  const result = await checkLatest();
  markChecked();
  if (!result.ok || !result.outdated) return;
  log.step(`检测到新版本 ${result.latest}，自动更新中`);
  const updated = selfUpdate();
  if (!updated.ok) {
    log.warn(`自动更新失败（不影响当前部署）：${updated.stderr.split('\n')[0]}`);
    return;
  }
  log.ok('已更新；重装 skills / commands / agents 与注入区块');
  const manifest = loadManifest();
  for (const harness of allHarnesses(ctx.cfg).map(resolveHarness).filter(detected)) installOne(ctx, harness, manifest);
  saveManifest(manifest);
}

export async function inject(ctx) {
  const { selected, missing } = targets(ctx, { includeUndetected: true });
  reportMissing(missing);
  log.title('重渲染注入区块');
  for (const harness of selected) {
    const result = injectOne(harness, ctx.cfg, { dryRun: Boolean(ctx.flags['dry-run']) });
    if (result.action === 'none') log.info(c.dim(`${harness.id}: 无注入文件，跳过`));
    else log.ok(`${harness.id} → ${harness.injectPath} [${result.action}]`);
  }
  return 0;
}

export function status(ctx) {
  const manifest = loadManifest();
  const harnesses = allHarnesses(ctx.cfg).map(resolveHarness);
  const rows = harnesses.map((harness) => {
    const record = harnessRecord(manifest, harness.id);
    const gate = harness.gateDest ? gateStatus(harness) : null;
    return [
      harness.id,
      record?.managed ? 'managed' : record ? 'installed' : '-',
      String(Object.keys(record?.skills ?? {}).length),
      String(Object.keys(record?.commands ?? {}).length),
      String(Object.keys(record?.agents ?? {}).length),
      record?.inject?.version ?? '-',
      record?.version ?? '-',
      gate ? (gate.installed ? gate.mode : 'missing') : '-',
    ];
  });

  if (ctx.flags.json) {
    log.plain(JSON.stringify({ version: VERSION, manifest, rows }, null, 2));
    return 0;
  }
  log.title('ShipGate 受管状态');
  log.plain(table(rows, ['harness', 'state', 'skills', 'cmds', 'agents', 'inject', 'version', 'gate']));
  return 0;
}

function pickIds(ctx) {
  const raw = ctx.flags.harness ?? ctx.args[0] ?? '';
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function adopt(ctx) {
  const ids = pickIds(ctx);
  if (ids.length === 0) {
    log.err('用法：shipgate adopt <harness>');
    return 2;
  }
  const manifest = loadManifest();
  for (const id of ids) {
    const harness = resolveHarness(getHarness(id, ctx.cfg));
    if (harness.injectPath) backupOnce(harness.injectPath);
    ensureHarnessRecord(manifest, id).managed = true;
    log.ok(`${id} 已纳入 ShipGate 受管`);
  }
  saveManifest(manifest);
  return 0;
}

export function revoke(ctx) {
  const ids = pickIds(ctx);
  if (ids.length === 0) {
    log.err('用法：shipgate revoke <harness>');
    return 2;
  }
  const manifest = loadManifest();
  for (const id of ids) {
    const harness = resolveHarness(getHarness(id, ctx.cfg));
    const backup = harness.injectPath ? latestBackup(harness.injectPath) : null;
    if (backup) {
      writeText(harness.injectPath, readIfExists(backup) ?? '');
      log.ok(`${id} 注入文件已从备份恢复：${path.basename(backup)}`);
    } else {
      log.warn(`${id} 没有可用备份，未改动注入文件`);
    }
    delete manifest.harnesses[id];
  }
  saveManifest(manifest);
  return 0;
}

export function rollback(ctx) {
  const ids = pickIds(ctx);
  if (ids.length === 0) {
    log.err('用法：shipgate rollback <harness>');
    return 2;
  }
  for (const id of ids) {
    const harness = resolveHarness(getHarness(id, ctx.cfg));
    const backup = harness.injectPath ? latestBackup(harness.injectPath) : null;
    if (!backup) {
      log.warn(`${id} 没有可用备份`);
      continue;
    }
    writeText(harness.injectPath, readIfExists(backup) ?? '');
    log.ok(`${id} 已回滚到 ${path.basename(backup)}`);
  }
  return 0;
}

export async function update(ctx) {
  const result = await checkLatest();
  if (ctx.flags.check) {
    if (ctx.flags.json) {
      log.plain(JSON.stringify(result, null, 2));
    } else if (!result.ok) {
      log.warn(`无法检查更新（${result.error}）；当前 ${VERSION}`);
    } else if (result.outdated) {
      log.info(`有新版本 ${result.latest}（当前 ${VERSION}）→ shipgate update`);
    } else {
      log.ok(`已是最新 ${VERSION}`);
    }
    return 0;
  }

  if (!result.ok) log.warn(`无法检查更新（${result.error}），仍继续执行全局重装`);
  log.step('npm i -g shipgate-cli@latest');
  const applied = selfUpdate();
  if (!applied.ok) {
    log.err(`自更新失败：${applied.stderr.split('\n')[0] || applied.code}`);
    return 3;
  }
  log.ok('已更新；重装 skills / commands / agents 与注入区块');
  const manifest = loadManifest();
  for (const harness of allHarnesses(ctx.cfg).map(resolveHarness).filter(detected)) installOne(ctx, harness, manifest);
  saveManifest(manifest);
  return 0;
}
