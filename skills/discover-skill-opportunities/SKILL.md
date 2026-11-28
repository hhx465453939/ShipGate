---
name: discover-skill-opportunities
description: Analyze conversation exports, task logs, project artifacts, SOPs, tickets, reports, and work history to discover hidden work patterns and rank repeatable workflows worth packaging as AI skills. Also reviews how the Skills loaded in the current session performed — where they helped, where they created friction, and whether an existing Skill should be upgraded — using only visible evidence. Use when users ask what they repeatedly do, what they may be overlooking, or which workflows should become skills; for an evidence-based skill opportunity audit; or to review the current session Skill performance, which triggers when the user asks, when two or more Skills were used, when a correction, permission or path error occurred, or after a large SPEC, package, or release loop. Do not claim access to unavailable history, hidden Skill activation, or session memory; do not infer sensitive personal traits; do not create or modify skills without separate authorization.
---

# Discover Skill Opportunities

## Overview

Turn accessible work evidence into a prioritized portfolio of reusable skill opportunities. Separate observed facts from inference, expose high-leverage patterns the user may not have named, and hand implementation-ready specifications to a skill-building workflow.

## Non-negotiable boundaries

- Analyze only sources available in the current context or explicitly accessible through approved tools.
- State the analyzed scope, time range, missing sources, and sampling limits. Never say that all history or memory was scanned unless it actually was.
- Minimize exposure of secrets, personal data, client data, credentials, and regulated information. Redact examples when exact content is unnecessary.
- Describe work patterns, process constraints, and decision habits. Do not diagnose personality, health, intent, or other sensitive traits.
- Treat frequency as one signal, not proof of value. A rare, costly, stable workflow may outrank a frequent trivial task.
- Preserve evidence links or artifact references for every major finding. Mark unsupported ideas as hypotheses.
- Recommend creation; do not write, install, commit, publish, or deploy another skill without explicit authorization.
- For legal, medical, financial, accounting, or trading workflows, recommend human review and deterministic checks where consequences are material.

## Workflow

### Phase 1: Establish the evidence envelope

1. Restate the audit objective and desired number of candidates; default to three final candidates.
2. Inventory available sources by type, date range, owner, and completeness.
3. Record inaccessible sources and avoid asking for data that is unnecessary for the audit.
4. Choose the smallest representative sample when the corpus is very large; disclose the sampling method.
5. Read `references/evidence-and-privacy.md` before handling conversation exports, customer data, financial records, health information, or other sensitive material.

### Phase 2: Extract work episodes

1. Convert evidence into atomic work episodes with: trigger, goal, inputs, actions, decisions, outputs, validation, tools, friction, and outcome.
2. Normalize different wording that represents the same underlying job.
3. Distinguish user work from assistant boilerplate and incidental conversation.
4. Label each episode as `observed`, `inferred`, or `unknown` and attach an evidence pointer.

Use this minimal episode schema:

```yaml
episode_id: E-001
goal: ""
trigger: ""
inputs: []
actions: []
decisions: []
output: ""
validation: ""
friction: ""
evidence: []
confidence: high|medium|low
```

### Phase 3: Cluster recurring jobs

1. Cluster by shared job, decision logic, inputs, outputs, and validation—not keywords alone.
2. Split a cluster when its risk level, output contract, or required tools differ materially.
3. Identify hidden leverage patterns such as repeated context reconstruction, recurring exception handling, manual reconciliation, cross-system translation, review bottlenecks, and undocumented quality gates.
4. Load only the relevant domain references listed below. Combine references when a workflow crosses domains.

### Phase 4: Score skill potential

1. Score every cluster from 0 to 5 on the eight dimensions in `references/scoring-rubric.md`.
2. Calculate the weighted score and apply red-flag caps.
3. Compare against simpler alternatives: checklist, template, saved prompt, script, automation, policy document, or no action.
4. Assign one disposition:
   - `BUILD_SKILL`: stable workflow, reusable context, and verifiable output.
   - `PILOT_AS_SOP`: promising but needs more examples or stabilized decisions.
   - `AUTOMATE_DIFFERENTLY`: deterministic integration or script is the better unit.
   - `KEEP_AD_HOC`: variation or low value does not justify packaging.

### Phase 5: Surface consequential findings

1. Select at most three findings the user likely has not explicitly named.
2. For each finding, show the evidence pattern, why it matters, the decisions it could change, confidence, and a reversible next action.
3. Include at least one plausible alternative explanation or disconfirming signal.
4. Avoid novelty theater: omit observations that do not change a decision, workflow, allocation, or control.

### Phase 6: Specify the top candidates

1. Rank candidates by weighted score, evidence strength, strategic leverage, and portfolio diversity.
2. Produce an implementation-ready specification using `references/output-contract.md`.
3. Define positive and negative trigger examples, inputs, workflow, output contract, resources, tools, risk controls, validation, and success metrics.
4. Identify whether each reusable element belongs in `SKILL.md`, `references/`, `scripts/`, or `assets/`.
5. Note overlap with existing skills and recommend extending an existing skill when duplication would be wasteful.

### Phase 7: Hand off deliberately

1. Ask for confirmation before implementation.
2. When approved, hand the selected specification to the platform's skill-creation or skill-governance workflow.
3. Preserve rejected candidates and reasons so a later audit can detect changed evidence.

### Phase (optional): Active Skill Performance Review

Review how Skills actually loaded or invoked in the current session performed. This is a distinct lens from work-pattern mining: it asks whether the Skills used this session helped, where they created friction, and whether an existing Skill should be upgraded. Read `references/session-skill-review.md` before running it.

1. Confirm a trigger condition is met (user request; two or more Skills used; a correction/path/permission error or rework; a large SPEC/package/release loop finished; Skill output diverged from delivery). If none is met, skip and say so.
2. State the visible-Skill scope and its limits. Use only visible evidence — do not claim to scan all loaded Skills or hidden invocation traces.
3. For each reviewed Skill, record execution episodes with the attribution schema, separating `skill_logic` defects from `execution`, `platform`, `permission`, `input`, and `repository_debt` causes.
4. Output both strengths/rules-to-preserve and friction/failures, never weaknesses alone.
5. Assign an upgrade disposition, preferring `UPDATE_EXISTING_SKILL` over creating a new Skill when evidence supports it.
6. Add the findings to the `Current-session Skill performance` section of the output contract. Recommend changes only; do not modify Skills without separate authorization.

## Domain routing

| Domain signal | Read when needed |
|---|---|
| Software engineering, DevOps, QA, architecture | `references/software-development.md` |
| Strategy, organization, operations, client advisory | `references/business-consulting.md` |
| Literature, experiments, data analysis, papers, grants | `references/scientific-research.md` |
| Signals, backtests, portfolios, execution, risk | `references/quant-trading.md` |
| Investment research, valuation, markets, credit, treasury | `references/finance-investment.md` |
| Bookkeeping, close, reporting, tax support, controls | `references/accounting-finance-ops.md` |
| Product discovery, roadmap, growth, content, support | `references/product-and-operations.md` |
| Contracts, policy, privacy, regulatory controls | `references/legal-and-compliance.md` |

## Output Contract

Complete an audit only when the response contains:

1. `Audit scope and limitations` — sources examined, time range, exclusions, and confidence limits.
2. `Consequential findings` — evidence-backed hidden patterns with impact, alternative explanation, and next action.
3. `Recurring work clusters` — normalized clusters with frequency or recurrence evidence, friction, and disposition.
4. `Ranked opportunities` — score breakdown, rationale, simpler-alternative check, and top candidates.
5. `Skill specifications` — implementation-ready specifications for the requested number of candidates.
6. `Not recommended yet` — rejected or deferred candidates and the evidence needed to reconsider them.
7. `Next decision` — ask whether to prototype, observe longer, or stop; do not imply approval.

When the Active Skill Performance Review phase runs, also include:

8. `Current-session Skill performance` — per reviewed Skill: visible-scope statement, attribution table, strengths and rules to preserve, friction/failures, upgrade disposition, minimal proposed change, and a regression scenario. Omit this section when the session review is not triggered.

Use calibrated language: `observed`, `strongly supported`, `plausible`, or `speculative`. Never present an inference as a fact.

## Resources

| File | Purpose | When to load |
|---|---|---|
| `references/evidence-and-privacy.md` | Evidence access, provenance, sampling, privacy, and redaction | Phase 1; always for sensitive corpora |
| `references/scoring-rubric.md` | Weighted scoring, red flags, and build thresholds | Phase 4; always |
| `references/output-contract.md` | Audit and candidate specification templates | Phases 5-7; always |
| `references/session-skill-review.md` | Visible-evidence envelope, attribution schema, strengths, and upgrade dispositions | Active Skill Performance Review; only when triggered |
| Domain references listed above | Domain-specific work clusters, boundaries, and validation ideas | Phase 3; only for relevant domains |
