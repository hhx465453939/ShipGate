---
change_id: CHG-20261128-gates-engine-hint
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-engines-onboarding
approved_by: damncheater
approved_at: 2026-11-28
---

# SPEC — 引擎提示单一真源

## 1. 上下文与既有接口

沿用：`resolveAislop()`（现 `src/gates/quality.mjs`）、`checkEngines()` / `reportEngines()`（现 `src/commands/deploy.mjs`）、`which()` / `version()`（`src/lib/exec.mjs`）、`log` / `c` / `table`（`src/lib/log.mjs`）。

`shipgate gates` 的 JSON 契约（`ctx.flags.json`）保持不变：`{ gates: [...], engines: {...} }`，只把 `engines` 从「布尔」升级为完整信息（向后兼容：原字段仍在）。

## 2. 设计

### 2.1 新的 `src/lib/engines.mjs`

从 `commands/deploy.mjs` 搬出，四个导出：

```js
export function resolveAislop(cwd)                    // 原样搬，唯一实现
export function cbhInstallHint(hasPipx)               // 原样搬（clone + 显式索引 / pipx）
export function checkEngines(ctx)                     // { aislop, cbh } → { bin, version, install, path, onPath, ... }
export function reportEngines(engines, { withPath })  // doctor / install 共用的渲染
export function missingEngineHints(engines)           // 只返回缺失引擎的 { name, install }[]
```

`gates/quality.mjs` 改为 `import { resolveAislop } from '../lib/engines.mjs'`（不再定义）；`commands/deploy.mjs` 删掉本地副本、改从 lib 引入。

### 2.2 `shipgate gates` 的输出

```
引擎
aislop ok   cbh ok
```

若缺：

```
引擎
aislop ok   cbh missing
缺失引擎：
  cbh → git clone --depth 1 … && python -m pip install --user -i https://pypi.org/simple …
```

即：**没有缺失就不打印「缺失引擎」这一段**；有缺失就逐条列出各自的可执行命令（来自 `checkEngines()`，与 doctor 完全一致）。

JSON 分支的 `engines` 从 `{ aislop: true, cbh: true }` 升为完整对象（含 `bin` / `version` / `path` / `onPath` / `install`），并保留 `ok` 布尔字段供脚本沿用。

### 2.3 顺带修

`commands/deploy.mjs` 里 `export function checkEngines(ctx) {  const aislopBin = …` 这行被上一次编辑并成了一行；搬到 lib 时正常格式化。

## 3. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | 抽出 `lib/engines.mjs` | `src/lib/engines.mjs` | AC-2、AC-3 |
| M2 | 改调用点 | `src/gates/quality.mjs`、`src/commands/deploy.mjs` | AC-3 |
| M3 | `gates` 输出条件化 | `src/commands/gates.mjs` | AC-1 |
| M4 | 单测 | `test/topology.test.mjs` | AC-4 |

## 4. 验收判据

- **AC-1** 本机（两引擎都在）`shipgate gates` 输出中不出现「缺失引擎」字样；把 PATH 临时清空后构造缺失场景（单测）时，只列出缺的那个引擎及其命令。
- **AC-2** `resolveAislop` 只有一个定义（`src/lib/engines.mjs`），`grep -rn "function resolveAislop" src` 命中 1 处。
- **AC-3** `shipgate doctor` 与 `shipgate install --yes` 的引擎节输出与改前一致（`aislop 0.23.0 …`、`cbh (无版本开关) …`），`shipgate status` 不变。
- **AC-4** `node --test test/*.test.mjs` 全绿，新增 `missingEngineHints` 用例（齐全 → `[]`；缺 cbh → 一条且含 `-i https://pypi.org/simple` 或 `pipx install`）。
- **AC-5** `shipgate spec check` 与 `shipgate quality` 通过。
