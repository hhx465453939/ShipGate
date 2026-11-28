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

# SPEC — 闸判据与引擎探针的 null 安全

## 1. 上下文与既有接口

沿用：`checkEngines` / `reportEngines` / `missingEngineHints`（`src/lib/engines.mjs`）、`hashTree` / `sourceTreeDrift`（`src/lib/skills.mjs`）、`runShipGate`（`src/gates/ship.mjs`）、`Verdict` 与退出码约定（`docs/GATES.md`）。

本 CHG 只做一件事：**把"引擎集合"和"skill 一致性"各自收敛到唯一判据**。门控判定规则（`assets/gates/policy.js`）一行不动。

### 1.1 复现基线（2026-11-28，Windows 11 / Node 24.22.1 / aislop 0.23.0）

```
$ node -e "…checkEngines({cwd:'.'}).pythonEngine"   →  null

$ shipgate install --yes
引擎
shipgate: Cannot read properties of null (reading 'bin')     exit 2（产物已写）

$ shipgate gates
shipgate: Cannot read properties of null (reading 'bin')

$ shipgate doctor
✖ 216 处产物不一致   （216 = 8 harness × 27 skill）
```

## 2. 设计

### 2.1 引擎缺失判断：唯一真源

`src/lib/engines.mjs`：

```js
export function missingEngineHints(engines) {
  return Object.entries(engines)
    // `pythonEngine` is a sub-probe of aislop, not an engine: it has no `bin`
    // and no `install`, and is null when aislop ships no bundled engine for
    // this platform. Same exclusion as reportEngines().
    .filter(([name, info]) => name !== 'pythonEngine' && !info?.bin)
    .map(([name, info]) => ({ name, install: info.install }));
}
```

`src/commands/deploy.mjs` 的 install 尾部改为 `const missingEngines = missingEngineHints(engines);`（import 同步补上）。

`src/commands/gates.mjs`：

- `withOk` 自 `engines` 构造时过滤掉 `pythonEngine`，并用 `Boolean(info?.bin)`；
- 引擎行的打印改为遍历 `withOk`（`info.ok`），不再直接读 `info.bin`。

三处手写遍历归零后，`reportEngines()` 仍是唯一的"逐引擎打印"，`missingEngineHints()` 是唯一的"缺失判定"。

### 2.2 ship 闸与 install 同判据

`src/gates/ship.mjs`：

```js
import { sourceTreeDrift } from '../lib/skills.mjs';
...
const sourceDir = path.join(skillsSource, name);
const source = path.join(sourceDir, 'SKILL.md');
if (!exists(installed)) { /* skill 缺失 */ continue; }
// Same judgement as installSkills(): the destination must carry every source
// file with matching content. Files the destination adds on its own (e.g.
// codex's agents/openai.yaml inside a skill) are not drift — comparing
// whole-tree hashes here made every install look inconsistent.
if (exists(source) && sourceTreeDrift(sourceDir, path.join(harness.skillsPath, name))) {
  findings.push({ level: 'error', harness: harness.id, message: `skill 与源不一致，需要重装：${name}` });
}
```

- 删除 `installedHash !== meta.hash` 的比较：`meta.hash` 是整棵目录哈希（`hashTree(src)`），与目的目录不可直接比；一致性语义改由 `sourceTreeDrift` 承担。
- `for (const [name, meta] of …)` 简化为 `for (const name of Object.keys(…))`，`meta` 不再使用。

语义保持：**目的缺文件或内容不同 → error；目的自加文件 → 不报**。

### 2.3 回归测试

`test/topology.test.mjs` 追加两条：

1. `missingEngineHints({ aislop: {bin:'/x'}, pythonEngine: null })` → `[]`；
   `missingEngineHints({ aislop: {bin:null, install:'…'}, pythonEngine: null })` → 只含 `aislop`。
   （原实现会在 `info.install` 处再抛一次，所以这条用例同时锁住 `.bin` 与 `.install` 两次崩溃。）
2. `runShipGate` 三态：目的与源一致 → 0 findings；目的多出 `agents/openai.yaml` → 仍 0；目的 `SKILL.md` 内容被改 → 1 条 `skill 与源不一致`。

## 3. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | `missingEngineHints` null 安全 + 排除探针 | `src/lib/engines.mjs`、`src/commands/deploy.mjs` | AC-1 |
| M2 | `gates` 命令去手写遍历 | `src/commands/gates.mjs` | AC-2 |
| M3 | ship 闸改用 `sourceTreeDrift` | `src/gates/ship.mjs` | AC-3 |
| M4 | 回归测试 | `test/topology.test.mjs` | AC-4 |
| M5 | 本机复验与全局部署 | 无（运维动作） | AC-5 |

## 4. 验收判据

- **AC-1** `shipgate install --yes` 退出码 0，引擎节打印 `aislop` / `cbh` 两行。
- **AC-2** `shipgate gates` 退出码 0，引擎行只有 `aislop` / `cbh`，不再出现 `pythonEngine`。
- **AC-3** `shipgate doctor` 的产物一致性为 `✔ 8 个 harness 的产物与 manifest 一致`；`grep -c "hash 与 manifest 不符"` 在源码中为 0。
- **AC-4** `node --test test/*.test.mjs` 全绿，含 §2.3 两条新用例。
- **AC-5** 重复 `install --yes` 幂等；`quality .` ≥ 80 且 0 error；`spec check` 通过。

## 5. 变更记录

- v1（2026-11-28）：首版。仅修阻塞部署的三类缺陷，不引入新功能。

## 6. DoR / DoD

- DoR：操作者要求"源码的 bug 修了 commit push"；三件套齐；三类缺陷已在本机复现。
- DoD：AC-1…AC-5 全绿；TRACEABILITY 逐条填实测；一个提交只含本 CHG 的四处修复。
