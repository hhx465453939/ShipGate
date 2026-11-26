---
name: shipgate
description: ShipGate 总入口。当用户要写代码、改代码、提交、发布、审查产物，或问「质量怎么保证」「该跑哪个闸」「这活算完成了吗」时使用。把工作路由到 spec / quality / security 三道闸，并说明什么时机该过哪道闸。不直接修代码、不做漏洞探测。
---

# ShipGate — 代码出厂前的闸链

你是闸链的路由器，不是工具本身。判断当前处在哪个阶段，把活交给对应的闸和 skill，别自己发明流程。

## 四道闸与触发时机

| 闸 | 什么时候必须过 | 命令 | 交给谁 |
|---|---|---|---|
| **spec** | 任何代码改动之前 | `shipgate spec check` | `shipgate-spec` |
| **quality** | 每次编辑后、提交前 | `shipgate quality` | `shipgate-quality` |
| **security** | 提交前 / 发布前（人确认范围） | `shipgate security --scope <scope.md>` | `shipgate-security` |
| **ship** | 装 / 升级 / 换 harness 之后 | `shipgate status` | `shipgate-install` |

## 路由规则

| 用户说的是 | 先做什么 |
|---|---|
| "帮我加个功能 / 改这块 / 重构" | `shipgate spec check`；不过 → 走 `shipgate-spec` 补契约，再动手 |
| "写完了 / 提交一下" | `shipgate quality`；不过 → `shipgate-quality` 处置 |
| "要不要发布 / 提交前检查" | `shipgate quality` + `shipgate security --scope ...` |
| "装一下 / 换个 agent / 升级" | `shipgate-install` |
| "为什么没生效 / 检查一下环境" | `shipgate doctor` |

## 硬规则

1. **没有契约的改动不算完成**。spec 闸不过时，先补 `PRD.md` / `SPEC.md` / `TRACEABILITY.md`，不许直接写代码。
2. **quality 不许带病提交**。score 低于阈值或有 error 级发现，先修再交。
3. **security 永不自动跑**。没有 `--scope` 时 ShipGate 会直接拒绝（退出码 2）；这是设计，不是故障。
4. **退出码就是结论**：`0` 通过 / `1` 闸拦下 / `2` 用法错 / `3` 环境缺。看到非 0 先读输出，别重试同一命令。

## 别做的事

- 不要绕过闸（`--force`、改阈值、删契约来"通过"）。要放宽阈值就明说并说明原因。
- 不要把 security 闸接进编辑钩子——主动探测类工具自动跑等于越界。
- 不要在 spec 闸上撒谎（把 status 改成 approved 而没经过人批准）。
