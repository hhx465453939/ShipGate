# AGENTS.md — ShipGate 项目约定

本文件是给在本仓库工作的编码 agent 看的。人读 README.md 就够。

## 这个项目是什么

ShipGate = 代码出厂前的闸链。四道闸：`spec`（契约）、`quality`（AI slop）、`security`（授权范围内的安全审计）、`ship`（把 skills/注入/硬门控装到各个 harness）。

目录地图：`bin/` CLI 入口 · `src/gates/` 闸判据 · `src/harness/` 适配 · `src/inject/` 托管区块 · `src/lib/` 零依赖工具 · `skills/` 随包分发的 skill · `assets/pi-gate/` vendored 硬门控 · `docs/` · `tests/`。

## 改代码前必须做

1. 读 `tasks/CHG-<id>/` 下最近一份成立的契约（PRD + SPEC + TRACEABILITY 三件齐全，SPEC status 非 draft）。
2. 没有契约 → 先立契约，再动手。**没有契约的改动不算完成。**
3. 改完跑：
   ```bash
   node --test test/
   node bin/shipgate.mjs spec check
   node bin/shipgate.mjs quality --min 80
   ```
4. 把 TRACEABILITY 的"验收执行记录"逐条填成实测结果，不许预先勾选。

## 硬约束

| 约束 | 原因 |
|---|---|
| 运行时零依赖（只用 Node 内置模块） | 目标机器 8 GiB 内存常年吃紧，依赖会让 install 变成不确定事件 |
| 注入只写托管区块，不整体覆写 | 用户的 CLAUDE.md / AGENTS.md 是长期手写资产 |
| security 闸不得注册为自动钩子 | 主动探测在错误范围上违法 |
| 不 fork aislop / cbh | 上游迭代快，fork = 永久 merge 负债 |
| 删除类动作只作用于 manifest 记录且 hash 匹配的路径 | `--prune` 不能变成误删工具 |
| 不在实例目录做 git 清场 | 工作区脏 = 正在运行的状态 |

## 代码风格

- ESM，`.mjs`，Node ≥ 20，无构建步骤。
- 函数短，单一职责；`Verdict` 是闸层唯一输出形态。
- 错误要么抛出（配置损坏、用法错误），要么转成 Verdict（闸不通过）。**不吞异常**。
- 不写解释"代码在做什么"的注释；只写"为什么这样做"。
- 新增闸/适配器时同步更新 `docs/` 与对应 skill。

## 提交规范

```
<type>(<scope>): <summary> [CHG-<id>]

type: feat | fix | docs | refactor | test | chore
```

一次提交只做一件事；提交信息里带 CHG id。

## 不要做的事

- 不要把 `scoreable=false` 判成通过。
- 不要为了过闸调低阈值、删测试、加批量豁免。
- 不要把第三方的 85 个 hunt-* skill 复制进本仓库（体积与迭代频率都不合）。
- 不要在没读契约的情况下改 `src/gates/` 的判定逻辑。
