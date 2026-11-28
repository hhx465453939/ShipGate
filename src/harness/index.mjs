import { expand } from '../lib/cfg.mjs';
import { exists, isSymlink, realpathOrNull } from '../lib/fsx.mjs';

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
    // pi stores prompt/command templates here; the file shape (frontmatter
    // `description` + `# /name`) is identical to ShipGate's commands, so the 22
    // slash commands are reusable as-is.
    commands: '~/.pi/agent/prompts',
    agents: null,
    inject: '~/.pi/agent/APPEND_SYSTEM.md',
    gate: { dest: '~/.pi/agent/extensions/enforce-rules', kind: 'pi' },
  },
  {
    id: 'dsh',
    label: 'dsh',
    detect: '~/.dsh',
    // dsh's native user skill root is ~/.agents/skills (same one pi reads), not
    // ~/.dsh/skills. Verified against dsh 0.2.2-rc.3 in
    // agent-config-bridge/bridge/targets/dsh.json: "~/.agents/skills is a native
    // user skill root ... the same link pi uses is enough". Writing to
    // ~/.dsh/skills left the skills unread for a dsh-only user.
    skills: '~/.agents/skills',
    commands: null,
    agents: null,
    inject: '~/.dsh/AGENTS.md',
    gate: { dest: '~/.dsh/extensions/enforce-rules', kind: 'dsh' },
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
  {
    id: 'kimi',
    label: 'Kimi Code',
    detect: '~/.kimi-code',
    skills: '~/.kimi-code/skills',
    // Kimi's own Claude-importer docs state that Claude custom commands are
    // out of scope: there is no destination, so commands stay null instead of
    // inventing one.
    commands: null,
    agents: null,
    inject: '~/.kimi-code/AGENTS.md',
    gate: null,
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    detect: '~/.antigravity',
    // Agent Skills open standard: the global user-scope root is under .gemini,
    // NOT ~/.antigravity (which only holds the IDE's own settings.json).
    skills: '~/.gemini/antigravity/skills',
    commands: null,
    agents: null,
    // Global rules-doc path for Antigravity is unverified; distributing skills
    // only is honest, inventing an inject target would not be.
    inject: null,
    gate: null,
  },
];

/**
 * Resolve a declared skills path through a symlink/junction. `~/.agents/skills`
 * is a link to ~/.claude/skills on this machine, created and owned by
 * agent-config-bridge. ShipGate copies skills; writing through the link keeps
 * exactly one copy shared by claude / pi / dsh. A broken link is reported as
 * broken instead of being silently replaced (creating the link is bridge's job).
 */
function resolveSkillsPath(declaredPath) {
  if (!declaredPath) return { path: null, declared: null, followed: false, broken: false };
  const declared = expand(declaredPath);
  if (!isSymlink(declared)) return { path: declared, declared, followed: false, broken: false };
  const real = realpathOrNull(declared);
  if (!real) return { path: declared, declared, followed: true, broken: true };
  return { path: real, declared, followed: true, broken: false };
}

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
  const skills = resolveSkillsPath(harness.skills);
  return {
    ...harness,
    detectPath: harness.detect ? expand(harness.detect) : null,
    skillsPath: skills.path,
    skillsDeclaredPath: skills.declared,
    skillsFollowed: skills.followed,
    skillsBroken: skills.broken,
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
  const configured = cfg.harnesses === 'auto' || cfg.harnesses == null ? null : cfg.harnesses;

  const wanted =
    requested && requested !== 'all'
      ? requested.split(',').map((s) => s.trim()).filter(Boolean)
      : requested === 'all' || configured === null
        ? all.filter(detected).map((h) => h.id)
        : configured;

  const selected = wanted.map((id) => all.find((h) => h.id === id) ?? resolveHarness(getHarness(id, cfg)));
  const missing = selected.filter((h) => !detected(h));
  if (missing.length > 0 && !includeUndetected) {
    return { selected: selected.filter(detected), missing };
  }
  return { selected, missing };
}
