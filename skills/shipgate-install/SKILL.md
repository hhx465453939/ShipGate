---
name: shipgate-install
description: ShipGate 部署与升级操作。当需要在新机器安装、给新 harness 装闸、升级 ShipGate 本体、排查「装了没生效」、或做 adopt/revoke/rollback 时使用。覆盖全局安装优先、dry-run 先行、多 harness 矩阵、自定义 harness 配置与回滚。
---

# shipgate-install — 部署、升级、回滚

## 安装（全局固定安装优先，不用 npx 临时跑）

```bash
npm i -g shipgate        # 全局固定
shipgate doctor          # 先体检：能看到哪些 harness、引擎缺什么
shipgate install --dry-run           # 看会写哪些文件，不落盘
shipgate install                     # 真装（默认装 config.harnesses 里的 harness）
shipgate install --harness claude,pi,codex
```

为什么不用 `npx`：临时拉包在弱网/低配机上经常超时失败，装到一半的状态最难排查。`npx` 只在 `--allow-npx` 时兜底。

## 引擎

| 引擎 | 安装 | 缺了会怎样 |
|---|---|---|
| aislop | `npm i -g aislop` | quality 闸退出码 3 |
| cbh | `pipx install git+https://github.com/elementalsouls/Claude-BugHunter` | security 闸退出码 3 |

ShipGate 不替你装引擎（有些环境需要 pipx/venv），只检查并给出命令。

## 每个 harness 会得到什么

| harness | skills | 注入区块 | 硬门控产物 |
|---|---|---|---|
| claude | `~/.claude/skills/` | `~/.claude/CLAUDE.md` | — |
| pi | `~/.agents/skills/` | `~/.pi/agent/APPEND_SYSTEM.md` | `~/.pi/agent/extensions/enforce-rules/` |
| codex | `~/.codex/skills/` | `~/.codex/AGENTS.md` | — |
| gemini | `~/.gemini/skills/` | `~/.gemini/GEMINI.md` | — |
| cursor | — | `~/.cursor/rules/shipgate.mdc` | — |

注入一律是**托管区块**：只改 `<!-- shipgate:begin -->…<!-- shipgate:end -->` 之间，其余内容一个字节都不动；首次改动前留 `*.shipgate-bak.<日期>` 备份。

## 加一个新 harness（插件型 / 新出的 CLI）

```jsonc
// ~/.config/shipgate/config.json
{
  "harnesses": ["claude", "pi"],
  "custom": {
    "dsh": {
      "label": "DSH",
      "detect": "~/.dsh",
      "skills": "~/.dsh/skills",
      "inject": "~/.dsh/AGENTS.md",
      "gate": { "dest": "~/.dsh/extensions/enforce-rules", "assets": "pi-gate" }
    }
  }
}
```

然后 `shipgate install --harness dsh`。自由度高的 harness 建议带 `gate`（硬门控），成熟 harness 可以不带。

## 升级

```bash
shipgate update --check   # 只查
shipgate update           # npm i -g shipgate@latest → 重装 skills → 重渲染注入
```

`~/.config/shipgate/config.json` 里 `update.autoUpdate: true` 时，`install`/`inject` 结束会自动升级一次（失败只告警，不中断）。

## 受管 / 撤回 / 回滚

```bash
shipgate status            # 每个 harness 装了什么、版本、注入区块
shipgate adopt claude      # 标记为受管（改前备份）
shipgate revoke claude     # 撤回：注入文件从备份恢复，manifest 删记录
shipgate rollback claude   # 只回滚注入文件，保留 manifest
```

## 排障

| 症状 | 先查 |
|---|---|
| agent 说不知道有闸 | `shipgate status`；注入区块是否存在、版本是否 v1 |
| 改了没生效 | 该 harness 是否需要重启 / 重新加载 skills |
| quality 报 3 | `shipgate doctor` 看 aislop 是否在 PATH |
| 装完 skills 重复 | `shipgate install --prune` 清掉旧 shipgate-* 目录 |
| 注入文件被写坏 | 找 `*.shipgate-bak.<日期>` 恢复，或 `shipgate rollback <id>` |
