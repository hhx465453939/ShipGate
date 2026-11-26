---
name: intent-grill
description: Align an ambiguous development request before PRD or SPEC by asking one high-value question at a time, checking answers against accessible code and project evidence, and producing a structured Change Brief with goals, current behavior, scope, non-goals, constraints, assumptions, risks, success signals, and unresolved questions. Do not design or implement before the intent exit criteria are met.
---

# Intent Grill

## Overview

Turn an initial request into an evidence-backed Change Brief that product and engineering contracts can consume.

## Workflow

1. Capture the stated problem, desired outcome, affected users, current behavior, and urgency.
2. Inspect accessible project evidence before asking questions that code, docs, issues, or configuration can answer.
3. Ask one material question per turn and include a recommended answer with its tradeoff.
4. Traverse scope, non-goals, compatibility, data, risk, operational impact, success signals, approval boundaries, and likely affected modules.
5. Record assumptions, contradictions, and unresolved questions. Route health/debt uncertainty to `project-health-audit`.
6. Write `tasks/<change-id>/CHANGE.md`; update `CONTEXT.md` only with reusable domain terms and relationships.
7. Present an alignment summary and request confirmation before marking `INTENT_ALIGNED`.

## Exit criteria

Intent is aligned only when:

- problem and desired outcome are distinct;
- current and expected behavior are recorded;
- scope and non-goals are explicit;
- primary users/stakeholders and success signals are known;
- constraints, assumptions, risks, and open questions are visible;
- affected system area is at least provisionally identified;
- the user confirms the summary or explicitly accepts remaining uncertainty.

## Output Contract

`CHANGE.md` must contain: change ID, status, problem, outcome, current behavior, scope, non-goals, users, constraints, assumptions, risks, affected modules, success signals, unresolved questions, evidence pointers, and next route.

Do not turn inferred preferences into requirements. Do not hide unresolved questions inside prose.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Calls | project-health-audit / codebase-context | Existing-system evidence |
| Hands off | prd / ai-spec | Product or engineering contract |
| Receives | iteration-manager | New demand or amendment requiring realignment |
