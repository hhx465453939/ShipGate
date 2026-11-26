# PRD — ShipGate v0.2：纳入 full-dev 技能包、完整硬门控、可引导部署

- change_id: `CHG-20261126-skillpack-gates`
- 状态: APPROVED（主人 2026-11-26 明确指令：包名改 shipgate-cli、挂 npm、README 写引导 agent 部署的入口、把 full-dev skill package 与硬门控真正做进项目）
- 承接: `CHG-20261126-shipgate-bootstrap`（v0.1 只做了空闸门 + 5 个用法 skill，本 CHG 补齐实体）

## 1. 问题（v0.1 的真实缺口）

主人原话：「我看了你的项目里面的 skill，还有门控，都没有完全实现我需要的功能，硬门控，还有 full-dev 的 skill package，都没有出现在里面。」

| 缺口 | 现状（v0.1） | 应该是什么 |
|---|---|---|
| 全周期技能包 | 只有 5 个 `shipgate-*` 用法 skill | 22 个 full-dev skill（ai-spec / prd / intent-grill / goal-driven-development / code-review / code-debugger / ralph / iteration-manager / project-health-audit / dev-host-init / security-audit / ux-experience-audit / api-first-modular / codebase-context / debug-ui / dev-env-scan / discover-skill-opportunities / fork-sync / gh-actions-architect / loop-engineer / nodejs-npm-auto-release / ralph-yolo）+ 22 个 slash command + 2 个 subagent |
| 硬门控 | 把 `~/.pi/agent/extensions/enforce-rules` 原样 cp 进 assets，没有源码语义、没有 dsh | 完整的 gate 资产（classifier / policy 引擎 / pi 与 dsh 两套适配 / profiles）+ 由 ShipGate 生成并维护 policy（受保护工作区、破坏性命令分级、跳层直读拦截） |
| 引导部署 | `install` 只读 config，用户要自己拼 `--harness claude,pi,...` | `install --ask` 交互式选择题：列出探测到的 agent，用户逐项确认；README 给一段可直接丢给 agent 的话 |
| 分发 | 包名 `shipgate` 在 npm 已被占用（`Ship-Gate/ShipGate` v2.1.0） | 包名 `shipgate-cli`，命令仍是 `shipgate`，可 `npm i -g shipgate-cli` |

## 2. 目标用户与场景

| 用户 | 场景 |
|---|---|
| 主人（多 harness、多机器） | 换机器时把一段话丢给任意 agent，agent 跑 `npx shipgate-cli install --ask`，出选择题确认后全局装好 skills / commands / agents / 硬门控 / 注入 |
| 拿到 ShipGate 仓库的其他人 | 同一段话 → 同样结果；不只是"能跑闸"，而是拿到一整套全周期开发技能包 |
| 编码 agent 自己 | 读到注入区块 + 22 个 skill，知道立项走 `ai-spec`、写代码走 `goal-driven-development`、交付前走 `shipgate quality` / `shipgate security` |

## 3. 产品定义（v0.2）

**ShipGate = 全周期代码开发的技能与闸门分发器。** 三件事：

1. **技能包**：随包分发 full-dev 的 22 skill + 22 command + 2 agent，按 harness 的能力落到对应目录。
2. **四道闸**：spec / quality / security / ship，按事件触发（v0.1 已完成，本 CHG 不推翻）。
3. **硬门控**：对自由度高的 harness（pi / dsh）安装真正的 gate 引擎与 policy；成熟 harness（claude / codex / gemini）用技能 + 注入约束，并在文档里写清"这是软约束"。

## 4. 非目标

- ❌ 不把 `Claude_skill_pool` 整仓搬进来（只搬 `package/full-dev-脚手架` 这一套，`_archived` 不要）
- ❌ 不改 aislop / cbh 的引擎代码（仍是外部依赖）
- ❌ 不做 web UI；`--ask` 用 Node 内置 readline
- ❌ 不替用户决策安全审计范围（security 闸红线不变）
- ❌ 不在 v0.2 支持 Windows 原生（WSL 可以）

## 5. 成功判据

1. 任意机器：`npx shipgate-cli install --ask` → 出选择题 → 确认后 5 个 harness 都拿到 27 个 skill（22 full-dev + 5 shipgate）。
2. claude harness 额外拿到 22 个 command + 2 个 agent；pi/dsh 额外拿到完整硬门控与 policy。
3. `shipgate policy --add-protected <dir>` 改一处，所有装了硬门控的 harness 的 policy 同步生效。
4. README 开头就有一段「把这段丢给你的 agent」的指令，agent 读完能独立完成部署。
5. `npm i -g shipgate-cli` 后 `shipgate --version` 可用，`shipgate update` 查的是 `shipgate-cli`。
