---
name: shipgate-spec
description: 契约闸使用方法。当需要把需求变成工程契约、写 tasks/CHG-<id>/ 的 PRD/SPEC/TRACEABILITY、或 shipgate spec check 报缺口时使用。覆盖契约三件套的必备字段、验收判据写法、status 流转、以及「无契约不改码」的落地方式。
---

# spec 闸 — 契约先行

## 何时用

- 用户要改代码，但项目里没有 `tasks/CHG-<id>/` 契约 → 先立契约，再动代码。
- `shipgate spec check` 返回非 0 → 按输出补缺口。
- 需求模糊、验收标准说不清 → 先用 `intent-grill`（若已装）问清，再写契约。

## 三件套（缺一不可）

```
tasks/CHG-<YYYYMMDD>-<slug>/
├── PRD.md            问题、用户、目标、非目标、成功判据
├── SPEC.md           工程契约（frontmatter + 设计 + 里程碑 + AC）
└── TRACEABILITY.md   需求 → 设计 → 里程碑 → 验收证据
```

### SPEC.md 最小 frontmatter

```yaml
---
change_id: CHG-20261126-example
version: 1
status: approved          # draft 时 spec 闸直接判不通过
prd_ref: PRD.md
supersedes: null
approved_by: <人>
approved_at: 2026-11-26
---
```

### 验收判据（spec 闸会检查）

SPEC 正文必须出现 `验收判据` 或 `AC-1` 这类可执行条目，且每条能对应一个命令：

```
- AC-1 `shipgate gates` 输出四道闸，退出码 0
- AC-2 无契约目录时 spec check 退出码 1
```

不可执行的"验收"（"代码质量良好""功能正常"）等于没写。

## 流程

1. 读项目约定（`AGENTS.md` / `CLAUDE.md`）与已有 CHG，别重复立项。
2. 写 PRD → 写 SPEC（设计、接口、红线、里程碑、AC）→ 写 TRACEABILITY 映射表。
3. 跑 `shipgate spec check`，绿了再改代码。
4. 实现中改设计 → 升 version、记 amendment，不覆盖历史。
5. 交付前把 TRACEABILITY 的"验收执行记录"逐条填成实测结果。

## 常见缺口与修法

| 输出 | 修法 |
|---|---|
| 缺少 PRD.md | 补问题/用户/目标/非目标/成功判据，一页就够 |
| status 仍为 draft | 找人明确批准后再改；不得自己批 |
| 未写验收判据 | 每条 AC 写成一个能跑的命令 + 期望退出码 |

## 红线

- 不伪造批准（`approved_by`）。
- 不用"先改代码，契约后补"——那正是本闸要拦的行为。
