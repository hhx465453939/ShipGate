import { expand } from '../lib/cfg.mjs';
import { exists } from '../lib/fsx.mjs';

/**
 * Built-in harness profiles. `skills` is null when the harness has no skills
 * directory (cursor rules only). `gate` points at a vendored gate bundle that
 * only the free-form harnesses need (pi/dsh); Claude Code and Codex are steered
 * by skills + injected docs instead.
 */
export const BUILTIN = [
  {
    id: 'claude',
    label: 'Claude Code',
    detect: '~/.claude',
    skills: '~/.claude/skills',
    inject: '~/.claude/CLAUDE.md',
    gate: null,
  },
  {
    id: 'pi',
    label: 'pi agent',
    detect: '~/.pi',
    skills: '~/.agents/skills',
    inject: '~/.pi/agent/APPEND_SYSTEM.md',
    gate: { dest: '~/.pi/agent/extensions/enforce-rules', assets: 'pi-gate' },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    detect: '~/.codex',
    skills: '~/.codex/skills',
    inject: '~/.codex/AGENTS.md',
    gate: null,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    detect: '~/.gemini',
    skills: '~/.gemini/skills',
    inject: '~/.gemini/GEMINI.md',
    gate: null,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    detect: '~/.cursor',
    skills: null,
    inject: '~/.cursor/rules/shipgate.mdc',
    gate: null,
  },
];

export function allHarnesses(cfg) {
  const custom = Object.entries(cfg.custom ?? {}).map(([id, value]) => ({
    id,
    label: value.label ?? id,
    detect: value.detect ?? null,
    skills: value.skills ?? null,
    inject: value.inject ?? null,
    gate: value.gate ?? null,
    custom: true,
  }));
  return [...BUILTIN, ...custom];
}

export function getHarness(id, cfg) {
  const found = allHarnesses(cfg).find((h) => h.id === id);
  if (!found) {
    throw new Error(`未知 harness: ${id}（可用：${allHarnesses(cfg).map((h) => h.id).join(', ')}）`);
  }
  return found;
}

export function resolveHarness(harness) {
  return {
    ...harness,
    detectPath: harness.detect ? expand(harness.detect) : null,
    skillsPath: harness.skills ? expand(harness.skills) : null,
    injectPath: harness.inject ? expand(harness.inject) : null,
    gateDest: harness.gate ? expand(harness.gate.dest) : null,
  };
}

export function detected(harness) {
  // A harness without a detect path is user-declared (custom profile): it is
  // installable by intent, not skipped as "not on this machine".
  return harness.detectPath ? exists(harness.detectPath) : true;
}

/** Target harnesses for a run: explicit --harness wins, otherwise config list. */
export function selectHarnesses({ requested, cfg, includeUndetected = false }) {
  const all = allHarnesses(cfg).map(resolveHarness);
  const wanted =
    requested && requested !== 'all'
      ? requested.split(',').map((s) => s.trim()).filter(Boolean)
      : requested === 'all'
        ? all.map((h) => h.id)
        : cfg.harnesses;

  const selected = wanted.map((id) => all.find((h) => h.id === id) ?? getHarness(id, cfg));
  const missing = selected.filter((h) => !detected(h));
  if (missing.length > 0 && !includeUndetected) {
    return { selected: selected.filter(detected), missing };
  }
  return { selected, missing };
}
