import fs from 'node:fs';
import path from 'node:path';
import { VERSION, packageRoot } from '../version.mjs';
import { c, log, table } from '../lib/log.mjs';
import { backupOnce, earliestBackup, exists, latestBackup, readIfExists, writeText } from '../lib/fsx.mjs';
import { ensureHarnessRecord, harnessRecord, loadManifest, saveManifest } from '../lib/state.mjs';
import { allHarnesses, capabilities, detected, getHarness, resolveHarness, selectHarnesses } from '../harness/index.mjs';
import { installAgents, installCommands, installSkills, listSkillNames, pruneSkills, skillsSource, detectFlatSkillDuplicates } from '../lib/skills.mjs';
import { blockVersion, cursorFrontmatter, renderBlock, upsertBlock } from '../inject/render.mjs';
import { gateStatus, installGateBundle, loadPolicy, syncPolicyToHarnesses, detectLegacyGates } from '../lib/gate.mjs';
import { resolveAislop } from '../gates/quality.mjs';
import { runShipGate } from '../gates/ship.mjs';
import { run, version as toolVersion, which } from '../lib/exec.mjs';
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
  if (commands.overwritten?.length) {
    log.warn(`  commands 覆盖了你原有的 ${commands.overwritten.length} 个同名文件（已备份 *.shipgate-bak.*）：${commands.overwritten.slice(0, 5).join(', ')}${commands.overwritten.length > 5 ? ' …' : ''}`);
  }
  if (commands.skippedReason) log.info(`  ${c.dim(`commands 跳过：${commands.skippedReason}`)}`);
  if (agents.installed.length) log.ok(`  agents ${agents.installed.length} 个`);
  if (agents.overwritten?.length) {
    log.warn(`  agents 覆盖了你原有的 ${agents.overwritten.length} 个同名文件（已备份）：${agents.overwritten.join(', ')}`);
  }
  if (agents.skippedReason) log.info(`  ${c.dim(`agents 跳过：${agents.skippedReason}`)}`);
  if (harness.gateDest) log.ok(`  硬门控 → ${harness.gateDest}（${gate.kind} 适配，policy 已合并）`);
  if (inject.action !== 'none') log.ok(`  注入 → ${harness.injectPath} [${inject.action}]`);
  for (const name of pruned) log.info(`  ${c.dim(`已清理旧 skill ${name}`)}`);
}

const PI_EXTENSIONS = {
  'goal-mode': 'goal-mode.ts',
  'auto-continue': 'auto-continue.ts',
};

/**
 * Opt-in continuation extensions for pi. Deliberately outside the default
 * install path: they change how long an agent keeps running, which is a runtime
 * policy the operator must ask for, not something a skill pack turns on.
 */
function installPiExtension(ctx, name, { dryRun }) {
  const pi = resolveHarness(getHarness('pi', ctx.cfg));
  if (!detected(pi)) {
    log.warn(`--with-${name}：未探测到 pi（${pi.detectPath ?? '无探测路径'}），跳过`);
    return { action: 'skipped' };
  }
  const src = path.join(packageRoot(), 'assets', 'pi-extensions', PI_EXTENSIONS[name]);
  if (!exists(src)) {
    log.err(`续跑扩展源码缺失：${src}`);
    return { action: 'missing-source' };
  }
  const destDir = path.join(pi.detectPath, 'agent', 'extensions');
  const dest = path.join(destDir, PI_EXTENSIONS[name]);
  if (exists(dest)) {
    if (!dryRun) backupOnce(dest);
    log.warn(`${dest} 已存在，已备份为 *.shipgate-bak.* 后覆盖`);
  }
  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
  log.ok(`续跑扩展 → ${dest}${dryRun ? '（dry-run，不写盘）' : ''}`);
  return { action: dryRun ? 'would-install' : 'installed', dest };
}

/**
 * Platform-correct move instruction. The operator's shell decides the syntax:
 * printing `mv` to a PowerShell user (or `Move-Item` to bash) turns a fix into a
 * second failure, which already happened once.
 */
function moveCommand(from, to) {
  return process.platform === 'win32' ? `Move-Item "${from}" "${to}"` : `mv "${from}" "${to}"`;
}

function moveIntoDirCommand(from, dir) {
  return process.platform === 'win32'
    ? `New-Item -ItemType Directory -Force "${dir}" | Out-Null; Move-Item "${from}" "${dir}"`
    : `mkdir -p "${dir}" && mv "${from}" "${dir}"`;
}

/**
 * Report-only: gate artefacts left by agent-config-bridge would load alongside
 * ShipGate's bundle. Never deleted automatically — the operator gets the exact
 * command and decides.
 */
export function reportLegacyGates(home) {
  const legacy = detectLegacyGates(home ? { home } : {});
  const findings = [];
  if (legacy.bridgePiGate && legacy.shipGatePi) {
    // pi auto-discovers every subdirectory with index.js under extensions/.
    // Renaming to "*.disabled" *inside* that folder still loads it, so the only
    // correct instruction moves it to a sibling directory pi never scans.
    const quarantineDir = path.join(path.dirname(path.dirname(legacy.bridgePiGate)), 'extensions-disabled');
    findings.push({
      code: 'LEGACY_GATE_DUPLICATE',
      level: 'warn',
      message: `pi 同时存在两份门控：${legacy.bridgePiGate}（bridge）与 ${legacy.shipGatePi}（ShipGate）`,
      command: moveIntoDirCommand(legacy.bridgePiGate, quarantineDir),
    });
  }
  if (legacy.bridgePolicy) {
    const shipMode = loadPolicy().config.destructive_mode;
    const sameMode = legacy.bridgePolicyMode === shipMode;
    findings.push({
      code: 'LEGACY_POLICY_SOURCE',
      // Same mode = no behavioural conflict, only clutter. Warning every run
      // trains the operator to ignore warnings.
      level: sameMode ? 'info' : 'warn',
      message: sameMode
        ? `bridge 的第二份 policy 仍在（${legacy.bridgePolicy}，mode=${legacy.bridgePolicyMode} 与 ShipGate 相同，已不影响行为；仅建议清理）`
        : `第二份 policy 真源：${legacy.bridgePolicy}（${legacy.bridgePolicyMode}），ShipGate（${shipMode}）—— 两者不一致时拦截行为取决于加载顺序`,
      command: moveCommand(legacy.bridgePolicy, `${legacy.bridgePolicy}.disabled`),
    });
  }
  if (legacy.dshMounted.length > 0 && !legacy.dshMounted.includes('enforce-rules')) {
    findings.push({
      code: 'DSH_GATE_MISMOUNT',
      level: 'warn',
      message: `dsh 挂载的是 ${legacy.dshMounted.join(', ')}，不是 ShipGate 的 enforce-rules`,
      command: null,
    });
  }
  return findings;
}

export function checkEngines(ctx) {
  const aislopBin = resolveAislop(ctx.cwd);
  const cbhBin = which('cbh');
  const pipx = which('pipx');
  const pip = which('pip3') ?? which('pip');
  const py = which('python3') ?? which('python');

  // Fallback chain: pipx (isolated venv) → pip --user → python -m pip. Naming
  // only pipx left users without it staring at a command they cannot run.
  const cbhInstall = pipx
    ? 'pipx install git+https://github.com/elementalsouls/Claude-BugHunter'
    : pip
      ? 'pip3 install --user git+https://github.com/elementalsouls/Claude-BugHunter'
      : py
        ? 'python3 -m pip install --user git+https://github.com/elementalsouls/Claude-BugHunter'
        : '需先装 Python 3.9+，再 pipx install git+https://github.com/elementalsouls/Claude-BugHunter';

  return {
    aislop: { bin: aislopBin, version: aislopBin ? toolVersion(aislopBin) : null, install: 'npm i -g aislop' },
    cbh: { bin: cbhBin, version: cbhBin ? toolVersion(cbhBin) : null, install: cbhInstall, packageManager: pipx ? 'pipx' : pip ? 'pip3' : 'none' },
  };
}

/**
 * Per-edit quality hook is opt-in: it runs aislop on every edit, which is a
 * real cost on a small machine. `--hooks` asks for it explicitly instead of
 * silently wiring a hook into the user's agent.
 */
function installAislopHooks(ctx, harnesses) {
  const bin = resolveAislop(ctx.cwd);
  if (!bin) {
    log.warn('aislop 未安装，跳过 --hooks（先 npm i -g aislop）');
    return;
  }
  const supported = harnesses.map((h) => h.id).filter((id) => ['claude', 'codex', 'cursor', 'gemini'].includes(id));
  if (supported.length === 0) {
    log.warn('--hooks：所选 harness 不支持 per-edit 钩子');
    return;
  }
  log.title('per-edit quality 钩子');
  for (const id of supported) {
    const result = run(bin, ['hook', 'install', `--${id}`], { timeout: 120_000 });
    if (result.ok) log.ok(`${id} 钩子已安装`);
    else log.warn(`${id} 钩子安装失败：${(result.stderr || result.stdout).split('\n')[0]}`);
  }
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
  // 只把真正装了的算“硬拦截”；声明了 gate 但本机未装的 harness 单独列出，
  // 否则未安装的 dsh 也会被误报成受硬门控保护。
  const gated = harnesses.filter((h) => h.gateDest && detected(h) && gateStatus(h).installed).map((h) => h.id);
  const gatedNotInstalled = harnesses.filter((h) => h.gateDest && (!detected(h) || !gateStatus(h).installed)).map((h) => h.id);
  const soft = harnesses.filter((h) => !h.gateDest && detected(h)).map((h) => h.id);
  if (gated.length) log.info(`  ${c.yellow('硬拦截')}：${gated.join(', ')}`);
  if (gatedNotInstalled.length) log.info(`  ${c.dim(`支持硬门控但未安装：${gatedNotInstalled.join(', ')}`)}`);
  if (soft.length) log.info(`  ${c.dim(`软约束：${soft.join(', ')}（skills + 注入，无进程级拦截）`)}`);
  // zcode is deliberately not built in: a GUI IDE with its own agent kernel, and
  // no ~/.zcode on this machine. Say so rather than silently omitting it.
  log.info(
    `  ${c.dim('未纳入：zcode（智谱 GUI IDE，自有内核；未探测到 ~/.zcode；出现 ~/.zcode/skills 时用 custom 接入）')}`,
  );

  // Flat `<name>.md` next to `<name>/SKILL.md` declares the same skill twice.
  // Several harnesses can share one physical skills dir (pi and dsh both read
  // ~/.agents/skills), so dedupe by real path — otherwise the same 19 files get
  // reported three times and the operator stops reading the warning.
  const flatDupes = new Map();
  for (const harness of harnesses) {
    if (!harness.skillsPath || !fs.existsSync(harness.skillsPath)) continue;
    const real = fs.realpathSync(harness.skillsPath);
    const dup = detectFlatSkillDuplicates(real);
    if (!dup.length) continue;
    const entry = flatDupes.get(real) ?? { dir: real, harnesses: [], names: dup };
    entry.harnesses.push(harness.id);
    flatDupes.set(real, entry);
  }
  if (flatDupes.size) {
    log.title('扁平 skill 重复（只报告，不自动删）');
    for (const item of flatDupes.values()) {
      log.warn(`  FLAT_SKILL_DUPLICATE：${item.dir} 有 ${item.names.length} 个扁平 .md 与同名目录并存（被 ${item.harnesses.join(', ')} 共用）`);
      log.info(`    同名：${item.names.slice(0, 8).join(', ')}${item.names.length > 8 ? ' …' : ''}`);
      const backup = path.join(item.dir, '_flat-backup');
      if (process.platform === 'win32') {
        log.info(`    ${c.dim(`清理（先备份再移出）：New-Item -ItemType Directory -Force "${backup}" | Out-Null`)}`);
        log.info(`    ${c.dim(`  Get-ChildItem "${item.dir}" -Filter *.md | Where-Object { $_.BaseName -in @(${item.names.map((n) => `'${n}'`).join(',')}) } | Move-Item -Destination "${backup}"`)}`);
      } else {
        log.info(`    ${c.dim(`清理（先备份再移出）：mkdir -p "${backup}"`)}`);
        log.info(`    ${c.dim(`  mv "${item.dir}"/{${item.names.join(',')}}.md "${backup}"/`)}`);
      }
    }
  }

  const legacy = reportLegacyGates();
  if (legacy.length > 0) {
    log.title('遗留门控（只报告，不自动删）');
    for (const item of legacy) {
      const line = `  ${item.code}：${item.message}`;
      if (item.level === 'info') log.info(line);
      else log.warn(line);
      if (item.command) log.info(`    ${c.dim(`停用命令：${item.command}`)}`);
    }
  }

  const managed = harnesses.filter((h) => Object.keys(harnessRecord(manifest, h.id)?.skills ?? {}).length);
  const ship = runShipGate({ harnesses: managed, manifest, skillsSource: skillsSource() });
  log.title('产物一致性');
  log.plain(`${ship.ok ? c.green('✔') : c.red('✖')} ${ship.summary}`);
  for (const finding of ship.findings.slice(0, 10)) log.info(`  ${c.dim(`${finding.harness ?? ''} ${finding.message}`)}`);

  return 0;
}

export async function install(ctx) {
  const dryRun = Boolean(ctx.flags['dry-run']);
  // goal-mode and auto-continue both drive the turn boundary; enabling both
  // would make the agent fight itself over when to continue.
  if (ctx.flags['with-goal-mode'] && ctx.flags['with-auto-continue']) {
    log.err('--with-goal-mode 与 --with-auto-continue 互斥：二选一');
    return 2;
  }
  const allDetected = allHarnesses(ctx.cfg).map(resolveHarness).filter(detected);
  let selected = [];
  let missing = [];

  if (ctx.flags.ask && !ctx.flags.harness && !ctx.flags.yes) {
    if (allDetected.length === 0) {
      log.err('没有探测到任何 harness（检查 ~/.claude / ~/.pi / ~/.codex 等目录）');
      return 3;
    }
    printPlan(allDetected, ctx.cfg);
    const answer = await askSelection(allDetected);
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
    if (ctx.flags.yes) log.info(c.dim(`--yes：不需要交互，按选定的 harness 执行（${selected.map((h) => h.id).join(', ')}）`));
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
    log.info(c.dim('提示：quality 的 per-edit 钩子需显式启用 → shipgate install --hooks 或 aislop hook install --claude'));
  }

  if (ctx.flags.hooks && !dryRun) installAislopHooks(ctx, selected);

  if (ctx.flags['with-goal-mode']) installPiExtension(ctx, 'goal-mode', { dryRun });
  if (ctx.flags['with-auto-continue']) installPiExtension(ctx, 'auto-continue', { dryRun });

  const legacyFindings = reportLegacyGates();
  if (legacyFindings.length > 0) {
    log.title('遗留门控提醒（不自动删）');
    for (const item of legacyFindings) {
      log.warn(`  ${item.code}：${item.message}`);
      if (item.command) log.info(`    ${c.dim(`停用命令：${item.command}`)}`);
    }
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
    // revoke 要回到 ShipGate 动手之前那个版本：只有最早的备份是干净的，
    // 用最新备份会把上一版注入区块装回去，等于没撤。
    const backup = harness.injectPath ? earliestBackup(harness.injectPath) : null;
    if (backup) {
      writeText(harness.injectPath, readIfExists(backup) ?? '');
      log.ok(`${id} 注入文件已恢复为最初版本：${path.basename(backup)}`);
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
