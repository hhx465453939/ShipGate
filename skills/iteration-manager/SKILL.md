---
name: iteration-manager
description: Convert delivery outcomes, user acceptance, review findings, production signals, incidents, metrics, and deferred debt into the next controlled development iteration. Use after a goal is delivered, stopped, or partially accepted to decide whether evidence requires a bug fix, debt item, PRD amendment, SPEC amendment, or new change. Do not silently rewrite approved historical PRD/SPEC artifacts or start implementation without the next required approval.
---

# Iteration Manager

## Overview

Close the learning loop after implementation. Preserve what was approved, compare expected and observed outcomes, then create the smallest correctly classified next work item.

## Workflow

1. Read `CHANGE.md`, PRD, SPEC, traceability, goal state, review, evidence, delivery state, user acceptance, operational signals, and unresolved debt.
2. Compare expected outcomes and acceptance criteria with observed behavior. Separate product gap, implementation defect, specification defect, environmental issue, and new demand.
3. Classify every residual:
   - `BUG`: approved behavior was implemented incorrectly;
   - `DEBT`: behavior is acceptable but creates a documented engineering liability;
   - `PRD_AMENDMENT`: user outcome, scope, or acceptance must change;
   - `SPEC_AMENDMENT`: engineering contract was incomplete or incorrect without changing product intent;
   - `NEW_CHANGE`: independent demand outside the approved change;
   - `NO_ACTION`: evidence does not justify more work.
4. Preserve prior documents. Create a versioned amendment or new change ID rather than overwriting approved history.
5. Record priority, evidence, owner, dependencies, risk, and the next approval Gate.
6. Update `OUTCOME.md`; route bug to `code-debugger`, debt to the debt register, amendments to `prd`/`ai-spec`, and new demand to `intent-grill`.

## Decision rules

- Continue the same goal only when work remains within the same approved SPEC version.
- Reopen a completed milestone only with evidence and an audit trail.
- Do not convert review findings into hidden scope additions.
- Do not treat telemetry correlation as causation without supporting evidence.
- Do not start implementation while the next PRD/SPEC amendment is unapproved.

## Output Contract

Produce:

1. expected-versus-observed outcome table;
2. residual classification with evidence and confidence;
3. accepted/deferred debt changes;
4. new change or amendment identifiers and parent links;
5. recommended priority and next route;
6. explicit decision: continue goal, open amendment, open new change, or close.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Receives | goal-driven-development / code-review | Delivery and residual evidence |
| Routes to | code-debugger | Implementation defect |
| Routes to | project-health-audit | Debt or baseline update |
| Routes to | intent-grill / prd / ai-spec | New or amended contract |
