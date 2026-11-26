---
description: 全栈安全审计 — 静态+动态+依赖CVE，证据驱动分级报告，只审计不修复
---

# /security-audit

读取 `.claude/skills/security-audit/SKILL.md` 并对 `$ARGUMENTS` 指定的仓库做全栈安全审计。先 codebase 知识图谱嵌入，再按技术栈分面静态审计 + 依赖 CVE 比对，然后公网/内网动态渗透，最后在 `.debug/` 输出证据驱动、分级清晰的报告。只审计不修复，不产生 commit/push。
