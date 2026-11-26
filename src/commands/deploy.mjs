import path from 'node:path';
import { VERSION } from '../version.mjs';
import { c, log, table } from '../lib/log.mjs';
import { exists, latestBackup, readIfExists, writeText, backupOnce } from '../lib/fsx.mjs';
import { loadManifest, saveManifest, ensureHarnessRecord, harnessRecord } from '../lib/state.mjs';
import { selectHarnesses, allHarnesses, resolveHarness, detected, getHarness } from '../harness/index.mjs';
import { installSkills, pruneSkills, installGateBundle, skillsSource } from '../lib/skills.mjs';
import { renderBlock, upsertBlock, blockVersion, cursorFrontmatter } from '../inject/render.mjs';
import { resolveAislop } from '../gates/quality.mjs';
import { runShipGate } from '../gates/ship.mjs';
import { which, version as toolVersion } from '../lib/exec.mjs';
import { checkLatest, selfUpdate, checkedToday, markChecked } from '../lib/update.mjs';

function targets(ctx, { includeUndetected = false } = {}) {
  return selectHarnesses({
    requested: ctx.flags.harness,
    cfg: ctx.cfg,
    includeUndetected,
  });
}

function reportMissing(missing) {
  for (const harness of missing) {
    log.warn(`${harness.label}（${harness.id}）未检测到：${harness.detectPath ?? '无探测路径'}，跳过`);
  }
}

export function injectOne(harness, cfg, { dryRun = false } = {}) {
  if (!harness.injectPath) return { action: 'none' };
  const block = renderBlock({ version: VERSION, min: cfg.quality.min });
  const frontmatter = harness.injectPath.endsWith('.mdc') && readIfExists(harness.injectPath) === null ? cursorFrontmatter() : null;
  return upsertBlock(harness.injectPath, block, { dryRun, frontmatter });
}

export function installOne(ctx, harness, manifest) {
  const dryRun = Boolean(ctx.flags['dry-run']);
  const record = ensureHarnessRecord(manifest, harness.id);
  record.version = VERSION;
  record.managed = true;

  const skills = installSkills(harness, record, { dryRun });
  const gate = installGateBundle(harness, { dryRun });
  const inject = injectOne(harness, ctx.cfg, { dryRun });
  if (!dryRun && inject.action !== 'none') {
    record.inject = { file: harness.injectPath, version: blockVersion(renderBlock({ version: VERSION, min: ctx.cfg.quality.min })), updatedAt: new Date().toISOString() };
  }

  const pruned = ctx.flags.prune ? pruneSkills(harness, record, { dryRun }) : [];

  log.step(`${harness.label} (${harness.id})${dryRun ? c.dim(' — dry-run') : ''}`);
  if (skills.installed.length) log.ok(`  skills 安装 ${skills.installed.join(', ')}`);
  if (skills.skipped.length) log.info(`  ${c.dim(`skills 无变化 ${skills.skipped.length} 个（hash 一致）`)}`);
  if (harness.gateDest) log.ok(`  硬门控 → ${harness.gateDest}${gate.policyPreserved ? c.dim('（保留既有 policy.json）') : ''}`);
  if (inject.action !== 'none') log.ok(`  注入 → ${harness.injectPath} [${inject.action}]`);
  for (const name of pruned) log.info(`  ${c.dim(`已清理旧 skill ${name}`)}`);
}

export function checkEngines(ctx) {
  const aislopBin = resolveAislop(ctx.cwd);
  const cbhBin = which('cbh');
  return {
    aislop: { bin: aislopBin, version: aislopBin ? toolVersion(aislopBin) : null, install: 'npm i -g aislop' },
    cbh: { bin: cbhBin, version: cbhBin ? toolVersion(cbhBin) : null, install: 'pipx install git+https://github.com/elementalsouls/Claude-BugHunter' },
  };
}

export async function printUpdateHint() {
  if (checkedToday()) return;
  const result = await checkLatest();
  markChecked();
  if (!result.ok) return;
  if (result.outdated) {
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
    const isDetected = detected(harness);
    const skillsCount = Object.keys(record.skills ?? {}).length;
    const injectState = harness.injectPath && exists(harness.injectPath) ? blockVersion(readIfExists(harness.injectPath) ?? '') ?? 'no-block' : 'missing';
    const gateState = harness.gateDest ? (exists(harness.gateDest) ? 'present' : 'missing') : '-';
    rows.push([
      harness.id,
      isDetected ? 'yes' : 'no',
      String(skillsCount),
      injectState,
      gateState,
    ]);
  }

  if (ctx.flags.json) {
    log.plain(JSON.stringify({ version: VERSION, node: process.version, harnesses: rows, engines }, null, 2));
    return 0;
  }

  log.title(`ShipGate ${VERSION}  ·  node ${process.version}`);
  log.plain(table(rows, ['harness', 'detected', 'skills', 'inject', 'gate']));

  log.title('引擎');
  for (const [name, info] of Object.entries(engines)) {
    if (info.bin) log.ok(`${name} ${info.version ?? ''} ${c.dim(info.bin)}`);
    else log.warn(`${name} 未安装 → ${info.install}`);
  }

  const nodeMajor = Number.parseInt(process.version.slice(1), 10);
  if (nodeMajor < 20) log.err(`node ${process.version} 低于最低要求 20`);

  const ship = runShipGate({ harnesses: harnesses.filter((h) => Object.keys(harnessRecord(manifest, h.id)?.skills ?? {}).length), manifest, skillsSource: skillsSource() });
  log.title('产物一致性');
  log.plain(`${ship.ok ? c.green('via') : c.red('✖')} ${ship.summary}`);
  for (const finding of ship.findings.slice(0, 10)) log.info(`  ${c.dim(`${finding.harness ?? ''} ${finding.message}`)}`);

  return 0;
}

export async function install(ctx) {
  const dryRun = Boolean(ctx.flags['dry-run']);
  const { selected, missing } = targets(ctx, { includeUndetected: true });
  reportMissing(missing);
  if (selected.length === 0) {
    log.err('没有可安装的 harness（用 --harness 指定，或检查 ~/.claude ~/.pi 等目录）');
    return 3;
  }

  const manifest = loadManifest();
  log.title(`安装到 ${selected.length} 个 harness${dryRun ? '（dry-run，不写盘）' : ''}`);
  for (const harness of selected) installOne(ctx, harness, manifest);

  if (!dryRun) saveManifest(manifest);

  const engines = checkEngines(ctx);
  log.title('引擎');
  const missingEngines = Object.entries(engines).filter(([, info]) => !info.bin);
  for (const [name, info] of Object.entries(engines)) {
    if (info.bin) log.ok(`${name} ${info.version ?? ''}`);
    else log.warn(`${name} 未安装 → ${info.install}`);
  }
  if (missingEngines.length === 0 && !dryRun) {
    log.info(c.dim('提示：quality 钩子需显式启用 → aislop hook install --claude'));
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
  const update = selfUpdate();
  if (!update.ok) {
    log.warn(`自动更新失败（不影响当前部署）：${update.stderr.split('\n')[0]}`);
    return;
  }
  log.ok('已更新；重装 skills 与注入区块');
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
    return [
      harness.id,
      record?.managed ? 'managed' : record ? 'installed' : '-',
      String(Object.keys(record?.skills ?? {}).length),
      record?.inject?.version ?? '-',
      record?.version ?? '-',
      harness.gateDest ? (exists(harness.gateDest) ? 'present' : 'missing') : '-',
    ];
  });

  if (ctx.flags.json) {
    log.plain(JSON.stringify({ version: VERSION, manifest, rows }, null, 2));
    return 0;
  }
  log.title('ShipGate 受管状态');
  log.plain(table(rows, ['harness', 'state', 'skills', 'inject', 'version', 'gate']));
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
    const record = ensureHarnessRecord(manifest, id);
    record.managed = true;
    log.ok(`${id} 已纳入 ShipGate 受管（注入文件已备份：*.shipgate-bak.*）`);
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

  if (!result.ok) {
    log.warn(`无法检查更新（${result.error}），仍继续执行全局重装`);
  }
  log.step('npm i -g shipgate@latest');
  const applied = selfUpdate();
  if (!applied.ok) {
    log.err(`自更新失败：${applied.stderr.split('\n')[0] || applied.code}`);
    return 3;
  }
  log.ok('已更新；重装 skills 与注入区块');
  const manifest = loadManifest();
  for (const harness of allHarnesses(ctx.cfg).map(resolveHarness).filter(detected)) installOne(ctx, harness, manifest);
  saveManifest(manifest);
  return 0;
}
