# TRACEABILITY — 引擎上线（aislop / cbh 本机可用 + 多 agent 可达）

对应 CHG：`CHG-20261128-engines-onboarding` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261128-skill-root-hygiene`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| G1 | 两个引擎本机真实可用 | §2、§3.1 | M7 | AC-2、AC-8 | `aislop doctor` 全 ready；`cbh --help` 7 子命令；两闸实跑通过 |
| G2 | 安装提示可照抄执行 | §3.1 | M1 | AC-1、AC-2 | 单测两分支 + doctor 输出 |
| G3 | 版本探测不撒谎 | §3.2 | M2 | AC-3 | doctor 显示 `(无版本开关)` |
| G4 | 每个 agent 都拿得到指导 | §3.3 | M3、M7 | AC-4、AC-8 | cursor 27/27；6 个 skills 根 2/2 |
| G5 | 文档与实况一致 | §3.4 | M4、M5 | AC-5、AC-6 | grep 证据 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `src/commands/deploy.mjs`（`checkEngines` / `cbhInstallHint` / `onPath` / `reportEngines`） |
| M2 | `src/lib/exec.mjs`（`version(cmd, null)` 语义） |
| M3 | `src/harness/index.mjs`（cursor skills） |
| M4 | `skills/shipgate-quality/SKILL.md` `skills/shipgate-security/SKILL.md` |
| M5 | `README.md` `docs/GATES.md` `docs/HARNESS.md` |
| M6 | `test/topology.test.mjs` |
| M7 | 无（运维动作，结果记 §3、§4） |

## 3. 验收执行记录（实测填入）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node --test test/topology.test.mjs` | ✅ 用例「checkEngines：无 pipx 给两步式命令，有 pipx 才给 pipx」通过：空 PATH 下 `install` 含 `git clone` 与 `pypi.org/simple`；塞入 `pipx` 桩后变成 `pipx install git+…` | 2026-11-28 |
| AC-2 | `node bin/shipgate.mjs doctor` | ✅ 引擎节：`✔ aislop 0.23.0 C:\Users\…\npm\aislop.CMD`、`✔ cbh (无版本开关) C:\Users\…\Python313\Scripts\cbh.EXE`；`checkEngines()` 已带 `path` / `onPath` 字段（单测断言 `typeof onPath === 'boolean'`） | 2026-11-28 |
| AC-3 | 同上 | ✅ cbh 无 `--version`（`cbh --version` → `error: the following arguments are required: command`）时显示 `(无版本开关)`，不再是空白/`null` | 2026-11-28 |
| AC-4 | `shipgate install --yes` + `shipgate status` | ✅ cursor 行 `skills 27`；`~/.cursor/skills` 目录 28 项（27 个 ShipGate skill + 原有 `shidianguji-fetcher`） | 2026-11-28 |
| AC-5 | grep 两份 skill | ✅ `shipgate-quality` 含 2 处 `aislop doctor` 与失败处置；`shipgate-security` 含 `cbh --help` 自检、两步式安装、`cbh diff`、`cbh scope` | 2026-11-28 |
| AC-6 | grep 文档 | ✅ README 引擎节含 `npm i -g aislop` + 两步式安装（`pypi.org/simple` 命中 1）；`docs/HARNESS.md` 含 cursor skills 路径 4 处 + 引擎共享说明；`docs/GATES.md` 含引擎自检与 code 3 两种含义 | 2026-11-28 |
| AC-7 | `node --test test/*.test.mjs` | ✅ 63/63 通过 | 2026-11-28 |
| AC-8 | 本机实跑 | ✅ `aislop doctor`：Formatting/Linting/Code Quality/AI Slop 全 ready；`cbh --help`：recon/surface/diff/classify/triage/report/scope；`shipgate quality` → `score 86 ≥ 80，无 error`；`shipgate security --scope …` → `exit 0`，evidence 带 `cbh.EXE` 绝对路径；6 个 skills 根 `shipgate-quality`/`shipgate-security` 均 2/2（claude、codex、gemini、cursor、kimi、antigravity；pi/dsh 共用 `~/.agents/skills`） | 2026-11-28 |

## 4. 风险与备注

1. **部署过程记录（可复现）**：
   - `aislop`：`npm i -g aislop` → 0.23.0，bin 在 `%APPDATA%\npm`（已在 PATH）。
   - `cbh`：`git clone --depth 1 https://github.com/elementalsouls/Claude-BugHunter ~/.local/src/Claude-BugHunter` → `python -m pip install --user -i https://pypi.org/simple ~/.local/src/Claude-BugHunter` → `claude-bughunter 2.1.0`，bin 在 `%APPDATA%\Python\Python313\Scripts`（已在 PATH）。
2. **踩到的三个坑（都写进文档了）**：
   - 本机 pip 默认镜像（清华）返回 `from versions: none`，连 `setuptools>=61` 都装不到 → 必须 `-i https://pypi.org/simple`；
   - 没装 pipx，而旧提示只给 `pipx install` → 改为有/无 pipx 两分支；
   - `pip install git+https://…` 在 build isolation 里 checkout 失败（exit 128）→ 改为先 clone 再本地装（顺带得到可 `git pull` 的副本）。
3. **没有任何 `--version` 的引擎不该被当成坏掉**：`version()` 新增 `args = null` 语义，只有 cbh 用它。其他工具行为不变。
4. **cursor 纳入 skills 的证据等级**：本机 `~/.cursor/skills/` 已有用户级 skill、`~/.cursor/skills-cursor/` 有 20 个内置 skill（`create-skill` 等），因此判定 Cursor 已支持 Agent Skills。若未来某版本不读该路径，代价仅是 27 个未被读取的目录，可用 `shipgate install --yes --prune` 清掉，不破坏 Cursor 内置集（内置在 `skills-cursor/`，分发只写 `skills/`）。
5. **cbh 的 82 个 `hunt-*` skill 未分发**：体积与迭代频率都不合（AGENTS.md 明确禁止复制进本仓）。需要时用 cbh 自己的安装器 `pwsh ./scripts/install.ps1 -All`，其备份同样落在加载路径之外（`~/.claude/install-backups/<ts>/`，与本项目 `CHG-20261128-skill-root-hygiene` 的结论一致）。
6. **security 闸红线未变**：仍只做 scope 校验，不代跑探测；`evidence.next` 只是提示。本 CHG 没有给 security 闸加任何自动钩子。
