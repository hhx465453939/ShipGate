# PRD — 部署拓扑收敛（ShipGate 接管门控与续跑，bridge 收缩为纯桥）

- 变更编号：`CHG-20261127-deploy-topology-consolidation`
- 状态：approved
- 关联：承接 `CHG-20261126-skillpack-gates`；配套 bridge 侧 `CHG-20261127-bridge-scope-narrowing`

## 1. 背景

本机（Windows 11，2026-11-27）实测暴露了三个项目的边界没有真正落实：

1. **门控重复部署**：`~/.pi/agent/extensions/` 下同时存在 `coding-gateways`（agent-config-bridge 装）与 `enforce-rules`（ShipGate 装），两者都被 pi 自动发现并加载。
2. **dsh 挂错产物**：`~/.dsh/profiles/*/cordis.patch.yml` 挂载的是 bridge 的 `agent-config-gates/dsh/index.js`；ShipGate 装的 `~/.dsh/extensions/enforce-rules` 是死代码。
3. **policy 双真源打架**：`~/.config/shipgate/gate-policy.json` 是 `enforce`，`~/.config/agent-config-bridge/gate-policy.json` 是 `bypass`。两份门控各读各的，实际拦截行为取决于加载顺序。

同时，两个项目的 harness 覆盖矩阵错位：

| agent | 本机目录 | bridge targets | ShipGate BUILTIN |
|---|---|---|---|
| Claude Code | `~/.claude` | 权威源 | ✓ |
| pi | `~/.pi` | ✓ | ✓（重复） |
| dsh | `~/.dsh` | ✓ | ✓（重复） |
| Kimi Code | `~/.kimi-code` | ✓（已验证） | ✗ |
| Codex CLI | `~/.codex` | ✗ | ✓ |
| Gemini CLI | `~/.gemini` | ✗ | ✓ |
| Cursor | `~/.cursor` | ✗ | ✓ |
| Antigravity | `~/.antigravity` + `~/.gemini/antigravity` | ✗ | ✗ |
| ZCode | 本机未装 | ✗ | ✗ |

用户定位（本 CHG 的判据来源）：

> agent-config-bridge 只做「连接 pi/dsh 与 Claude Code 权威 skill 目录 + MCP」的桥；
> 开发门控、slop 清理、debug 审计全部集中在 ShipGate。
> 只装 ShipGate 的用户应当能获得完整开发效果；装 pi/dsh 的用户补装 bridge 只为统一权威目录。

## 2. 目标

| # | 目标 | 可验证结果 |
|---|---|---|
| G1 | ShipGate 成为门控与续跑的唯一权威 | bridge 侧不再新增门控提交；本机只保留一份生效门控 |
| G2 | 消除双真源 | 只存在 `~/.config/shipgate/gate-policy.json` 一份 policy 真源 |
| G3 | 覆盖用户点名的 agent | kimi、antigravity 纳入内置 harness；zcode 明确标注不支持及原因 |
| G4 | `.agents/skills` 语义确定 | 链接存在时写入跟随链接目标并显式报告，不产生第二份副本 |
| G5 | 一次性多 agent 部署 | `install --yes` 把全部已探测 harness 装齐 |
| G6 | 续跑扩展归位 | goal-mode / auto-continue 由 ShipGate 拥有并可显式装卸 |

## 3. 非目标

- 不做跨机器分发（ssh xiyou / ssh xiawo 的 Linux 部署在本 CHG 之后单独立项）。
- 不改 bridge 的 skills / commands / rules-doc / MCP 四个维度的桥接行为（那是 bridge 的正当职责，只做边界收缩）。
- 不引入第三方依赖（沿用零依赖约束）。
- 不自动删除用户数据：检测到 bridge 遗留产物只报告并给显式命令。
- 不写 dsh 的 profile（`never_touch`）。

## 4. 关键用户故事

1. 作为只用 Claude Code / Codex / Gemini / Cursor 的用户，我只装 ShipGate 就拿到 27 skill + 4 闸。
2. 作为装了 Antigravity 的用户，我希望 ShipGate 认识它并把 skills 装到 `~/.gemini/antigravity/skills/`，而不是让我手工复制。
3. 作为同时装了 pi + bridge 的用户，我不希望两个门控同时拦截、弹两次窗、一份 enforce 一份 bypass。
4. 作为维护者，我跑一次 `shipgate doctor` 就能看清「哪个 harness 装了哪份门控、挂载的是哪一份、policy 有几个真源」。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 删除 gate 目录会丢失用户自定义 | 只报告 + 给命令；不自动删；必要时改名停用而非删除 |
| antigravity 全局规则文档路径未验证 | 本 CHG 只做 skills 分发，inject 置 null 并在文档写明「未验证」 |
| `.agents/skills` 链接跟随导致误写 | 写入前打印真实落点；dry-run 必须显示解析后的绝对路径 |
| 两个项目都改 harness 定义会再次漂移 | bridge 侧 CHG 明确删掉 gate/续跑维度，只留四维桥接 |
| zcode 纳入需要实机验证 | 本机未装，不纳内置；文档记录探测方式与待验证项 |
