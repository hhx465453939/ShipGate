# PRD — ShipGate 立项（全周期闸链）

- change_id: `CHG-20261126-shipgate-bootstrap`
- 状态: APPROVED（主人于 2026-11-26 对话中明确授权"一次性把几合一仓库建好，本地开发后上传 git"）
- 作者: 主人 + pi agent

## 1. 问题（真实现状，非推测）

开发约束今天散在四处，彼此不知道对方存在：

| 资产 | 物理位置 | 覆盖阶段 | 缺口 |
|---|---|---|---|
| ai-spec（立项/SPEC/契约 + 分层注入） | `Development/Claude_skill_pool/package/full-dev-脚手架` | 上游：需求→SPEC | 只有文档约束，不验证代码质量 |
| 硬门控（enforce-rules / protected_worktrees / 授权表） | `Development/agent-config-bridge` | 横向：只对 pi / dsh 生效 | Claude Code / Codex / Gemini 无硬门控；且只管"改不改得动"，不管"改得好不好" |
| aislop（AI slop 检测 + 自动修复 + per-edit hook） | `Development/aislop` | 中游：代码质量 | 没被接入任何全局工作流 |
| Claude-BugHunter（85 skill + cbh CLI） | `Development/Claude-BugHunter` | 下游：安全审计 | 没被接入，装法与其他资产完全不同 |

三个后果：

1. **只有上游有约束**：文档能覆盖代码，但"AI 写出来的代码有没有 slop、有没有漏洞"没有任何闸。
2. **技能按 harness 各抄一份**：`Claude_skill_pool` 里同一份 ai-spec 已经存在 `skills.claude / skills.codex / skills.gemini` 三份副本，必然漂移。
3. **装法不统一**：每个资产自己的安装脚本、自己的目录约定、自己的命令名。新人（或新 agent）要装四遍才知道怎么用。

## 2. 目标用户与场景

| 用户 | 场景 |
|---|---|
| 主人（多 harness 并存） | 换机器/新 agent 上线时，一条命令把四道闸装齐，注入文档自动写好"什么时候用什么工具、走哪个 skill" |
| 编码 agent（pi / Claude Code / Codex / Gemini / Cursor） | 读到注入段后能自主判断：改代码前过 spec 闸，编辑后过 quality 闸，提交前过 security 闸 |
| 未来贡献者 | 克隆后 `npx shipgate install` 即可用，不读四份安装文档 |

## 3. 产品定义

**ShipGate = 代码出厂前的闸链。** 一道闸管一个阶段，闸门按事件触发，各自可独立开关：

| 闸 | 管什么 | 触发时机 | 引擎 |
|---|---|---|---|
| `spec` | 改动有没有契约、契约是否成立 | 任何代码改动前 | 内置（校验 CHG 三件套） |
| `quality` | AI 留下的 slop（空话注释/吞异常/幻觉 import/超大函数） | 每次编辑后 | 委派 `aislop` |
| `security` | 漏洞面（越权、注入、认证绕过…） | 提交前/发布前，**显式触发** | 委派 `cbh` |
| `ship` | 技能与注入是否装到位、是否最新 | 安装/升级/换 harness | 本 CLI 自身 |

## 4. 非目标（v0.1 明确不做）

- ❌ 不 fork / 不重写 aislop、aislop-mcp、cbh、85 个 hunt-* skill —— 一律外部依赖
- ❌ 不接管 agent-config-bridge 的 bridge/apply 能力 —— 它是"介质层"，保持独立
- ❌ 不做 web UI / dashboard / 自建 MCP server
- ❌ 不在 v0.1 支持 Windows 原生（先 macOS/Linux；Windows 走 WSL）
- ❌ 不把 security gate 挂到自动 hook 上（见 SPEC §6 安全边界）

## 5. 成功判据

主人视角，装完之后必须做到：

1. 一条命令完成部署：`npx shipgate install`，落 skills + 注入段，重复执行幂等。
2. 换 harness 不改代码：加 `codex` 只需 `shipgate install --harness codex`。
3. 注入段可读可懂：agent 浏览器读完就知道"改代码前跑什么、编辑后跑什么、提交前跑什么"。
4. 闸能真拦：`shipgate spec check` 在契约不全时退出码非 0；`shipgate quality` 在分数低于阈值时退出码非 0。
5. 全局更新一次、各 harness 重部署一次，动作可审计（`shipgate status` 能看到每个 harness 装了什么版本、什么时候装的）。
