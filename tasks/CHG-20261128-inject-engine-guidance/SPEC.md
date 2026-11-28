---
change_id: CHG-20261128-inject-engine-guidance
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-engines-onboarding
approved_by: damncheater
approved_at: 2026-11-28
---

# SPEC — 注入文档补引擎用法

## 1. 上下文与既有接口

沿用：`renderBlock()` / `upsertBlock()` / `blockVersion()`（`src/inject/render.mjs`）、模板 `templates/agents-snippet.md`（唯一真源，7 个注入目标共用）、`install` 的注入分支（`src/commands/deploy.mjs`，逐 harness `upsertBlock` + `backupOnce`）。

本 CHG 只改模板内容与区块版本号，注入机制一行不动。

## 2. 模板改动

### 2.1 区块版本 v2 → v3

模板首行 `<!-- shipgate:begin v2 -->` → `v3`。内容变了但版本不动，会让 `shipgate status` 的 `v2` 看起来「已是最新」，也让「这一版注入了什么」无法从文件本身判断。

### 2.2 「引擎」小节重写

替换现有三行（过期 pipx 命令）为：

```md
### 引擎：slop 检测（aislop）与安全审计（cbh）

两者都是闸的依赖，装在 PATH 上一次，所有 harness 的 shell 共用；缺了闸返回退出码 3，`shipgate doctor` 会给出安装命令。

```bash
npm i -g aislop
git clone --depth 1 https://github.com/elementalsouls/Claude-BugHunter ~/.local/src/Claude-BugHunter
python3 -m pip install --user -i https://pypi.org/simple ~/.local/src/Claude-BugHunter   # 无 pipx 走这两步；有 pipx 可 pipx install git+…
aislop doctor && cbh --help    # 自检：aislop 四个引擎应全 ready；cbh 无 --version，看子命令
```

什么时候调谁：

| 目的 | 命令 |
|---|---|
| 判定这次改动能不能提交 | `shipgate quality`（阈值与 error 级判定都在闸里） |
| 看具体哪些行是 slop / 机械修复 | `aislop scan . -d` → `aislop fix` → 结构性大改 `aislop agent` |
| 安全：先确认授权范围 | `shipgate security --scope <scope.md>`（只校验，不发包） |
| 安全：范围内侦察 / 归类 / 验证 | `cbh recon / surface / diff / classify / triage`，方法论按 `shipgate-security` skill |

`cbh` 自带的 82 个 `hunt-*` skill **默认未装**（体积与迭代频率不合，不随 ShipGate 分发）。需要时自行安装：`pwsh scripts/install.ps1 -All`（装进 `~/.claude/skills`，备份落在加载路径之外），再按 `cbh classify` 指到的 skill 名去读。

调试走 `code-debugger` / `debug-ui` skill，纯提示词、不需要额外引擎。
```

### 2.3 硬规则补第 5 条

```md
5. 引擎缺失不是绕过的理由：`shipgate doctor` 给安装命令；不要用「我手动看过了」代替 quality / security 闸。
```

## 3. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | 模板重写 + 版本 v3 | `templates/agents-snippet.md` | AC-1、AC-2 |
| M2 | 单测同步（v3 + 关键内容断言） | `test/inject.test.mjs` | AC-5 |
| M3 | 本机重新注入并核对 7 个目标 | 无（运维动作，结果记 TRACEABILITY） | AC-3、AC-4 |

## 4. 验收判据

- **AC-1** `templates/agents-snippet.md` 含：两步式 cbh 安装（`git clone` + `-i https://pypi.org/simple`）、`aislop doctor && cbh --help` 自检、「什么时候调谁」四行表、`hunt-*` 默认未装说明；且不再以 `pipx install` 作为唯一安装命令。
- **AC-2** `blockVersion(renderBlock({version, min})) === 'v3'`。
- **AC-3** `shipgate install --yes` 后，7 个注入目标（claude / pi / dsh / codex / gemini / cursor / kimi）都含 `hunt-*` 与 `aislop doctor` 两处文本。
- **AC-4** `shipgate status` 的 inject 列为 `v3`（7 个目标；antigravity 无注入路径，保持 `-`）。
- **AC-5** `node --test test/*.test.mjs` 全绿，且 `test/inject.test.mjs` 断言区块版本 `v3` 与「`shipgate quality` / `aislop scan` / `hunt-*`」三处关键内容存在。
- **AC-6** `shipgate spec check` / `quality` 通过（契约与 slop 两闸）。
