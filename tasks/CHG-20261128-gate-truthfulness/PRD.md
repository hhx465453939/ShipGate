---
change_id: CHG-20261128-gate-truthfulness
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-gate-parity-null-engine
approved_by: shpc_101170
approved_at: 2026-11-28
---

# PRD — 闸要说真话：能拦、能报、参数符合直觉

## 1. 背景

Linux 端一机部署后的实证审计发现四类缺陷。它们共同的特征是：**命令的输出与它声称的语义不符**，于是闸看起来在工作，实际不拦任何东西。

| # | 现象 | 影响 |
|---|---|---|
| 1 | `status` 只打表不校验；`doctor` 打印「✖ 162 处不一致」却 `return 0` | CI 里没有任何命令会因产物漂移失败，ship 闸是装饰 |
| 3 | 把注入区块从 v3 改回 v2，`doctor` 不报 | 旧版残留区块被当成健康，AC-4 运行时无人把关 |
| 5 | `shipgate spec check <仓库根>` 报「没有任何 CHG-*」 | 用户按直觉传根目录就被误判"仓库无契约" |
| 6 | 未探测到的 harness 文案写「跳过」，实际照样写盘 | 自相矛盾，无法判断是预装还是误装 |

（另两条 `ship.mjs` 单文件哈希 vs 整树哈希、`gates` 把 `pythonEngine` 当引擎，已在 `d4f0575` 修复。）

## 2. 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | 产物漂移能让命令失败 | `doctor` 有 error 级 finding 时退出码 1；`status --strict` 同样 |
| G2 | 注入区块版本参与校验 | 区块版本 ≠ 模板版本时 `doctor` 报 error |
| G3 | `spec check <dir>` 接受仓库根 | 传根（含 `tasks/`）与传 `tasks/` 结果一致 |
| G4 | 未探测 harness 的文案与行为一致 | 文案明说"按显式指定预装"，或者不写盘 |

## 3. 范围

**做**：`src/gates/spec.mjs` 的目录定位；`src/gates/ship.mjs` 的注入版本比对；`src/inject/render.mjs` 暴露模板版本；`src/commands/deploy.mjs` 的 `doctor` 退出码、`status --strict`、`reportMissing` 文案；`docs/GATES.md`；单测。

**不做**：不改默认退出码语义之外的行为（`status` 默认仍是只读视图）；不改 `assets/gates/policy.js`。

## 4. 风险

| 风险 | 缓解 |
|---|---|
| `doctor` 改成失败退出码会让既有脚本"突然红" | 这是修复而非回归：命令本来就在打印 ✖；红才符合"体检"语义 |
| `spec check` 自动下探掩盖真实路径错误 | 只下探 `<dir>/tasks` 一层；错误信息仍打印用户传入的路径 |
