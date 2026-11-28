---
change_id: CHG-20261128-gate-bundle-integrity
version: 3
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-engines-onboarding
approved_by: shpc_101170
approved_at: 2026-11-28
---

# SPEC — 门控产物完整性与引擎自诊断

## 1. 上下文与既有接口

沿用：`installGateBundle` / `mergePolicy` / `projectPolicy` / `savePolicy`（`src/lib/gate.mjs`）、`runQualityGate`（`src/gates/quality.mjs`）、`checkEngines`（`src/lib/engines.mjs`）/ `doctor`（`src/commands/deploy.mjs`）、`run` / `which` / `version`（`src/lib/exec.mjs`）、`Verdict` 与退出码约定（`docs/GATES.md`）。

本 CHG 只改四件事：**合并方向**、**产物完整性**、**引擎错误分类**、**引擎可执行性诊断**。门控判定规则（`assets/gates/policy.js`）一行不动。

### 1.1 复现基线（2026-11-28，Ubuntu 20.04 / GLIBC 2.31 / Node 24）

```
$ shipgate install --yes            # 9 个 harness
$ node -e "console.log(Object.keys(require('~/.config/shipgate/gate-policy.json')))"
config,name,version,description,reminder,checks,...     ← 真源被写进整份 v5 文档
$ grep '"version"' ~/.pi/agent/extensions/enforce-rules/policy.json
"version": 5                                            ← 出厂是 6
$ grep '"version"' ~/.dsh/extensions/enforce-rules/policy.json
"version": 5                                            ← 出厂是 7（继承自被污染的真源）

$ cat ~/.dsh/extensions/enforce-rules/index.js
export { default } from './pi/index.js';                 ← dsh 拿到 pi 适配器
$ ls ~/.dsh/extensions/enforce-rules/package.json        ← 不存在，Node 按 CJS 解析 ESM

$ shipgate quality .
✖ [quality] score 86，1 个 error 级发现
   Unexpected end of JSON input                          ← rule=ruff/engine-error，不是代码问题
$ aislop doctor | head -12
 ✓ Linting  ready  oxlint (bundled)                      ← 掩盖了 Python 引擎不可执行
$ ~/.nvm/.../aislop/tools/python/linux-x64/aislop-python --help
... version `GLIBC_2.34' not found                       ← 根因
```

## 2. 根因

### 2.1 合并方向反了（`installGateBundle`）

```js
copyTree(source, harness.gateDest, { skip: ['policy.json'] });   // 出厂 per-kind policy 被跳过
const merged = mergePolicy(loadPolicy(), existing);              // base = 既有文档（可能是 v5）
writeText(target, merged);
savePolicy(merged);                                              // 整份文档提升进真源
```

`mergePolicy(global, existing)` 的 `{...existing, ...global}` 里，global 只有 `config`，于是文档字段全部来自 `existing`。第一次安装把 v5 文档写进真源，第二次安装时 dsh 的 `existing` 为 null，就直接继承了真源里的 v5 文档。

### 2.2 产物不完整（entry / package.json）

`assets/gates/index.js` 是 pi 入口（`export { default } from './pi/index.js'`），`copyTree` 对所有 kind 都原样复制。dsh 适配器自己的注释写明"用 `../../plugins/<dir>/dsh/index.js` 作为 module specifier"，且 dsh 以 ESM 载入插件——目录缺 `package.json {"type":"module"}` 时 Node 按 CJS 解析，`export` 语法直接失败。

### 2.3 引擎级错误没有分类（`runQualityGate`）

```js
const errors = diagnostics.filter((d) => d.severity === 'error');
const ok = data.score >= min && errors.length === 0;
```

aislop 在引擎崩溃时会产出一条 `rule: <engine>/engine-error` 的 error 级诊断，`scoreable` 仍为 `true`。当前实现把它当普通 finding，于是"引擎跑不起来"被报成"代码有 error"，退出码 1 而非 3。

## 3. 设计

### 3.1 合并方向：出厂文档为 base，真源只提供 config

`src/lib/gate.mjs`：

```js
const GATE_ENTRY = {
  pi: "// pi loads a directory's index.js as the extension entry.\nexport { default } from './pi/index.js';\n",
  dsh: "// dsh mounts a module specifier; index.js stays a valid entry too.\nexport { apply, inject } from './dsh/index.js';\n",
};

function shippedPolicy(kind) { /* read assets/gates/<kind>/policy.json */ }

export function mergePolicy(globalPolicy, base, harnessConfig = {}) {
  const baseConfig = base?.config && typeof base.config === 'object' ? base.config : {};
  const union = [...new Set([
    ...(globalPolicy.config.protected_worktrees ?? []),
    ...(harnessConfig.protected_worktrees ?? []),
    ...(baseConfig.protected_worktrees ?? []),
  ])];
  return {
    ...base,
    config: { ...baseConfig, ...harnessConfig, ...globalPolicy.config, protected_worktrees: union },
  };
}
```

- `globalPolicy` 只贡献 `config`：不再把真源里的文档字段盖到 base 上（真源被历史污染时也能自愈）。
- `base` = 出厂 per-kind 文档；缺失时回退到既有文件，再缺则回退真源（保证任何情况下都有 checks/reminder）。
- `harnessConfig` = 该 harness 现有 `policy.json` 的 config，用于把用户的本地设置提升回真源。

`installGateBundle` 写盘顺序：`copyTree`（跳过 policy.json）→ 备份既有 policy.json → 写合并后的 policy.json → 写 per-kind `index.js` → dsh 额外写 `package.json` → `savePolicy({ config: merged.config })`（**只回写 config**）。

### 3.2 产物完整性

| 产物 | pi | dsh | 其他 kind |
|---|---|---|---|
| `index.js` | `export { default } from './pi/index.js'` | `export { apply, inject } from './dsh/index.js'` | 同 pi（未知 kind 回退） |
| `package.json` | 不写 | `{"type":"module"}` | 不写 |

未知 kind 的 `package.json` 不写，避免往别人的目录里塞无关文件。

### 3.3 引擎级错误分类（`src/gates/quality.mjs`）

在解析出 `diagnostics` 之后、判定 `ok` 之前插入：

```js
const engineErrors = diagnostics.filter((d) => /(^|\/)engine-error$/.test(String(d.rule ?? '')));
if (engineErrors.length > 0) {
  return { gate: 'quality', ok: false, code: 3,
    summary: `无法评分（引擎报错：${engines}）——环境问题，不是代码问题`,
    findings: [], evidence: { hint: engineHint(...), score: data.score, engines } };
}
```

`engineHint` 的层级：

1. 能定位到 aislop 自带的 Python 引擎（`<pkg>/tools/python/<platform>/aislop-python`）且规则是 `ruff/*` → 给出具体路径与 `chmod a-x` 回退命令；
2. 规则是 `ruff/*` 但定位不到 → 给"确认 `which ruff` 或去掉 bundled 引擎可执行位"的通用提示；
3. 其他引擎 → 指向 `aislop doctor`，并说明 oxlint/knip 是 bundled，失败多为二进制与平台不兼容。

新增 `resolveAislopPackageRoot(bin)`（放在 `src/lib/engines.mjs`，与 `resolveAislop` 同一真源）：对 `which('aislop')` 或本地 `node_modules/.bin/aislop` 做 realpath，向上找到含 `tools/python` 的包根；找不到返回 null。`engineHint` 也落在 lib（`quality.mjs` 只 import），避免提示文案又一次分叉。

### 3.4 doctor：引擎可执行性诊断（`src/lib/engines.mjs` + `src/commands/deploy.mjs`）

`checkEngines()` 增加 `pythonEngine` 字段：

```js
{ path, executable, glibc: '2.31', needsNewerGlibc: true }
```

判定：`process.platform === 'linux'` 且 `process.report.getReport().header.glibcVersionRuntime` < 2.34 且 bundled 二进制存在且仍有可执行位。

`doctor` 在引擎节之后打印：

```
▲ AISLOP_PYTHON_ENGINE_UNUSABLE：aislop 自带的 Python 引擎要求 GLIBC ≥ 2.34，本机 2.31
  它会让 ruff 输出为空，quality 闸因此报引擎错误（不是代码问题）
  chmod a-x "<path>"      # 让它回退到 PATH 上的 ruff
```

只报告，不自动改第三方包。可执行位已被去掉时不再报告（说明已回退且生效）。

### 3.5 本仓 Python 脚本 lint

`ruff check --fix skills/dev-host-init/scripts/*.py` 修 5 条（`E401` ×3、`F541` ×2），纯格式，不改逻辑；`--diff` 结果入 TRACEABILITY。

### 3.6 skill 目录按整棵目录求哈希（v2 追加）

复现：`skills/dev-host-init/scripts/*.py` 修完后重跑 `install --yes`，7 个 harness 的技能副本仍是旧脚本（`cmp` 全部 STALE）。

根因：`installSkills` 的跳过判据是 `hashFile(<skill>/SKILL.md)`：一个 skill 除了入口文件还带 `scripts/`、`references/`、模板等，入口没改就永远不重拷。于是“修好了源，分不发出去”——产物完整性缺口。

设计：`src/lib/skills.mjs` 新增 `hashTree(dir)`：递归列出相对路径 + 每文件哈希，按路径排序后 sha256。`installSkills` 用它代替 `hashFile(srcFile)`。

- 只认 `listDir` 给出的普通文件；符号链接等非常规项不展开（避免环），其路径仍参与排序不影响可比性。
- 跳过判据从“哈希一致”扩展为“哈希一致 **且** 目的目录无漂移”。新增 `sourceTreeDrift(srcDir, destDir)` 逐源文件比对（缺失或内容不同即漂移），目的端多出的用户文件不算漂移——否则每次 install 都会报“有变化”。
- 代价：一次安装多读几十 MB 文件头，相对 27 份复制可忽略；省下的是“源改了但用户拿不到”的静默偏差。

## 4. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | 合并方向 + 真源只写 config | `src/lib/gate.mjs` | AC-1、AC-2 |
| M2 | per-kind entry + dsh package.json | `src/lib/gate.mjs` | AC-3 |
| M3 | 引擎级错误分类 + 包根定位 | `src/gates/quality.mjs` | AC-4 |
| M4 | doctor 引擎诊断 | `src/commands/deploy.mjs` | AC-5 |
| M5 | 单测 | `test/gates-harness.test.mjs`、`test/core.test.mjs` | AC-6 |
| M6 | 本仓 Python lint | `skills/dev-host-init/scripts/*.py` | AC-7 |
| M7 | 文档 | `docs/GATES.md`、`docs/HARNESS.md` | AC-8 |
| M8 | 本机真机复验 | 无（运维动作，结果记 TRACEABILITY） | AC-9 |
| M9 | v2 追加：skill 目录整棵哈希 | `src/lib/skills.mjs`、`test/skills.test.mjs` | AC-10 |

## 5. 验收判据

- **AC-1** 对临时 home 执行 `installGateBundle`（pi 与 dsh 各一次，dsh 的 mock 目录放置一份 v5 旧 `policy.json`）：写出的 `policy.json` 的 `version` 分别等于出厂 per-kind 版本，且旧文档的 `reminder` 不残留。
- **AC-2** 同一场景下真源（`gate-policy.json`）只含 `config`；既有 `policy.json` 里手工加的 `protected_worktrees` 被并集提升进真源；再次安装后真源仍只含 `config`（幂等）。
- **AC-3** dsh 目标目录出现 `package.json` 且 `type === 'module'`，`index.js` 指向 `./dsh/index.js`；pi 目标的 `index.js` 指向 `./pi/index.js` 且**不**写 `package.json`。
- **AC-4** 桩 aislop（输出 `scoreable:true` + `rule:'ruff/engine-error'`）时 `runQualityGate` 返回 `code === 3`、`ok === false`，`evidence.hint` 含 `chmod a-x` 或 `aislop doctor`；普通 error 级 finding 仍返回 `code === 1`。
- **AC-5** `checkEngines().pythonEngine` 在 linux 上返回 `{ path, executable, needsNewerGlibc }`；`doctor` 在 `needsNewerGlibc && executable` 时打印 `AISLOP_PYTHON_ENGINE_UNUSABLE` 与该二进制绝对路径。
- **AC-6** `node --test test/*.test.mjs` 全绿；新增用例覆盖 AC-1…AC-4。
- **AC-7** `ruff check skills/dev-host-init/scripts/*.py` 输出 `All checks passed!`。
- **AC-8** `docs/GATES.md` 新增"引擎级错误（engine-error）"一节：与"未安装"、"输出无法解析"的区别与处置；`docs/HARNESS.md` 的 dsh 节写明 per-kind entry 与 `package.json`。
- **AC-9** 本机：`shipgate install --yes` 后 pi/dsh 的 `policy.json` 版本为 6/7、真源只剩 `config`、`shipgate policy` 仍 `bypass`；`shipgate quality .` ≥80 且 0 error；`shipgate doctor` 无新增告警（aislop 已回退）。
- **AC-10**（v2）`hashTree()` 对同一个技能目录：只改 `SKILL.md` 或只改 `scripts/*.py` 都必须得到不同摘要；`installSkills()` 在目的目录的嵌套文件被篡改后会重新复制（`installed` 含该 skill，文件恢复成源内容）；本机 `install --yes` 后 7 个 harness 的 `skills/dev-host-init/scripts/tools-catalog.py` 与源 `cmp` 一致。

## 6. 变更记录

- v2（2026-11-28）：验收时发现“修好源但分发不出去”——`installSkills` 只对 `SKILL.md` 求哈希，技能目录里的 `scripts/`、`references/` 改动永远不会重拷。追加 §3.6、M9、AC-10。
- v3（2026-11-28）：与上游 `CHG-20261128-gates-engine-hint` 合并时对齐结构——引擎探测与提示已抽到 `src/lib/engines.mjs`，本 CHG 的 `resolveAislopPackageRoot` / `engineHint` / `pythonEngine` 探针也落在那里，`quality.mjs` 只 import；字段名 `aislopPython` → `pythonEngine`。

## 7. DoR / DoD

- DoR：PRD 已批准（操作者本会话明确要求根治）；三件套齐；`shipgate spec check` 通过；根因已用真实机器复现并逐条对应。
- DoD：AC-1…AC-9 全绿；TRACEABILITY 逐条填实测；重复 install 幂等；无"以后再做"遗留。
