---
change_id: CHG-20261128-gate-parity-null-engine
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-gate-bundle-integrity
approved_by: shpc_101170
approved_at: 2026-11-28
---

# PRD — 闸判据与引擎探针的 null 安全

## 1. 背景

按 `origin/main`（497c513）在一台 Windows 主机上执行标准部署，三条命令全部不可用。它们不是环境特殊，而是**判据分叉**与**可空字段没被当可空**。

```
$ shipgate install --yes
引擎
shipgate: Cannot read properties of null (reading 'bin')      ← 写盘已完成后崩，退出码 2

$ shipgate gates
shipgate: Cannot read properties of null (reading 'bin')

$ shipgate doctor
✖ 216 处产物不一致
  claude skill hash 与 manifest 不符：ai-spec
  …
```

## 2. 根因

### 2.1 `pythonEngine` 被当成引擎遍历（三处）

`checkEngines()` 返回 `{ aislop, cbh, pythonEngine }`。`pythonEngine` 是 aislop 的子探针，**没有 `bin` 契约**，在 aislop 未随包分发该平台引擎时为 `null`（本机实测 `pythonEngine: null`）。

`reportEngines()` 已经显式 `continue` 掉它，但另外三处各自手写遍历：

| 位置 | 写法 |
|---|---|
| `deploy.mjs` install 尾部 | `Object.entries(engines).filter(([, info]) => !info.bin)` |
| `commands/gates.mjs` | `Boolean(info.bin)` |
| `commands/gates.mjs` 打印 | `info.bin ? ok : missing` |

后果：`install` 在**所有写盘动作完成之后**崩，退出码 2 —— 产物是好的，命令是失败的，最容易让人误判部署没做。

### 2.2 ship 闸与 install 用两套 skill 判据

`gate-bundle-integrity` v2 把 `installSkills` 的跳过判据从 `hashFile(SKILL.md)` 改成 `hashTree(skill 目录)`，manifest 里存的也是整棵目录哈希。

但 `src/gates/ship.mjs` 仍用 `hashFile(installed/SKILL.md)` 去比 `meta.hash`（整棵目录哈希）。两个口径永远不等 → **8 harness × 27 skill = 216 处全量误报**。

同样的分叉还有第二层：install 用 `sourceTreeDrift(src, dst)`（只要求目的包含源的全部文件，目的自加文件不算漂移），ship 闸却用整棵哈希（目的自加文件也算不同）。于是 codex 自带的 `~/.codex/skills/<name>/agents/openai.yaml` 被当成"与源不一致"。

## 3. 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | `install` / `gates` / `doctor` 不再因 `pythonEngine: null` 崩溃 | 三条命令退出码 0 |
| G2 | 引擎缺失判断只有一份实现 | 命令层不再出现 `info.bin` 的手写遍历 |
| G3 | ship 闸与 install 用同一 skill 判据 | 目的自加文件不报；缺/改必报 |
| G4 | 216 处误报归零 | `doctor` 显示"产物与 manifest 一致" |

## 4. 范围

**做**：`src/lib/engines.mjs` 的 `missingEngineHints` 空值安全与 `pythonEngine` 排除；`deploy.mjs` / `gates.mjs` 改为复用它；`gates/ship.mjs` 改用 `sourceTreeDrift`；对应回归测试。

**不做**：不改 `assets/gates/policy.js` 的判定规则；不改 manifest 的哈希算法；不新增功能。

## 5. 成功信号

- 三条命令在 `pythonEngine` 为 `null` 的机器上全部正常退出。
- `doctor` 的产物一致性为 0 处不一致。
- 新增回归用例覆盖 null 探针与"目的自加文件不算漂移"。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 去掉 manifest 哈希比对后漏检"被篡改但文件集相同" | `sourceTreeDrift` 逐文件比内容，篡改必命中；目的多出的文件由用户/其他工具产生，不该由 ShipGate 判错 |
| 排除 `pythonEngine` 后漏报"bundled 引擎不可用" | 该诊断由 `doctor` 的 `AISLOP_PYTHON_ENGINE_UNUSABLE` 独立负责（`CHG-20261128-gate-bundle-integrity` §3.4），不是引擎缺失语义 |
