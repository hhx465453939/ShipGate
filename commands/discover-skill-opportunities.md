---
description: 基于可访问的对话、任务日志和工作产物，发现隐藏工作模式并筛选最值得沉淀的 Skill 候选；也可复盘当前 session 已加载 Skill 的表现
argument-hint: "[分析范围或资料路径]"
---

# /discover-skill-opportunities

读取并遵循完整指令：

- `.claude/skills/discover-skill-opportunities/SKILL.md`

分析 `$ARGUMENTS` 指定的范围；未指定时，仅分析当前会话中实际可访问的资料并声明限制。

若 `$ARGUMENTS` 要求复盘本次 session 的 Skill 表现，或满足触发条件（使用了两个及以上 Skill、出现纠错/路径/权限错误或返工、完成较大 SPEC/package/release loop、Skill 输出与交付明显偏差），执行 `Active Skill Performance Review`，并加载 `references/session-skill-review.md`。

## 不可妥协的规则

1. 不声称读取了不可访问的历史、记忆、隐藏 Skill 激活或调用轨迹。
2. 关键发现必须带证据指针、置信度和替代解释。
3. 高频不等于高价值；按稳定性、摩擦、风险、可验证性和战略杠杆综合评分。
4. 比较 checklist、模板、prompt、脚本、自动化和扩展现有 skill 等更简单方案。
5. 默认给出三个候选及实施规格，但不自动创建、修改、安装、commit 或发布。
6. Session 复盘按可见证据归因分层，同时记录有效规则；优先升级既有 Skill 而非新建。

## 标准输出

- 审计范围与限制
- 用户可能尚未命名的关键模式
- 重复工作簇与评分
- 排名前三的 Skill 候选
- 暂不建议 Skill 化的事项
- 当前 session Skill 表现（仅在触发复盘时）
- 下一步决策入口
