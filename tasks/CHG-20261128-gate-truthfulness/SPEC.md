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

# SPEC — 闸要说真话

## 1. 上下文

沿用：`runSpecGate`（`src/gates/spec.mjs`）、`runShipGate`（`src/gates/ship.mjs`）、`blockVersion` / `renderBlock` / `templatePath`（`src/inject/render.mjs`）、`doctor` / `status` / `reportMissing` / `targets`（`src/commands/deploy.mjs`）。

## 2. 设计

### 2.1 `spec check <dir>` 接受仓库根（#5）

`src/gates/spec.mjs`：把"收集变更目录"抽成函数，并加一层下探。

```js
function changeDirsIn(base) {
  if (exists(path.join(base, 'SPEC.md'))) return [{ name: path.basename(base), path: base }];
  return listDir(base)
    .filter((e) => e.isDirectory() && /^CHG-/.test(e.name))
    .map((e) => ({ name: e.name, path: path.join(base, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function runSpecGate({ cwd = process.cwd(), dir = 'tasks' } = {}) {
  const requested = path.resolve(cwd, dir);
  // `spec check <repo-root>` is what people type; contracts live in <root>/tasks.
  const base = changeDirsIn(requested).length > 0 ? requested : path.join(requested, 'tasks');
  const changeDirs = changeDirsIn(base);
  ...
}
```

- 只下探一层，不递归搜索。
- 下探后仍为空 → 报错信息里的路径用 `requested`（用户实际传的），避免"报了个他没输入的路径"。

### 2.2 注入区块版本参与校验（#3）

`src/inject/render.mjs` 新增：

```js
/** The block version this release ships (parsed from the template, single source). */
export function expectedBlockVersion() {
  return blockVersion(readText(templatePath()));
}
```

`src/gates/ship.mjs`：

```js
const found = blockVersion(readText(harness.injectPath));
const expected = expectedBlockVersion();
if (!found) {
  findings.push({ ...message: `注入文件没有 shipgate 区块：${path}` });
} else if (found !== expected) {
  findings.push({ ...message: `注入区块是 ${found}，当前版本是 ${expected} —— 重跑 shipgate install` });
}
```

### 2.3 产物漂移必须能失败（#1）

`src/commands/deploy.mjs`：

- `doctor`：`return ship.ok ? 0 : 1;`（原来是 `return 0`）。
- `status`：新增 `--strict`；未给时不额外跑校验（保持只读视图语义），给了则跑 `runShipGate`，不一致打印并 `return 1`。`status` 与 `doctor` 复用同一段 managed 选取逻辑。

`docs/GATES.md` 更新 ship 闸那一行：`shipgate status --strict` / `shipgate doctor`（会因漂移失败）。

### 2.4 未探测 harness 的文案（#6）

`reportMissing()`：

```
${label}（${id}）未检测到：${path}
  已按显式指定预装；不想预装就不要把它写进 --harness
```

保持行为不变（显式 `--harness` 时仍预装），只把"跳过"这个与事实相反的词去掉。

## 3. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | spec 目录下探 | `src/gates/spec.mjs` | AC-1 |
| M2 | 注入版本校验 | `src/inject/render.mjs`、`src/gates/ship.mjs` | AC-2 |
| M3 | doctor / status --strict 退出码 | `src/commands/deploy.mjs` | AC-3、AC-4 |
| M4 | 文案 | `src/commands/deploy.mjs` | AC-5 |
| M5 | 文档 + 单测 | `docs/GATES.md`、`test/*.test.mjs` | AC-6 |

## 4. 验收判据

- **AC-1** 临时仓库 `<root>/tasks/CHG-X/{PRD,SPEC,TRACEABILITY}.md`：`runSpecGate({cwd: root, dir: '.'})` 与 `runSpecGate({cwd: root})` 均识别到 1 个变更；空仓库传根仍返回 `code 1`。
- **AC-2** 临时 harness 的注入文件写 `<!-- shipgate:begin v2 -->` 时 `runShipGate` 产生"区块版本"finding；写模板版本时无该 finding。
- **AC-3** `doctor` 在有 error 级 finding 时退出码 1。
- **AC-4** `status --strict` 在漂移时退出码 1；默认 `status` 仍 0。
- **AC-5** `install --harness <未探测> --dry-run` 的输出出现「按显式指定预装」。
- **AC-6** `node --test test/*.test.mjs` 全绿；`spec check` / `quality .` / `migrate-skillpack --check` 通过。

## 5. 变更记录

- v1（2026-11-28）：首版，对应 Linux 端审计 #1/#3/#5/#6。

## 6. DoR / DoD

- DoR：审计清单已逐条在本机复现；三件套齐。
- DoD：AC-1…AC-6 全绿；TRACEABILITY 填实测；一次提交只含本 CHG。
