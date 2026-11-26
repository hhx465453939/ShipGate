---
name: code-review
description: Enforce a spec-aware quality gate on a workspace, commit, or pull-request diff using deterministic evidence plus contextual analysis. Use after implementation milestones and before commit, merge, release, or goal completion to verify SPEC and acceptance compliance, regression tests, security, compatibility, migrations, operability, and debt disposition. Never silently discard findings or modify code without authorization.
---

# Code Review

## Overview

Review the actual diff against both the approved change contract and engineering quality standards. External review tools may provide evidence, but the output contract remains the same when they are unavailable.

## Workflow

1. Define the review base/head or workspace scope and capture the complete diff, untracked files, generated files, and relevant commits.
2. Read repository rules, CHANGE, PRD, approved SPEC version, TRACEABILITY, health/debt baseline, and milestone evidence.
3. Run or inspect deterministic checks appropriate to the change. Record commands, status, and limitations.
4. Verify each acceptance criterion and SPEC obligation against code, tests, docs, migrations, configuration, and operational artifacts.
5. Review correctness, regression risk, security, privacy, compatibility, migration/rollback, concurrency, performance, observability, maintainability, and test quality as applicable.
6. Assign every finding severity, evidence, location, rule/requirement, remediation, and disposition.
7. Produce verdict `PASS`, `PASS_WITH_DEBT`, or `FAIL`. Critical/High block. Medium must be fixed or explicitly accepted. Low is retained and may be routed to debt; never silently discard it.
8. Apply fixes only when authorized, then rerun affected checks and review.
9. Write `tasks/<change-id>/REVIEW.md` and update traceability/debt references.

### 🧹 Test-residue & code-turd audit dimension (mandatory)

As part of the review, inspect the diff for droppings left by the test loop and enforce the Test Artifact Hygiene rules (full text in `code-debugger` T0–T3). Treat any of the following as at least a `medium` finding unless explicitly justified:

- **Test artifacts leaked into the repo**: test-framework temp output, fixture residue, un-ignored generated files, test temp dbs/caches/screenshots left committed.
- **Code-level turds**: `print`/`console.log`/debug output, `debugger`/breakpoint statements, commented-out test blocks, temp TODO/FIXME, hardcoded test data/magic numbers, uncleared mock injections, commented-out old implementations.

Flag leaked **runtime data** as `high` (deletion risk), and confirm test-only artifacts were cleaned (T1) rather than committed. Never auto-delete during review — report and route to `code-debugger` cleanup.

## Finding schema

```yaml
id: REV-001
severity: critical|high|medium|low
requirement_ref: ""
location: ""
evidence: ""
risk: ""
remediation: ""
disposition: open|fixed|accepted|deferred
```

## Verdict rules

- `FAIL`: any open Critical/High, failed required check, missing required evidence, or material SPEC violation.
- `PASS_WITH_DEBT`: no blockers; all deferred findings are explicitly accepted and registered.
- `PASS`: all required evidence passes and no unaccepted finding remains.

## Output Contract

Report scope, SPEC version, diff summary, checks, acceptance matrix, findings, debt changes, verdict, and required next transition. A review is incomplete without evidence or when the reviewed diff changes afterward.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Receives | goal-driven-development | Per-milestone and final Gate |
| Calls | codebase-context / code-debugger | Impact analysis and authorized fixes |
| Returns to | project-health-audit / iteration-manager | Deferred debt and outcome findings |
