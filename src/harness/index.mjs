import { expand } from '../lib/cfg.mjs';
import { exists } from '../lib/fsx.mjs';

/**
 * Built-in harness profiles: what each agent can actually consume.
 *
 * `gate` is only set for free-form harnesses (pi / dsh-like): they get a
 * process-level gate bundle. Claude Code / Codex / Gemini have no such hook
 * surface, so they are steered by skills + injected docs only — the docs say so
 * explicitly rather than pretending they are hard-gated.
 */
export const BUILTIN = [
  {
    id: 'claude',
    label: 'Claude Code',
    detect: '~/.claude',
    skills: '~/.claude/skills',
    commands: '~/.claude/commands',
    agents: '~/.claude/agents',
    inject: '~/.claude/CLAUDE.md',
    gate: null,
  },
  {
    id: 'pi',
    label: 'pi agent',
    detect: '~/.pi',
    skills: '~/.agents/skills',
    commands: null,
    agents: null,
    inject: '~/.pi/agent/APPEND_SYSTEM.md',
    gate: { dest: '~/.pi/agent/extensions/enforce-rules', kind: 'pi' },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    detect: '~/.codex',
    skills: '~/.codex/skills',
    commands: null,
    agents: null,
    inject: '~/.codex/AGENTS.md',
    gate: null,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    detect: '~/.gemini',
    skills: '~/.gemini/skills',
    commands: null,
    agents: null,
    inject: '~/.gemini/GEMINI.md',
    gate: null,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    detect: '~/.cursor',
    skills: null,
    commands: null,
    agents: null,
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
    commands: value.commands ?? null,
    agents: value.agents ?? null,
    inject: value.inject ?? null,
    gate: value.gate ? { dest: value.gate.dest, kind: value.gate.kind ?? 'pi' } : null,
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
    commandsPath: harness.commands ? expand(harness.commands) : null,
    agentsPath: harness.agents ? expand(harness.agents) : null,
    injectPath: harness.inject ? expand(harness.inject) : null,
    gateDest: harness.gate ? expand(harness.gate.dest) : null,
  };
}

export function detected(harness) {
  // A harness without a detect path is user-declared (custom profile): it is
  // installable by intent, not skipped as "not on this machine".
  return harness.detectPath ? exists(harness.detectPath) : true;
}

/** Capability summary, used by --ask and doctor. */
export function capabilities(harness) {
  return {
    skills: Boolean(harness.skillsPath),
    commands: Boolean(harness.commandsPath),
    agents: Boolean(harness.agentsPath),
    inject: Boolean(harness.injectPath),
    gate: Boolean(harness.gateDest),
  };
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

  const selected = wanted.map((id) => all.find((h) => h.id === id) ?? resolveHarness(getHarness(id, cfg)));
  const missing = selected.filter((h) => !detected(h));
  if (missing.length > 0 && !includeUndetected) {
    return { selected: selected.filter(detected), missing };
  }
  return { selected, missing };
}
