const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code, text) => (colorEnabled ? `\u001b[${code}m${text}\u001b[0m` : String(text));

export const c = {
  bold: (s) => paint('1', s),
  dim: (s) => paint('2', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  red: (s) => paint('31', s),
  cyan: (s) => paint('36', s),
};

export const log = {
  plain: (...args) => console.log(...args),
  info: (msg) => console.log(msg),
  ok: (msg) => console.log(`${c.green('✔')} ${msg}`),
  warn: (msg) => console.log(`${c.yellow('▲')} ${msg}`),
  err: (msg) => console.error(`${c.red('✖')} ${msg}`),
  step: (msg) => console.log(`${c.cyan('▸')} ${msg}`),
  title: (msg) => console.log(`\n${c.bold(msg)}`),
};

export function table(rows, headers) {
  if (rows.length === 0) return '';
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => String(r[i] ?? '').length)));
  return all
    .map((row) => row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  ').trimEnd())
    .join('\n');
}
