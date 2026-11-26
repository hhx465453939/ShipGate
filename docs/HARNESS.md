# harness 矩阵与适配

## 内置

| id | 标签 | 探测路径 | skills 目录 | 注入文件 | 硬门控 |
|---|---|---|---|---|---|
| `claude` | Claude Code | `~/.claude` | `~/.claude/skills` | `~/.claude/CLAUDE.md` | — |
| `pi` | pi agent | `~/.pi` | `~/.agents/skills` | `~/.pi/agent/APPEND_SYSTEM.md` | `~/.pi/agent/extensions/enforce-rules` |
| `codex` | Codex CLI | `~/.codex` | `~/.codex/skills` | `~/.codex/AGENTS.md` | — |
| `gemini` | Gemini CLI | `~/.gemini` | `~/.gemini/skills` | `~/.gemini/GEMINI.md` | — |
| `cursor` | Cursor | `~/.cursor` | —（无 skills 目录） | `~/.cursor/rules/shipgate.mdc` | — |

## 两类 harness，两种约束策略

**成熟 harness（claude / codex / gemini）**：自带权限与工具治理，不需要外挂硬门控。ShipGate 给它们 skills + 注入文档，靠"agent 读到规则后自觉 + 闸命令可验证"。

**自由度高的 harness（pi / dsh）**：能自由读源码、跑命令。除 skills + 注入外，还装一份硬门控产物（`assets/pi-gate/`）：拦截跳层破坏行为、会话级策略、受保护工作区。

## 硬门控产物的来源

`assets/pi-gate/` 是 vendored 产物，源出 `agent-config-bridge` 的 `gates/pi`：

```
assets/pi-gate/
├── index.js        扩展入口
├── pi/index.js     pi 适配（enforceRules / policy 加载）
├── classifier.js   命令分类
├── policy.js       策略引擎
├── policy.json     策略（install 时若已存在则不覆盖）
└── profiles/       域配置（ai4s 等）
```

升级方式：bridge 侧变更后重新导出覆盖该目录，CHANGELOG 记录来源。`policy.json` 是**用户资产**，install 永远不覆盖已存在的版本。

## 自定义 harness

```jsonc
// ~/.config/shipgate/config.json
{
  "harnesses": ["claude", "pi"],
  "custom": {
    "myagent": {
      "label": "My Agent",
      "detect": "~/.myagent",
      "skills": "~/.myagent/skills",
      "inject": "~/.myagent/AGENTS.md",
      "gate": { "dest": "~/.myagent/extensions/enforce-rules", "assets": "pi-gate" }
    }
  }
}
```

`detect` 省略时视为"总是存在"（允许装）。`gate` 可省略。`skills` 为 null 时跳过 skill 分发（像 cursor）。

## 为什么注入区块而不是整文件

每个 harness 的入口文档都是用户长期手写的（本机实测：CLAUDE.md 479 行、AGENTS.md 387 行、GEMINI.md 335 行）。ShipGate 只追加/替换带标记的一段，且首次改动前备份。这样 `revoke` 能真正回到装之前的状态。
