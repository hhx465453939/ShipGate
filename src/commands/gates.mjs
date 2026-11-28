import { c, log, table } from '../lib/log.mjs';
import { runSpecGate } from '../gates/spec.mjs';
import { runQualityGate } from '../gates/quality.mjs';
import { runSecurityGate } from '../gates/security.mjs';
import { checkEngines, missingEngineHints } from '../lib/engines.mjs';

const GATE_ROWS = [
  ['spec', '任何代码改动之前', 'shipgate spec check', '内置（CHG 三件套）'],
  ['quality', '每次编辑后 / 提交前', 'shipgate quality', 'aislop（外部依赖）'],
  ['security', '提交前 / 发布前（显式）', 'shipgate security --scope <file>', 'cbh（外部依赖）'],
  ['ship', '装 / 升级 / 换 harness 后', 'shipgate status', '内置（manifest 校验）'],
];

export function listGates(ctx) {
  const engines = checkEngines(ctx);
  // Only the engines that are really absent get a hint. The old code printed
  // "缺失引擎：…" unconditionally, so `shipgate gates` said `ok ok` and then
  // told the operator to install both.
  const missing = missingEngineHints(engines);
  const withOk = Object.fromEntries(
    Object.entries(engines).map(([name, info]) => [name, { ...info, ok: Boolean(info.bin) }]),
  );

  if (ctx.flags.json) {
    log.plain(
      JSON.stringify(
        { gates: GATE_ROWS.map(([gate, when, command, engine]) => ({ gate, when, command, engine })), engines: withOk },
        null,
        2,
      ),
    );
    return 0;
  }

  log.title('ShipGate 四道闸');
  log.plain(table(GATE_ROWS, ['gate', '什么时候过', '命令', '引擎']));
  log.title('引擎');
  log.plain(
    Object.entries(engines)
      .map(([name, info]) => `${name} ${info.bin ? c.green('ok') : c.red('missing')}`)
      .join('   '),
  );
  if (missing.length > 0) {
    log.info('缺失引擎：');
    for (const item of missing) log.info(`  ${item.name} → ${item.install}`);
  }
  return 0;
}

function emitVerdict(ctx, verdict) {
  if (ctx.flags.json) {
    log.plain(JSON.stringify(verdict, null, 2));
  } else {
    const mark = verdict.ok ? c.green('✔') : c.red('✖');
    log.plain(`${mark} [${verdict.gate}] ${verdict.summary}`);
    for (const finding of verdict.findings?.slice(0, 20) ?? []) {
      const where = finding.file ?? finding.harness ?? '';
      log.info(`  ${c.dim(where)} ${finding.message}`);
    }
    if (!verdict.ok && verdict.evidence?.install) log.info(`  → ${verdict.evidence.install}`);
    if (!verdict.ok && verdict.evidence?.example) log.info(`  → 例：${verdict.evidence.example}`);
  }
  return verdict.code;
}

export function specGate(ctx) {
  const dir = ctx.args[0] ?? ctx.cfg.spec.dir;
  return emitVerdict(ctx, runSpecGate({ cwd: ctx.cwd, dir }));
}

export function qualityGate(ctx) {
  const target = ctx.args[0] ?? '.';
  const min = Number.parseInt(ctx.flags.min ?? ctx.cfg.quality.min, 10);
  return emitVerdict(ctx, runQualityGate({ cwd: ctx.cwd, target, min }));
}

export function securityGate(ctx) {
  const scope = ctx.flags.scope ?? ctx.cfg.security?.scope ?? null;
  return emitVerdict(ctx, runSecurityGate({ cwd: ctx.cwd, scope, dryRun: Boolean(ctx.flags['dry-run']) }));
}
