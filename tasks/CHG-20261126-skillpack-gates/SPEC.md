---
change_id: CHG-20261126-skillpack-gates
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261126-shipgate-bootstrap
approved_by: damncheater
approved_at: 2026-11-26
---

# SPEC — ShipGate v0.2（技能包 + 硬门控 + 引导部署）

## 1. 上下文

v0.1 已交付：CLI 骨架、四道闸判据、托管区块注入、5 个 `shipgate-*` skill、pi 的 vendored gate 产物、manifest、adopt/revoke/rollback、更新检查。本 CHG 在其上补齐实体，不推翻已有接口（`Verdict`、退出码、幂等约定沿用）。

实测环境（2026-11-26）：node v24.22.1；harness 目录 `~/.claude`(skills/commands/agents 齐全) / `~/.pi` / `~/.codex` / `~/.gemini` / `~/.cursor`；aislop 0.23.0 全局已装；cbh 未装；CPU 无 AVX2 → oxlint SIGILL。

来源仓库（只读）：
- 技能包：`/mnt/500G-1/Development/Claude_skill_pool/package/full-dev-脚手架/.claude/`
- 硬门控：`/mnt/500G-1/Development/agent-config-bridge/bridge/gates/`

## 2. 技能包结构与分发模型

### 2.1 统一后的仓库结构

```
skills/                     27 个，一律 skills/<name>/SKILL.md
├── shipgate/               ┐
├── shipgate-spec/          │ v0.1 已有 5 个闸用法 skill
├── shipgate-quality/       │
├── shipgate-security/      │
├── shipgate-install/       ┘
├── ai-spec/                ┐
├── prd/                    │
├── intent-grill/           │
├── goal-driven-development/│
├── code-review/            │ 22 个 full-dev skill
├── code-debugger/          │ （19 个单文件转目录 + 3 个原目录）
├── ...                     │
└── ralph-yolo/             ┘
commands/                   22 个 slash command（源 .claude/commands/*.md 原样）
agents/                     2 个 subagent（context-builder / debug-executor）
references/                 ADR-FORMAT / CONTEXT-FORMAT / mcp-config-template（随 skill 引用）
templates/                  dev-profile.schema.json / prd.json.example / rule.json.example
```

迁移规则：
- 单文件 `skills/foo.md` → `skills/foo/SKILL.md`（内容不变，frontmatter 已合规）。
- 目录形态的 `dev-host-init/` `discover-skill-opportunities/` `security-audit/` 整目录复制（含 `scripts/`、`templates/`、`references/`）。
- 不迁 `_archived/`。
- 每个 skill 的 `SKILL.md` 首部 frontmatter 必须含 `name` 与 `description`（分发到 Claude Code / pi 才会被识别）——迁移后逐个体检，缺失的补。

### 2.2 harness 能力矩阵（决定装什么）

| harness | skills | commands | agents | inject | gate |
|---|---|---|---|---|---|
| claude | `~/.claude/skills` | `~/.claude/commands` | `~/.claude/agents` | `~/.claude/CLAUDE.md` | —（软约束：hook 可选） |
| pi | `~/.agents/skills` | — | — | `~/.pi/agent/APPEND_SYSTEM.md` | `~/.pi/agent/extensions/enforce-rules` |
| codex | `~/.codex/skills` | — | — | `~/.codex/AGENTS.md` | — |
| gemini | `~/.gemini/skills` | — | — | `~/.gemini/GEMINI.md` | — |
| cursor | — | — | — | `~/.cursor/rules/shipgate.mdc` | — |
| 自定义（dsh 等） | config `skills` | config `commands` | config `agents` | config `inject` | config `gate` |

能力缺失不是缺陷：harness 没有对应目录就跳过，并在输出里说明（不静默）。

## 3. 硬门控资产与 policy

### 3.1 资产（vendored 自 bridge，ShipGate 自己拥有维护责任）

```
assets/gates/
├── classifier.js           命令分类
├── policy.js               策略引擎（拦截判定 / 破坏性命令分级）
├── pi/index.js             pi 适配（enforceRules / policy 加载）
├── pi/extensions/          auto-continue.ts / goal-mode.ts（编译产物由 bridge 导出）
├── pi/policy.json          默认策略
├── dsh/index.js            dsh 适配
└── dsh/policy.json         默认策略
```

`assets/pi-gate/` 目录废止，内容迁入 `assets/gates/`（保留 profiles）。

### 3.2 policy 由 ShipGate 管理（新增命令）

```bash
shipgate policy                       # 打印当前 policy + 受保护工作区
shipgate policy --add-protected <dir> # 加入受保护工作区（幂等）
shipgate policy --rm-protected <dir>
shipgate policy --mode enforce|bypass
shipgate policy --sync                # 把全局 policy 同步到所有已装 gate 的 harness
```

单一真源：`~/.config/shipgate/gate-policy.json`。写入后：
- 已装 gate 的 harness：`<gateDest>/policy.json` 的 `config` 段被更新（保留文件内其他段）；
- 未装 gate 的 harness：只记全局，不创建目录。

首次 install 时若目标已有 `policy.json`，**合并而非覆盖**：`config.protected_worktrees` 取并集，`destructive_mode` 以全局为准。

### 3.3 硬门控的诚实边界

- pi / dsh：真拦截（命令级 + 跳层直读 + 破坏性确认）。
- claude / codex / gemini：**没有进程级拦截能力**，ShipGate 只给 skills + 注入区块 + `shipgate quality` 可验证的闸。文档与注入区块必须写明"这两个 harness 是软约束"，不许含糊。

## 4. 交互式安装（`install --ask`）

用 `node:readline/promises`，零依赖。

```
$ shipgate install --ask
ShipGate 0.2.0 · 探测到 5 个 agent

  1) Claude Code   ~/.claude        skills ✓  commands ✓  agents ✓   注入 CLAUDE.md
  2) pi agent      ~/.pi            skills ✓  commands -  agents -   硬门控 ✓
  3) Codex CLI     ~/.codex         skills ✓  commands -  agents -
  4) Gemini CLI    ~/.gemini        skills ✓  commands -  agents -
  5) Cursor        ~/.cursor        仅注入 .mdc

? 要装哪些？(a=全部 / 1,2,3 / 回车=全部 / q=退出) > 1,2
? 确认写入以上 2 个 agent 的全局目录？(Y/n) > y
```

规则：
- 非 TTY（CI / agent 无终端）时 `--ask` 自动退化为 `--yes`（全部已探测的），并打印一行说明，**不许挂起**。
- `--yes` 等价于"全部已探测 harness + 不询问"。
- 任何交互都必须先展示将写哪些文件（与 `--dry-run` 同一份计划），再确认。

## 5. 分发与包名

- `package.json` `name` → `shipgate-cli`；`bin.shipgate` 不变（安装后命令仍是 `shipgate`）。
- `src/lib/update.mjs` 的 registry 改为 `https://registry.npmjs.org/shipgate-cli/latest`。
- 所有提示用户安装的命令改为 `npm i -g shipgate-cli`。
- 自更新命令改为 `npm i -g shipgate-cli@latest`。
- 发布用 `npm publish --access public`（需主人已 `npm login`）。

## 6. README 的引导入口（硬要求）

首屏 20 行内必须出现：

```text
把下面这段丢给你的编码 agent：

  读 https://github.com/hhx465453939/ShipGate ，按 README 的「一键部署」给我的机器装好
  ShipGate（skills + 硬门控 + 注入），装完把每一步的选择告诉我。
```

以及 agent 执行时用的确切命令：

```bash
npx shipgate-cli install --ask
```

## 7. 里程碑

| M | 内容 | 交付物 | 验收 |
|---|---|---|---|
| M1 | 技能包迁移 | `skills/**`（27）、`commands/**`（22）、`agents/**`（2）、`references/**`、`templates/**`；`scripts/migrate-skillpack.mjs`（一次性的迁移与 frontmatter 体检） | AC-1、AC-2 |
| M2 | harness 能力扩展 | `src/harness/index.mjs`（commands/agents 字段）、`src/lib/skills.mjs`（installCommands/installAgents） | AC-3 |
| M3 | 硬门控资产与 policy | `assets/gates/**`、`src/lib/gate.mjs`、`src/commands/policy.mjs`、`src/gates/hardgate.mjs` | AC-4、AC-5 |
| M4 | 交互式安装 | `src/commands/ask.mjs`、`install --ask/--yes` | AC-6 |
| M5 | 包名与更新通路 | `package.json`、`src/lib/update.mjs`、提示文案 | AC-7 |
| M6 | README 与注入区块重写 | `README.md`、`templates/agents-snippet.md`、`docs/*`、`skills/shipgate*/**` 文案 | AC-8 |
| M7 | 测试与验收 | `test/*.test.mjs` 新增，TRACEABILITY 填实测 | AC-9、AC-10 |

## 8. 验收判据（可执行）

- **AC-1** `skills/` 下有 27 个目录且每个含 `SKILL.md`；`node scripts/migrate-skillpack.mjs --check` 退出码 0（frontmatter 齐全）。
- **AC-2** `dev-host-init/scripts`、`discover-skill-opportunities/**`、`security-audit/references` 三处子目录文件数与源一致。
- **AC-3** `install --harness claude` 后 `~/.claude/skills` 有 27 个 shipgate 管理的 skill，`~/.claude/commands` 有 22 个，`~/.claude/agents` 有 2 个，manifest 记录对应条目。
- **AC-4** `install --harness pi` 后 `~/.pi/agent/extensions/enforce-rules/` 含 `policy.js` / `classifier.js` / `pi/index.js` / `dsh/index.js`，hash 与 `assets/gates/` 一致。
- **AC-5** `shipgate policy --add-protected /tmp/x` 后：全局 `gate-policy.json` 含该路径，且 pi 的 `policy.json` 同步含该路径；`--rm-protected` 可移除。
- **AC-6** 管道非 TTY 下 `shipgate install --ask </dev/null` 不挂起、退出码 0、输出含"非交互环境"字样；TTY 下出现编号选项。
- **AC-7** `package.json.name === "shipgate-cli"`；`shipgate update --check` 请求 `registry.npmjs.org/shipgate-cli/latest`；`npm i -g shipgate-cli` 后 `shipgate --version` 输出 0.2.0。
- **AC-8** `README.md` 首 40 行内含"丢给你的编码 agent"引导段与仓库链接；`templates/agents-snippet.md` 明确写出 claude/codex 是软约束、pi/dsh 是硬拦截。
- **AC-9** `node --test test/*.test.mjs` 全绿（新增用例覆盖：技能包清单、policy 合并、ask 非交互、harness 能力矩阵）。
- **AC-10** 连续两次 `install --harness pi`：注入区块字节一致、policy 不重复追加、skills hash 不变。

## 9. DoR / DoD

- DoR：PRD 已批准；本 SPEC 三件套齐；源仓库路径可读；无未决架构分歧。
- DoD：AC-1…AC-10 全绿；`npm publish` 成功（若 npm 凭据可用）；TRACEABILITY 逐条填实测；README/docs 与实现一致；无"后续再做"遗留。
