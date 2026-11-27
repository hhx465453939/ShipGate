---
description: 主调度并生成版本化工程 SPEC、追踪矩阵和 goal 执行合同
---

# /ai-spec

读取 skill `ai-spec` 并处理 `$ARGUMENTS`。

需求不完整时路由到 intent/health/PRD；仅在 PRD 已批准后生成 SPEC。SPEC 获得明确批准后，默认交给 `goal-driven-development`，不要直接进入 Ralph。不得自动批准 SPEC、commit 或 push。
