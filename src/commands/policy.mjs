import { c, log, table } from '../lib/log.mjs';
import { addProtected, gateStatus, loadPolicy, removeProtected, setMode, syncPolicyToHarnesses } from '../lib/gate.mjs';
import { allHarnesses, detected, resolveHarness } from '../harness/index.mjs';

function gatedHarnesses(cfg) {
  return allHarnesses(cfg)
    .map(resolveHarness)
    .filter((h) => h.gateDest);
}

export function policyCommand(ctx) {
  const { flags } = ctx;

  if (flags['add-protected']) {
    const policy = addProtected(String(flags['add-protected']));
    log.ok(`已加入受保护工作区：${String(flags['add-protected'])}`);
    log.info(c.dim(`当前共 ${policy.config.protected_worktrees.length} 条`));
    return syncAll(ctx);
  }

  if (flags['rm-protected']) {
    const policy = removeProtected(String(flags['rm-protected']));
    log.ok(`已移除：${String(flags['rm-protected'])}`);
    log.info(c.dim(`剩余 ${policy.config.protected_worktrees.length} 条`));
    return syncAll(ctx);
  }

  if (flags.mode) {
    const policy = setMode(String(flags.mode));
    log.ok(`destructive_mode = ${policy.config.destructive_mode}`);
    return syncAll(ctx);
  }

  if (flags.sync) return syncAll(ctx);

  const policy = loadPolicy();
  const rows = gatedHarnesses(ctx.cfg).map((harness) => {
    const status = gateStatus(harness);
    return [harness.id, status.installed ? 'installed' : 'missing', status.mode ?? '-', String(status.protected ?? 0), harness.gateDest];
  });

  if (ctx.flags.json) {
    log.plain(JSON.stringify({ policy, harnesses: rows }, null, 2));
    return 0;
  }

  log.title(`策略真源：${policy.config.destructive_mode}  ·  受保护工作区 ${policy.config.protected_worktrees.length} 条`);
  for (const p of policy.config.protected_worktrees) log.info(`  · ${p}`);
  log.title('硬门控落地');
  if (rows.length === 0) log.warn('没有任何 harness 配置了 gate（只有 pi/dsh 类需要）');
  else log.plain(table(rows, ['harness', 'gate', 'mode', 'protected', '路径']));
  log.info(c.dim('用法：shipgate policy --add-protected <dir> | --rm-protected <dir> | --mode enforce|bypass | --sync'));
  return 0;
}

function syncAll(ctx) {
  const harnesses = gatedHarnesses(ctx.cfg).filter(detected);
  const touched = syncPolicyToHarnesses(harnesses, { dryRun: Boolean(ctx.flags['dry-run']) });
  if (touched.length === 0) {
    log.warn('没有已安装 gate 的 harness 需要同步（先 `shipgate install --harness pi`）');
    return 0;
  }
  for (const item of touched) {
    log.ok(`${item.harness} ← ${item.mode} / protected ${item.protected}  ${c.dim(item.target)}`);
  }
  return 0;
}
