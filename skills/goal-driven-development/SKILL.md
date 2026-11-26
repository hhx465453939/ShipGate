---
name: goal-driven-development
description: Execute an approved engineering SPEC through a persistent, evidence-backed development goal loop. Use after intent, project health, PRD, and SPEC are approved to implement milestones, run deterministic checks, enforce spec-aware review, and stop at separate commit and push authorization gates. Use a native goal/plan API when available and a goal-state file adapter otherwise. Do not use for vague requirements, unapproved specs, one-off explanations, or autonomous commit/push without explicit authorization.
---

# Goal-Driven Development

## Overview

Act as the default coding harness after `SPEC_APPROVED`. Advance one verifiable milestone at a time, persist state and evidence, and keep implementation, review, commit, push, and outcome feedback as explicit transitions.

## Input Contract

Require or resolve:

- repository entry instructions and current Git status;
- `CHANGE.md`, approved `PRD.md`, approved `SPEC.md`, and `TRACEABILITY.md`;
- project health/debt baseline when modifying an existing system;
- acceptance criteria, deterministic check commands, milestone dependencies, and approval boundaries.

If essential input is missing, stop before code changes and route to `intent-grill`, `project-health-audit`, `prd`, or `ai-spec`.

## Goal adapter

1. Use the runtime's native goal API when one actually exists. Set the concrete objective from the approved SPEC and preserve the platform's completion/blocking semantics.
2. Otherwise create or update `tasks/<change-id>/goal-state.yaml` with the same objective, milestones, current state, evidence, blockers, and authorization fields.
3. Never claim to have called `/goal`, `create_goal`, or an equivalent API when it is unavailable.
4. Do not close a goal because context, time, or budget is low. Close only when acceptance is met; mark blocked only under the runtime's genuine blocking rules.

Minimal adapter schema:

```yaml
change_id: CHG-000
spec_version: 1
state: GOAL_ACTIVE
objective: ""
milestones: []
current_milestone: ""
evidence: []
blockers: []
authorization:
  commit: false
  push: false
```

## Workflow

### Phase 1: Initialize or resume

1. Read repository instructions, change artifacts, goal state, Git status, and prior evidence.
2. Reject stale or superseded SPEC versions.
3. Convert the SPEC into dependency-ordered milestones, each small enough for one implementation/check/review loop.
4. Map every acceptance criterion to at least one milestone and verification method.
5. Enter `GOAL_ACTIVE` only when dependencies and working-tree ownership are understood.

### Phase 2: Execute one milestone

1. Select the highest-priority incomplete milestone whose dependencies are satisfied.
2. Declare the intended files, acceptance criteria, checks, risks, and rollback before editing.
3. Implement the smallest coherent change; preserve unrelated user work.
4. Run repository-native lint, type, unit, integration, build, security, or manual checks appropriate to the change.
5. Store concise commands, exit status, and artifact pointers under `evidence/`; never mark success from narrative alone.

**🧹 Test Artifact Hygiene (mandatory around every test/checkfix)** — Testing is the leakiest step in the dev loop. Before and after any test/verify/checkfix run, enforce T0–T3:

- **T0 · Pre-test Sweep** — Before running tests, scan the worktree for leftover artifacts from the *previous* round: un-ignored test artifacts, temp dbs/caches/screenshots/exports, fixture residue, `__pycache__`. Report the list to the user before starting this round. **Scan test artifacts only — never touch another agent's in-flight code changes.**
- **T1 · Post-test Cleanup** — After tests, sweep this round's droppings: run residue, temp output, debug snapshots, un-ignored generated files. Report the list, then clean.
- **T2 · Distinguish three classes — deleting runtime data is an incident**

  | Class | Criteria | Action |
  |-------|----------|--------|
  | **Test artifact** | test-framework temp output, fixture residue, test temp db/cache/screenshot/mock data, `__pycache__`, .gitignore-covered generated files | report, then **auto-delete** |
  | **Runtime data** | real DB records, logs, user uploads, real cached data, prod/hot-dev live state | **never delete**, even if it looks temp |
  | **Ambiguous / unconfirmed** | neither clearly a test artifact nor confirmable runtime data; or another agent's in-flight work | **ask the user per item** |

- **T3 · Code-level Turd Sweep** — After tests pass, clean code residue: `print`/`console.log`/debug output, `debugger`/breakpoint statements, commented-out test blocks, temp TODO/FIXME, hardcoded test data/magic numbers, uncleared mock injections, commented-out old implementations. These "turds" mislead hot-dev and prod debugging; remove them with the test loop.
- **Delete safety net**: use `/bin/rm -f` or `command rm -f` (bypass the `rm -i` alias); report the list + classification before deleting; never touch runtime data; ask on ambiguity; delete only this round's own test artifacts, never another agent's work.

### Phase 3: Enforce compliance and review

1. Move to `CHECKING`, then compare the diff against SPEC, traceability, acceptance criteria, project rules, and debt constraints.
2. Move to `REVIEWING` and invoke or follow `code-review`.
3. On `FAIL`, enter `FIX_REQUIRED`, fix within scope, and rerun checks and review.
4. On `PASS_WITH_DEBT`, record accepted findings in the debt register with owner/reason/follow-up.
5. Mark a milestone complete only when deterministic evidence and review verdict exist.

### Phase 4: Delivery gates

1. When all milestones pass, update `TRACEABILITY.md`, `goal-state.yaml`, plan documents, and reusable repository learnings.
2. Enter `COMMIT_READY`; report the exact diff and evidence.
3. Commit only when commit authorization is explicit. Then enter `COMMITTED` and record the commit hash.
4. Push only when push authorization is separately explicit. Then enter `PUSHED` and record the remote/ref.
5. Do not treat approval to edit, test, run a goal, or commit as push authorization.

### Phase 5: Outcome and continuation

1. Route delivered, stopped, or partially accepted work to `iteration-manager`.
2. Classify residuals as bug, debt, PRD amendment, SPEC amendment, or new change.
3. Continue the existing goal only for in-scope incomplete milestones under the same approved SPEC; otherwise create a new change/version.
4. Complete only when acceptance, traceability, review, and required delivery state are all satisfied.

## Completion rule

Never use a model-emitted `COMPLETE` string as proof. Completion requires:

- all required milestones complete;
- all acceptance criteria mapped to passing evidence;
- review verdict `PASS` or approved `PASS_WITH_DEBT`;
- no Critical/High findings;
- traceability and goal state updated;
- Git/delivery state accurately reported;
- outcome review performed or explicitly deferred.

## Output Contract

Report each turn with:

1. change/spec and current state;
2. milestone advanced and files affected;
3. checks and evidence;
4. review verdict/findings;
5. blockers or debt;
6. next transition and required authorization.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Requires | intent-grill / project-health-audit / prd / ai-spec | Prepare approved change contract |
| Calls | codebase-context / code-debugger / code-review | Context, repair, and quality gate |
| Returns to | iteration-manager | Outcome and next-cycle routing |
| Legacy alternative | ralph / ralph-yolo | Compatibility only; not the default harness |
