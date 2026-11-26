---
name: ai-spec
description: Lead full-development routing and convert an aligned change request, project-health baseline, and approved PRD into a versioned engineering SPEC with architecture decisions, milestones, acceptance traceability, checks, rollout, rollback, and authorization boundaries. Use for architectural or cross-layer changes and before goal-driven implementation. Do not implement code or mark a SPEC approved without explicit user approval.
---

# AI Spec

## Overview

Act as the full-dev lead router and engineering-contract author. Route incomplete inputs to the correct preparation skill, then produce a versioned SPEC that `goal-driven-development` can execute without inventing requirements. `/ai-spec init` or a new-machine bootstrap request is delegated to `dev-host-init`, which generates a layered injection system: rules doc (AGENTS.md + per-agent mirrors) + external `agent-reference/` refs + pi reinforcement layer (`.pi/agent/APPEND_SYSTEM.md` + `graph-first-gate.ts` extension; pi fully inherits .claude skills at the skill layer).

## Routing

| Condition | Route |
|---|---|
| Intent or scope is ambiguous | `intent-grill` |
| Existing project lacks a health/debt baseline | `project-health-audit` |
| Host machine initialization required (`/ai-spec init`) | `dev-host-init` |
| Product goals, users, scope, or acceptance are undefined | `prd` |
| Approved PRD needs an engineering contract | continue in `ai-spec` |
| SPEC is approved and implementation is requested | `goal-driven-development` |
| Bug without contract change | `codebase-context` → `code-debugger` |
| Delivered work needs feedback routing | `iteration-manager` |

## Workflow

1. Read repository entry instructions, Git state, project context, Change Brief, HEALTH, PRD, existing SPEC/amendments, and relevant code.
2. Confirm the PRD is `APPROVED`; otherwise produce a gap list and stop before engineering finalization.
3. Compare at least two viable designs when a real architectural tradeoff exists. Record the selected option, rejected options, rationale, reversibility, and consequences in ADR form.
4. Define interfaces, data contracts, migrations, compatibility, security, observability, failure/degraded modes, performance budgets, rollout, rollback, and operational ownership as applicable.
5. Split work into dependency-ordered milestones that each fit one implement/check/review loop.
6. Map every PRD requirement and acceptance criterion to SPEC sections, milestones, and verification evidence in `TRACEABILITY.md`.
7. Discover repository-native test/lint/type/build/security commands. Do not invent unavailable commands as facts.
8. Define review policy, debt treatment, commit authorization, and push authorization separately.
9. Write the contract under `tasks/<change-id>/`; keep previous approved versions and create amendments instead of overwriting history.
10. Present unresolved questions and request approval. Set `status: approved` only after explicit user approval.

## SPEC contract

```yaml
---
change_id: CHG-000
version: 1
status: draft
prd_ref: PRD.md
health_ref: HEALTH.md
supersedes: null
approved_by: null
approved_at: null
---
```

Required sections:

1. Context, goal, non-goals, constraints, assumptions, and unresolved questions.
2. Current architecture and debt impact.
3. Selected design and ADR/tradeoffs.
4. Interfaces, data, security, compatibility, migration, observability, rollout, and rollback.
5. Milestones with dependencies, files/modules, acceptance, checks, risks, and rollback.
6. Definition of Ready and Definition of Done.
7. Review and delivery Gates.
8. Traceability and evidence plan.

## Approval and execution rules

- `SPEC_READY` means the document is complete enough to review; it is not approval.
- `SPEC_APPROVED` requires explicit approval and a recorded version.
- Material scope or architecture changes require an amendment/version bump.
- Implementation defaults to `goal-driven-development`; Ralph remains a legacy compatibility option only when explicitly selected.
- Commit and push are separate authorization Gates.

## Output Contract

Produce or update:

- `tasks/<change-id>/CHANGE.md`
- `tasks/<change-id>/SPEC.md`
- `tasks/<change-id>/TRACEABILITY.md`
- approval decision, gaps, and the exact next route

Do not claim readiness when required PRD, health, verification, migration, rollback, or approval information is missing.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Receives | intent-grill / project-health-audit / prd | Prepared change inputs |
| Calls | codebase-context / api-first-modular | Architecture and cross-layer decomposition |
| Hands off | goal-driven-development | Approved SPEC execution |
| Receives back | iteration-manager | SPEC amendment or new change |
