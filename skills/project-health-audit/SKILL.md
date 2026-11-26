---
name: project-health-audit
description: Establish an evidence-backed project health and technical-debt baseline before PRD, SPEC, refactoring, migration, or major feature work. Use to inspect build/test/lint status, architecture hotspots, dependency and security risk, mocks/stubs/TODOs, documentation drift, migrations, and recent change hotspots, then classify debt as before/during/after the proposed change. Do not implement remediations unless separately authorized.
---

# Project Health Audit

## Overview

Determine whether existing system conditions block, constrain, or should be addressed alongside a proposed change. Produce a reproducible baseline, not a generic code-quality opinion.

## Workflow

1. Read repository rules, change intent, architecture/context artifacts, Git state, CI configuration, manifests, tests, migrations, and recent history.
2. Discover the repository's own check commands; run safe read-only or normal validation checks appropriate to the audit scope.
3. Inspect build/test/lint/type status, flaky or skipped tests, dependency/security signals, module coupling, change hotspots, TODO/FIXME/stub/mock, migrations, configuration drift, observability, and documentation drift.
4. Attach file, command, commit, report, or log evidence to every finding. Separate observed failure from inferred risk.
5. Score severity, likelihood, change relevance, remediation cost, and confidence.
6. Classify remediation timing as `BEFORE_CHANGE`, `DURING_CHANGE`, `AFTER_CHANGE`, or `ACCEPTED`.
7. Write `tasks/<change-id>/HEALTH.md` and a structured debt register when the project has a change workspace.

## Debt schema

```yaml
debt_id: TD-001
title: ""
severity: critical|high|medium|low
evidence: []
affected_modules: []
blocks_change: false
timing: BEFORE_CHANGE|DURING_CHANGE|AFTER_CHANGE|ACCEPTED
remediation: ""
owner: ""
confidence: high|medium|low
status: open
```

## Guardrails

- Do not equate old code with debt; require impact and evidence.
- Do not run destructive migrations, upgrades, deployments, or broad autofixes during an audit.
- Do not hide failed checks. Distinguish environment failure from product failure.
- Avoid universal thresholds; prefer repository policy and change-specific risk.
- Route implementation findings to the approved goal/SPEC instead of silently expanding scope.

## Output Contract

Produce:

1. audit scope, environment, commands, and limitations;
2. baseline status for build/test/lint/type/security/docs/migrations;
3. prioritized debt register with evidence and confidence;
4. change-impact map and blocking debt;
5. before/during/after remediation recommendation;
6. inputs to PRD/SPEC and explicit non-findings.

## Related skills

| Relation | Skill | Scenario |
|---|---|---|
| Uses | codebase-context | Architecture and impact evidence |
| Feeds | intent-grill / prd / ai-spec | Change constraints and debt decisions |
| Feeds | goal-driven-development | Required preconditions and debt controls |
| Receives | iteration-manager | Deferred findings from delivered work |
