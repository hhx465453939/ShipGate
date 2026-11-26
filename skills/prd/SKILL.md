---
name: prd
description: Create or amend a versioned Product Requirements Document from an aligned Change Brief and available project-health evidence. Use before engineering SPEC work to define users, goals, scope, non-goals, stories, dependencies, risks, success metrics, rollout expectations, Definition of Ready/Done, and acceptance criteria. Do not implement code or route directly to an execution harness before PRD and SPEC approval.
---

# PRD

## Overview

Create a product contract that is testable, dependency-aware, and suitable for engineering specification. Preserve approved history through amendments.

## Workflow

1. Read `CHANGE.md`, project context, HEALTH/debt baseline, existing PRD versions, user evidence, and applicable constraints.
2. Ask only unresolved product questions; do not substitute engineering preferences for user outcomes.
3. Define problem, users, current behavior, goals, non-goals, scope, success metrics, risks, assumptions, and operational expectations.
4. Write dependency-ordered user stories. Give each stable ID, rationale, priority, dependencies, acceptance criteria, and evidence method.
5. Include compatibility, migration/rollout expectations, failure/degraded behavior, security/privacy needs, observability, and support implications when relevant.
6. Map technical debt findings to before/during/after/accepted product constraints without prescribing implementation details.
7. Validate Definition of Ready and Definition of Done.
8. Save `tasks/<change-id>/PRD.md`; request approval and preserve prior approved versions through amendments.

## Required story schema

```yaml
id: US-001
title: ""
user: ""
outcome: ""
priority: 1
dependencies: []
acceptance_criteria: []
evidence_method: []
risks: []
status: draft
```

## Definition of Ready

- intent is aligned and scope/non-goals are explicit;
- user and outcome are known;
- blocking health/debt decisions are recorded;
- every story has dependencies and testable acceptance;
- metrics, risks, failure behavior, and rollout expectations are sufficient for the change;
- unresolved questions are visible and accepted or resolved.

## Definition of Done

Define product completion independently from implementation activity: acceptance evidence passes, required documentation/operability exists, rollout/rollback expectations are satisfied, and accepted residuals are recorded.

## Output Contract

Produce versioned PRD metadata, problem/users/goals/non-goals/scope, stories, dependencies, success metrics, risks, debt impact, Ready/Done, acceptance matrix, unresolved questions, approval status, and next route.

Do not call Ralph or any coding harness directly. Approved PRD routes to `ai-spec`; approved SPEC routes to `goal-driven-development`.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Receives | intent-grill / project-health-audit | Change and health evidence |
| Hands off | ai-spec | Engineering contract |
| Receives back | iteration-manager | PRD amendment |
