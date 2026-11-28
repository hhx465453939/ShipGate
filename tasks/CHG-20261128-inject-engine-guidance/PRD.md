# PRD — 注入文档补引擎用法（slop / cbh 什么时候怎么调）

- 变更编号：`CHG-20261128-inject-engine-guidance`
- 状态：approved
- 关联：承接 `CHG-20261128-engines-onboarding`（把两个引擎装上并修了安装提示）；本 CHG 只补「注入到每个 agent 系统上下文里的那一段」。

## 1. 背景（实测，2026-11-28）

`shipgate install` 会往 7 个位置写同一段托管区块（`templates/agents-snippet.md`）：`~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.dsh/AGENTS.md`、`~/.codex/AGENTS.md`、`~/.gemini/GEMINI.md`、`~/.cursor/rules/shipgate.mdc`、`~/.kimi-code/AGENTS.md`。

这段是每个 agent **每次开工都会读到**的东西，所以它决定「agent 知不知道有这两个引擎、什么时候该直接调」。当前实测它有三个缺口：

| 缺口 | 现状原文 | 后果 |
|---|---|---|
| 引擎安装命令过期 | `pipx install git+https://github.com/elementalsouls/Claude-BugHunter` | 本机没 pipx、pip 默认镜像还返回空版本表 —— 照抄必失败（`CHG-20261128-engines-onboarding` 已把 README/skill 改对，唯独注入块没改） |
| 没写「什么时候直接调引擎」 | 只有一句「缺了闸会退出码 3」 | agent 只知道 `shipgate quality` / `shipgate quality --scope`，不知道该用 `aislop scan -d` / `aislop fix` / `aislop agent` 看明细与修复；security 侧完全不知道 `cbh recon/surface/classify/triage` |
| 没提 `cbh` 自带的 82 个 `hunt-*` skill | 完全没出现 | agent 跑 `cbh classify` 拿到 skill 名后，去 `~/.claude/skills` 找不到（本机未装），只能现编方法论 —— 这是安全审计里最不该发生的退化 |

此外 `security` 的时机只写「提交前 / 发布前」，没写「探测前必须先有 scope，且 `shipgate security` 只校验不发包」。

## 2. 目标

| # | 目标 | 可验证结果 |
|---|---|---|
| G1 | 注入块里的安装命令本机可执行 | 区块含两步式 cbh 安装与 `pipx` 备选，不再是唯一 pipx 命令 |
| G2 | 每个 agent 都知道两个引擎的存在、自检与调用时机 | 区块含 `aislop doctor` / `cbh --help` 自检与「什么时候调谁」表 |
| G3 | `hunt-*` skill 的缺口被写明 | 区块明确：默认未装、需要时用 `pwsh scripts/install.ps1 -All`、按 `cbh classify` 结果去读 |
| G4 | 已注入的 7 份文件刷新到新内容 | `install --yes` 后 7 个目标都含新段落，`shipgate status` 注入列显示 `v3` |

## 3. 非目标

- 不把 `hunt-*` skill 复制进本仓或本机（结论不变：体积与迭代频率不合）。
- 不扩大注入块篇幅到「文档级教程」——它进每一次会话的上下文，只放「什么时候调谁 + 红线 + 自检」。
- 不改闸的判定逻辑与退出码。

## 4. 关键用户故事

1. 作为在 Claude / Codex / Gemini / Cursor / Kimi 上干活的 agent，我开工就能看到「slop 用 aislop，什么时候跑 `aislop fix`」和「安全先 scope，再 `cbh`」，不用每次重新摸索。
2. 作为做安全审计的 agent，我知道 `hunt-*` skill 默认不在本机，也知道怎么装、装到哪、备份落在哪。
3. 作为维护者，我改一次模板就能让 7 个 harness 的注入同步，不靠人肉编辑各家的规则文件。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 注入块变长，挤占每次会话的上下文 | 只加一张 4 行表 + 两行说明；删掉旧段落里的冗余（「调试走 code-debugger…」保留一句） |
| 区块版本从 v2 跳到 v3，用户手改过的块会被覆盖 | 覆盖前 `backupOnce`（既有行为，`*.shipgate-bak.<日期>`），且只替换标记之间的内容 |
| 写「pipx 备选」仍可能被无脑照抄 | 两步式排在前面并注明「无 pipx 时走这两步」，pipx 放在注释位 |
