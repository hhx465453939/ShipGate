import { VERSION } from './version.mjs';
import { c, log } from './lib/log.mjs';
import { loadConfig } from './lib/cfg.mjs';
import { doctor, install, inject, status, adopt, revoke, rollback, update, printUpdateHint } from './commands/deploy.mjs';
import { listGates, specGate, qualityGate, securityGate } from './commands/gates.mjs';
import { policyCommand } from './commands/policy.mjs';

const COMMANDS = {
  doctor,
  install,
  inject,
  status,
  adopt,
  revoke,
  rollback,
  update,
  policy: policyCommand,
  gates: listGates,
  spec: specGate,
  quality: qualityGate,
  security: securityGate,
};

const SUBCOMMAND_NOISE = new Set(['check', 'run']);

export function parseArgs(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.includes('=')) {
      const [k, v] = key.split('=');
      flags[k] = v;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, args };
}

function help() {
  log.plain(`${c.bold('shipgate')} ${VERSION} — 全周期代码开发的技能与闸门分发器

${c.bold('部署（最常用）')}
  shipgate install --ask              交互式：列出探测到的 agent，逐个确认
  shipgate install --yes              非交互：全部已探测 harness
  shipgate install --harness claude,pi
  shipgate install --dry-run          只看将写什么
  shipgate doctor                     体检：skills / commands / agents / 门控 / 引擎
  shipgate status [--json]            每个 harness 装了什么

${c.bold('四道闸')}
  shipgate spec check [dir]           契约闸（tasks/CHG-*/ 三件套）
  shipgate quality [dir] [--min 80]   质量闸（aislop）
  shipgate security --scope <file>    安全闸（cbh，必须显式给范围）
  shipgate gates                      闸清单 + 引擎状态

${c.bold('硬门控（pi / dsh 类）')}
  shipgate policy                     策略真源 + 各 harness 落地状态
  shipgate policy --add-protected <dir>
  shipgate policy --rm-protected <dir>
  shipgate policy --mode enforce|bypass
  shipgate policy --sync

${c.bold('受管与升级')}
  shipgate adopt <id>                 纳入受管      shipgate revoke <id>   撤回并恢复备份
  shipgate rollback <id>              最近备份回滚  shipgate update [--check]

${c.bold('harness')}  claude · pi · codex · gemini · cursor · 自定义（~/.config/shipgate/config.json）
${c.bold('文档')}     https://github.com/hhx465453939/ShipGate`);
  return 0;
}

export async function main(argv) {
  const { flags, args } = parseArgs(argv);
  const name = args.shift();

  if (!name || flags.help || name === 'help') return help();
  if (name === '--version' || name === '-v') {
    log.plain(VERSION);
    return 0;
  }

  const command = COMMANDS[name];
  if (!command) {
    log.err(`未知命令：${name}`);
    help();
    return 2;
  }

  if ((name === 'spec' || name === 'quality' || name === 'security') && SUBCOMMAND_NOISE.has(args[0])) {
    args.shift();
  }

  const ctx = {
    cwd: process.cwd(),
    cfg: loadConfig(process.cwd()),
    flags,
    args,
  };

  if (!flags.json && name !== 'update') await printUpdateHint();

  const code = await command(ctx);
  return typeof code === 'number' ? code : 0;
}
