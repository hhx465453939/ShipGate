---
change_id: CHG-20261128-engines-onboarding
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-skill-root-hygiene
approved_by: damncheater
approved_at: 2026-11-28
---

# SPEC — 引擎上线（aislop / cbh 本机可用 + 多 agent 可达）

## 1. 上下文与既有接口

沿用：`checkEngines()`（`src/commands/deploy.mjs`）、`resolveAislop()`（`src/gates/quality.mjs`）、`runSecurityGate()`（`src/gates/security.mjs`）、`which()` / `version()`（`src/lib/exec.mjs`）、`BUILTIN` harness 矩阵（`src/harness/index.mjs`）、27 个 skill 的 `install --yes` 分发链路。

本 CHG 只改四件事：**安装提示可执行**、**版本探测不撒谎**、**cursor 纳入 skills**、**指导文档与实况对齐**。闸判定逻辑一行不动。

## 2. 实测基线（2026-11-28）

```
aislop   0.23.0   C:\Users\<user>\AppData\Roaming\npm\aislop.CMD        （npm i -g，已在 PATH）
         aislop doctor → Formatting/Linting/Code Quality/AI Slop 全 ready
cbh      （改前缺失）→ 现装 claude-bughunter 2.1.0
         C:\Users\<user>\AppData\Roaming\Python\Python313\Scripts\cbh.EXE （pip --user，已在 PATH）
         cbh --help → recon / surface / diff / classify / triage / report / scope
         无 --version 开关（argparse 直接把 --version 当未知选项）
python   3.13.5（Miniconda），pip 默认索引 = 清华镜像（本机返回空版本表）
pipx     × 未安装
```

## 3. 设计

### 3.1 安装提示必须本机可执行

`checkEngines()` 的 `cbhInstall` 改为两级：

1. 有 `pipx` → `pipx install git+https://github.com/elementalsouls/Claude-BugHunter`（隔离 venv，首选）。
2. 没有 `pipx` → 两步式（避开 build isolation 的 checkout 失败，也避开默认镜像）：
   - `git clone --depth 1 https://github.com/elementalsouls/Claude-BugHunter ~/.local/src/Claude-BugHunter`
   - `python -m pip install --user -i https://pypi.org/simple ~/.local/src/Claude-BugHunter`
3. 连 `python` 都没有 → 只提示先装 Python 3.9+，不再编造 `python3 -m pip` 之外的假命令。

同时 `checkEngines()` 输出新增 `path` 与 `onPath` 字段（bin 所在目录是否在 `PATH`），供 doctor 判断「装了但别的 agent 调不到」这种半吊子状态。

### 3.2 版本探测不撒谎

- `src/lib/exec.mjs`：`version()` 增加 `probe` 参数（默认 `['--version']`）；探测失败返回 `null`（不变）。
- `checkEngines()` 对 cbh 显式传 `probe: null` 语义 → doctor 显示 `(无版本开关)`，而不是空白让人以为解析坏了。
- 文档写明：cbh 版本用 `pip show claude-bughunter` 或 `pip list | grep claude-bughunter` 查。

### 3.3 cursor 纳入 skills 分发

`src/harness/index.mjs`：

```js
{
  id: 'cursor',
  label: 'Cursor',
  detect: '~/.cursor',
  skills: '~/.cursor/skills',     // 用户级 skills 根；内置 skill 在 ~/.cursor/skills-cursor/
  commands: null,
  agents: null,
  inject: '~/.cursor/rules/shipgate.mdc',
  gate: null,
}
```

依据（本机实测）：`~/.cursor/skills/shidianguji-fetcher/SKILL.md` 为用户级 skill；`~/.cursor/skills-cursor/` 下 20 个内置 skill（`create-skill`、`create-rule`、`loop`、`babysit` …）说明 Cursor 的 Agent Skills 已落地。因此 `skills: null` 是过期声明，27 个闸/full-dev skill 应一并分发。

### 3.4 指导文档与实况对齐

| 文件 | 改动 |
|---|---|
| `skills/shipgate-quality/SKILL.md` | 新增「引擎自检」：`which aislop` → `aislop --version` → `aislop doctor`；失败处置（未装 / `npm i -g aislop`）；说明引擎共享、skill 按 harness 分发 |
| `skills/shipgate-security/SKILL.md` | 新增「引擎自检」：`which cbh` → `cbh --help`（列 7 个子命令，无 `--version`）→ 安装两步式命令；保留 `cbh scope` 与 `cbh diff`（原文档漏了两个真实子命令） |
| `README.md` | 引擎安装节：`npm i -g aislop` + 两步式 cbh（pipx 可选），标注 pip 默认镜像失败时的 `-i https://pypi.org/simple` |
| `docs/GATES.md` | 补充「引擎自检」小节与 code 3 的两种含义（未装 / 装了但跑不起来） |
| `docs/HARNESS.md` | cursor 行改为「skills + rules 注入」；新增「引擎是共享的、指导是按 harness 分发的」一段 |

## 4. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | 安装提示两级化 + 路径字段 | `src/commands/deploy.mjs` | AC-1、AC-2 |
| M2 | 版本探测显式化 | `src/lib/exec.mjs`、`src/commands/deploy.mjs` | AC-3 |
| M3 | cursor 纳入 skills | `src/harness/index.mjs` | AC-4 |
| M4 | 两份 skill 的引擎自检 + 缺失子命令 | `skills/shipgate-quality/SKILL.md`、`skills/shipgate-security/SKILL.md` | AC-5 |
| M5 | 文档对齐 | `README.md`、`docs/GATES.md`、`docs/HARNESS.md` | AC-6 |
| M6 | 测试 | `test/core.test.mjs`、`test/gates-harness.test.mjs` | AC-7 |
| M7 | 本机部署与验证 | 无（运维动作，结果记 TRACEABILITY） | AC-8 |

## 5. 验收判据

- **AC-1** `checkEngines()` 在无 pipx 时给出的 `cbh.install` 同时含 `git clone` 与 `-i https://pypi.org/simple`；有 pipx 时给 `pipx install`。用桩 `PATH` 跑单测断言两种分支。
- **AC-2** `shipgate doctor` 的引擎节对已装引擎打印真实绝对路径与版本，并标注 bin 目录是否在 `PATH`。
- **AC-3** cbh 装了但 `--version` 不支持时，doctor 显示 `(无版本开关)`（不是空白、不是 `null`）；aislop 仍显示 `0.23.0`。
- **AC-4** `shipgate install --yes` 后 `~/.cursor/skills/` 出现 27 个 skill（含 `shipgate-quality`、`shipgate-security`）；`shipgate status` 的 cursor 行 skills = 27。
- **AC-5** `shipgate-quality` skill 里有 `aislop doctor` 与失败处置；`shipgate-security` skill 里有 `cbh --help` 自检、两步式安装命令、且子命令清单含 `scope` 与 `diff`。
- **AC-6** README 引擎节给的是本机验证过的命令（`npm i -g aislop` + 两步式 pip 安装）；`docs/GATES.md` 有引擎自检；`docs/HARNESS.md` 的 cursor 行声明 skills 路径与依据。
- **AC-7** `node --test test/*.test.mjs` 全绿（新增：安装提示分支、cursor 矩阵含 skills）。
- **AC-8** 本机：`aislop doctor` 全 ready；`cbh --help` 列出 7 子命令；`shipgate quality` 出分（≥80）；`shipgate security --scope <file>` 退出码 0 且 evidence 带 cbh 绝对路径；9 个 harness 的 skills 目录都有两份闸 skill。

## 6. DoR / DoD

- DoR：PRD 批准；`CHG-20261128-skill-root-hygiene` 已交付（`.cmd` 垫片修复是 quality 闸可跑的前提）；三件套齐；`spec check` 通过。
- DoD：AC-1…AC-8 全绿；TRACEABILITY 逐条实测；两份 skill 在 9 个 harness 到位；`quality` / `security` 两闸在本机真实跑通。
