---
change_id: CHG-20261126-shipgate-bootstrap
version: 2
status: approved
prd_ref: PRD.md
supersedes: null
approved_by: damncheater
approved_at: 2026-11-26
---

# SPEC — ShipGate v0.1（闸链 + 跨 harness 引导部署）

## 1. 上下文与约束

- 目标机器为低配老机（2 核 4 线程 / 8 GiB），日常运维铁律：一切轻量。→ 运行时**零依赖**，启动 < 200ms，不常驻进程。
- **v2 范围扩展（主人 2026-11-26 追加）**：ShipGate 接管 `agent-config-bridge` 的**硬门控产物**与**全局注入权威源管理**，bridge 转入冻结/退役。理由是继续维护 bridge 属冗余——ShipGate 本身就要覆盖多 harness 的全局效能。
- **安装形态**：全局固定安装优先（`npm i -g shipgate` + 引擎全局装），`npx` 仅作最后兜底且必须告警；必须内置**更新检查 + 自更新**通路。
- **参考部署**：本机（开发主机）的部署形态即产品的标准形态——`install` 的产物清单以本机实测为基准。
- 已有 harness 实测目录（2026-11-26 现场核对）：

| harness | skills 目录 | 注入文件 | 现状 |
|---|---|---|---|
| claude | `~/.claude/skills/` | `~/.claude/CLAUDE.md` | 76 skills / 479 行 |
| pi | `~/.agents/skills/` | `~/.pi/agent/APPEND_SYSTEM.md` | 76 skills / 19 行 |
| codex | `~/.codex/skills/` | `~/.codex/AGENTS.md` | 64 skills / 387 行 |
| gemini | `~/.gemini/skills/` | `~/.gemini/GEMINI.md` | 64 skills / 335 行 |
| cursor | `~/.cursor/rules/` | `~/.cursor/rules/shipgate.mdc` | 2 rules / 无 |

- 注入文件全部是**主人长期手写**的大文件。→ 禁止整体覆写，只允许托管区块（§4.2）。

## 2. 架构

```
用户/agent ──► shipgate CLI (bin/shipgate.mjs)
                  │
      ┌───────────┼────────────┬───────────────┐
      ▼           ▼            ▼               ▼
  gates/*     harness/*    inject/*        lib/*（零依赖）
  spec        claude       renderer        fsx / log / probe / exec / cfg
  quality ──► aislop       pi
  security ─► cbh          codex
  ship        gemini
              cursor
```

三层职责，不许越界：

1. **闸层 `src/gates/`**：判断"过不过"，返回统一 `Verdict`，不负责安装、不负责写文件。
2. **适配层 `src/harness/`**：知道"某个 harness 的 skills 目录和注入文件在哪、怎么装"，不判断质量。
3. **渲染层 `src/inject/`**：把闸清单渲染成 agent 可读的托管区块，幂等写入。

### 2.2 每个 harness 的产物清单（profile）

这是 v2 的核心抽象：`harness profile = { skills, injectDocs, gates }`，`install` 就是「把这份清单反向装回去」。

| harness | skills | 注入文档 | 硬门控产物 |
|---|---|---|---|
| `pi` | `~/.agents/skills/` | `~/.pi/agent/APPEND_SYSTEM.md`（区块） | `~/.pi/agent/extensions/enforce-rules/`（index.js + pi/index.js + classifier.js + policy.js + policy.json + profiles/） |
| `dsh` | 由 config 指定 | 由 config 指定 | 与 pi 同构（复用同一份 assets，落点由 config 指定） |
| `claude` | `~/.claude/skills/` | `~/.claude/CLAUDE.md`（区块） | 无（成熟 harness，靠 skill + 注入文档约束） |
| `codex` | `~/.codex/skills/` | `~/.codex/AGENTS.md`（区块） | 无 |
| `gemini` | `~/.gemini/skills/` | `~/.gemini/GEMINI.md`（区块） | 无 |
| `cursor` | 不装 skill（cursor 无 skills 目录） | `~/.cursor/rules/shipgate.mdc`（区块） | 无 |
| 任意插件型 agent | config 里 `skillsDir` | config 里 `injectFile` | config 里 `gateAssets`（可选） |

硬门控产物以 `assets/pi-gate/` 形式随包分发（源：bridge 的 `gates/pi` + `gates/policy.js` + `gates/classifier.js` + `gates/profiles/*` 的部署形态，取自本机 `~/.pi/agent/extensions/enforce-rules/`）。升级方式：bridge 侧变更后重新导出覆盖 `assets/pi-gate/`，并在 CHANGELOG 记录来源 hash。

### 2.1 目录

```
bin/shipgate.mjs            CLI 入口（解析 argv + 分发）
src/cli.mjs                 命令注册表
src/commands/               每命令一个文件，只做 IO 编排
src/gates/                  spec / quality / security / ship
src/harness/                index + 每 harness 一个 adapter
src/inject/render.mjs       注入区块渲染
src/lib/                    fsx / exec / log / probe / cfg
skills/                     随包分发的 skill 源（安装时复制到各 harness）
templates/agents-snippet.md 注入区块模板（含占位符）
docs/                       ARCHITECTURE / GATES / HARNESS
test/                       node:test，无外部测试框架
```

## 3. 对外接口（CLI 契约）

退出码统一：`0` 通过 / `1` 不通过（闸拦下）/ `2` 用法错误 / `3` 环境缺失（引擎未装等）。

| 命令 | 语义 | 关键参数 |
|---|---|---|
| `shipgate doctor` | 体检：node 版本、harness 探测、引擎可用性、注入区块状态 | `--json` |
| `shipgate install` | 引导部署：探测 → 装 skills → 检查/提示引擎 → 渲染注入 | `--harness <id,id\|all>` `--dry-run` `--yes` `--prune` |
| `shipgate inject` | 只重渲染注入区块 | `--harness <id\|all>` `--dry-run` |
| `shipgate gates` | 列出四道闸 + 每道闸的当前状态与引擎命令 | `--json` |
| `shipgate spec check [dir]` | spec 闸：校验 `tasks/CHG-*/` 三件套 | `--json` |
| `shipgate quality [dir]` | quality 闸：委派 `aislop scan --json`，按阈值判定 | `--min <score>` `--json` |
| `shipgate security [dir]` | security 闸：委派 `cbh`，**必须** `--scope <file>` 或已有 engagement | `--scope` `--dry-run` |
| `shipgate status` | 每 harness 已装 skills 数、注入区块时间戳、版本 | `--json` |
| `shipgate update` | 检查 npm 最新版 → 全局自更新 → 重装 skills → 重渲染注入 | `--check`（只查） `--yes` |
| `shipgate adopt <harness>` | 把某 harness 纳入 ShipGate 受管（写入受管清单，改动前备份） | `--yes` |
| `shipgate revoke <harness>` | 撤回受管：restore 备份，移除 manifest 记录 | `--yes` |
| `shipgate rollback <harness>` | 用最近一次备份恢复（不删 manifest） | `--yes` |

`Verdict` 统一结构：`{ gate, ok, code, summary, findings[], evidence }`。

## 4. 数据与写入

### 4.1 配置

- 全局：`~/.config/shipgate/config.json` — `{ version, harnesses: ["claude","pi"], engines: { aislop: "auto", cbh: "auto" }, quality: { min: 80 } }`
- 项目：`<repo>/.shipgate/config.json` — `{ harnesses?, quality: { min }, spec: { dir: "tasks" }, security: { scope: "..." } }`
- 项目配置覆盖全局；缺失时用内置默认值，不报错。

### 4.2 注入 = 托管区块（幂等硬要求）

模板 `templates/agents-snippet.md` 首尾必须是标记：

```
<!-- shipgate:begin v1 -->
...渲染内容...
<!-- shipgate:end -->
```

规则：
- 目标文件不存在 → 创建，写入区块。
- 目标文件存在且已有区块 → 只替换区块内内容。
- 目标文件存在但无区块 → 追加到文件末尾（前置一个空行），**不改动任何既有行**。
- 区块前后各有一次备份 `*.shipgate-bak.<时间戳>`（每天最多一次，避免刷屏）。
- 任何情况下不得删除用户内容；`--prune` 仅删除 ShipGate 自己装的 skill 目录。

### 4.3 skill 分发

`skills/<name>/SKILL.md` → `<harness skills dir>/<name>/SKILL.md`。安装写入 `.shipgate-manifest.json`（记录 name/version/hash/installedAt），用于幂等与 `status`/`--prune`。

### 4.4 引擎安装与更新（全局固定安装）

| 引擎 | 安装命令 | 说明 |
|---|---|---|
| aislop | `npm i -g aislop` | 全局固定；`npx` 只在显式 `--allow-npx` 时兜底，且必须先告警“临时安装易失败” |
| cbh | `pipx install git+https://github.com/elementalsouls/Claude-BugHunter` | 全局固定；缺失时 `security` 闸只打印命令，不自动装 |

`install` 检测到任一引擎缺失时：打印安装命令 + 退出码 0（安装用于部署，不因引擎缺失而失败），但 `doctor` 必须把它标成缺口。

### 4.5 更新通路

- 每次 CLI 启动，**每天最多一次**（`~/.cache/shipgate/last-update-check` 记日期）向 npm registry 查 `shipgate` 最新版；有新版则输出一行提示，不自动装。
- `shipgate update --check` 只查；`shipgate update` 执行 `npm i -g shipgate@latest` → 重装 skills → 重渲染注入区块（幂等）。
- **自动更新**：`update.autoUpdate: true` 时，`install` / `inject` 结束后若检测到新版，直接执行自更新并重装一次；失败只告警不中断当前流程。

## 5. 四道闸的实现

| 闸 | 实现 | 通过判据 |
|---|---|---|
| spec | 内置校验：`tasks/CHG-*/` 至少一个目录含 `PRD.md`+`SPEC.md`+`TRACEABILITY.md`；SPEC frontmatter `status` 非 `draft`；正文含"验收"或 `AC-` 条目 | 三件齐全 + status 非 draft + 有验收判据 |
| quality | 探测 `aislop`：本地 `node_modules/.bin` → 全局 → `npx aislop@latest`；解析 `--json` 的 score | `score >= min`（默认 80）且无 error 级 finding |
| security | 探测 `cbh`（`pipx`/`PATH`）；无 `--scope` 且无 engagement 文件时**拒绝执行**（退出码 2）并打印取证命令 | 由 cbh 自身结论决定；ShipGate 只做前置安全检查 + 结果转 `Verdict` |
| ship | 校验每 harness：skill 目录存在、manifest hash 与源一致、注入区块存在且版本匹配 | 全部一致 |

## 6. 安全边界（红线，写进代码与文档）

1. **security gate 永不自动执行**：不注册 hook、不在 `install` 里自动跑、无 scope 直接拒绝。原因：主动探测类工具自动跑 = 越界风险。
2. **不写凭据**：ShipGate 只写路径与开关，任何 token/key 一律不落盘。
3. **不碰受保护工作区**：不执行任何 `git stash/reset/clean/checkout --` 类命令；`--prune` 只删自己的 manifest 里记录且 hash 匹配的目录。
4. **注入只增不改**：见 §4.2。

## 7. 里程碑（依赖顺序）

| M | 内容 | 交付物 | 验收 |
|---|---|---|---|
| M1 | 骨架 + CLI 分发 + lib | `bin/` `src/cli.mjs` `src/lib/*` | `shipgate --help` / `shipgate gates` 可跑 |
| M2 | spec 闸 | `src/gates/spec.mjs` | 对空仓库返回不通过(1)；对成立契约返回通过(0) |
| M3 | harness 适配 + 注入 | `src/harness/*` `src/inject/render.mjs` | `install --dry-run` 列出将写文件；真跑后注入区块幂等（跑两次内容一致） |
| M4 | quality / security 闸委派 | `src/gates/quality.mjs` `security.mjs` | 引擎缺失时退出码 3 且给出安装命令；security 无 scope 拒绝 |
| M5 | skills 五件 + 文档 + 测试 | `skills/*` `docs/*` `test/*` | `node --test` 全绿；README 能指导新人完成安装 |

## 8. 验收判据（可执行）

- **AC-1** `node bin/shipgate.mjs gates` 输出四道闸，退出码 0。
- **AC-2** 在无契约目录跑 `spec check` → 退出码 1，输出缺哪件。
- **AC-3** 在 `tasks/CHG-20261126-shipgate-bootstrap/` 上跑 `spec check` → 退出码 0。
- **AC-4** `install --dry-run --harness claude` 列出 skills 目标路径与注入文件，且**不写盘**（mtime 不变）。
- **AC-5** `install --harness claude` 连跑两次，`~/.claude/CLAUDE.md` 中 shipgate 区块内容完全一致（幂等），且区块外的行数不变。
- **AC-6** `quality` 在 aislop 不可用时返回 3 并打印 `npm i -g aislop`；`security` 无 `--scope` 返回 2。
- **AC-7** `status --json` 能列出每个探测到的 harness 的 skills 数与注入区块版本。
- **AC-8** `node --test test/` 全绿；`shipgate install` 后 `skills/shipgate*/` 已复制到目标 harness 且 manifest 有记录。
- **AC-9** `install --harness pi` 在 `~/.pi/agent/extensions/enforce-rules/` 落齐硬门控产物（index.js / pi/index.js / classifier.js / policy.js / policy.json），且 `policy.json` 与 `assets/pi-gate/` 源 hash 一致。
- **AC-10** `adopt claude` → `status` 显示 `managed: true`；`revoke claude` 后恢复备份、manifest 移除该 harness 记录。
- **AC-11** `update --check` 在离线或 registry 不可达时退出码 0 并打印“无法检查”，不得抛栈。
- **AC-12** `install --harness claude` 后 CLI 启动期间检测到新版只打印一行提示，不阻塞、不重复查询（同一天第二次启动无网络请求）。

## 9. Definition of Ready / Done

- DoR：PRD 已批准；本 SPEC 三件套齐；目标文件清单已列；无未决架构分歧。
- DoD：AC-1…AC-12 全绿；`node --test` 通过；README/docs 与实现一致；无 TODO 遗留到“后续”；git 提交信息注明 CHG id。

## 10. 未决问题（不阻塞 v0.1，记录在案）

1. `dsh` harness 的 skills 目录由配置提供（`~/.config/shipgate/config.json` 的 `harnesses.dsh`），v0.1 不硬编码；硬门控产物与 pi 同构，复用 `assets/pi-gate/`。
2. Bughunter 85 个 skill 不随 ShipGate 分发（体积 + 迭代频率），v0.1 只在 `shipgate-security` skill 内给安装与调用指引。
3. `aislop hook install` 不纳入 `install` 默认动作：只打印建议命令，由主人显式执行（security 同理，见 §6）。
4. 硬门控产物 vendoring 后的长期升级策略：bridge 冻结期由本机导出覆盖；bridge 退役后由 ShipGate 自己维护 `assets/pi-gate/`。
