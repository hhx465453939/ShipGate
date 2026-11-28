import { createInterface } from 'node:readline/promises';
import { c, log } from '../lib/log.mjs';

/**
 * Interactive harness selection.
 *
 * Non-TTY callers (CI, an agent running a shell command) must never hang, so
 * `--ask` degrades to "install every detected harness" with an explicit note.
 */
export function canPrompt() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function describe(harness, index) {
  const parts = [];
  if (harness.skillsPath) parts.push('skills ✓');
  else parts.push('skills -');
  if (harness.commandsPath) parts.push('commands ✓');
  if (harness.agentsPath) parts.push('agents ✓');
  if (harness.gateDest) parts.push('硬门控 ✓');
  const inject = harness.injectPath ? harness.injectPath.replace(process.env.HOME ?? '', '~') : '无注入';
  return `  ${index}) ${harness.label.padEnd(14)} ${inject.padEnd(38)} ${parts.join('  ')}`;
}

export async function askSelection(harnesses) {
  if (!canPrompt()) {
    return {
      selected: harnesses,
      note: '非交互环境（非 TTY）：按默认为全部已探测 harness 安装；如需挑选请加 --harness a,b',
    };
  }

  log.title(`ShipGate 探测到 ${harnesses.length} 个 agent`);
  harnesses.forEach((h, i) => log.info(describe(h, i + 1)));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('\n要装哪些？(a=全部 / 1,2,3 / 回车=全部 / q=退出) > ')).trim();
    if (answer === 'q' || answer === 'quit') return { selected: [], note: '用户取消' };

    let picked;
    if (answer === '' || answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
      picked = harnesses;
    } else {
      const indexes = answer
        .split(/[,\s]+/)
        .map((token) => Number.parseInt(token, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= harnesses.length);
      picked = indexes.map((n) => harnesses[n - 1]);
      if (picked.length === 0) return { selected: [], note: `无效选择：${answer}` };
    }

    const names = picked.map((h) => h.label).join('、');
    const confirm = (await rl.question(`确认写入 ${names} 的全局目录？(Y/n) > `)).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'no') return { selected: [], note: '用户取消' };

    return { selected: picked, note: `已选择 ${names}` };
  } finally {
    rl.close();
  }
}

export function printPlan(harnesses, cfg) {
  log.title('将写入以下位置');
  for (const harness of harnesses) {
    const lines = [];
    if (harness.skillsPath) {
      const link = harness.skillsFollowed ? `（跟随链接 ${harness.skillsDeclaredPath}）` : '';
      lines.push(`skills   → ${harness.skillsPath}${link}`);
    }
    if (harness.commandsPath) lines.push(`commands → ${harness.commandsPath}`);
    if (harness.agentsPath) lines.push(`agents   → ${harness.agentsPath}`);
    if (harness.injectPath) lines.push(`注入     → ${harness.injectPath}`);
    if (harness.gateDest) lines.push(`硬门控   → ${harness.gateDest}`);
    log.info(`\n${c.bold(harness.label)} (${harness.id})`);
    for (const line of lines) log.info(`  ${line}`);
  }
  const gated = harnesses.filter((h) => h.gateDest).map((h) => h.id);
  const soft = harnesses.filter((h) => !h.gateDest).map((h) => h.id);
  if (gated.length) log.info(`\n${c.yellow('硬拦截')}：${gated.join(', ')}（进程级拦截）`);
  if (soft.length) log.info(`${c.dim('软约束')}：${soft.join(', ')}（靠 skills + 注入文档，无进程级拦截）`);
}
