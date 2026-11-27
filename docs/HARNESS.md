# harness 矩阵与适配

## 内置

| id | 标签 | 探测路径 | skills | commands | agents | 注入文件 | 硬门控 |
|---|---|---|---|---|---|---|---|
| `claude` | Claude Code | `~/.claude` | `~/.claude/skills` | `~/.claude/commands` | `~/.claude/agents` | `~/.claude/CLAUDE.md` | — |
| `pi` | pi agent | `~/.pi` | `~/.agents/skills` | `~/.pi/agent/prompts` | — | `~/.pi/agent/APPEND_SYSTEM.md` | `~/.pi/agent/extensions/enforce-rules` |
| `dsh` | dsh | `~/.dsh` | `~/.dsh/skills` | — | — | `~/.dsh/AGENTS.md` | `~/.dsh/extensions/enforce-rules` |
| `codex` | Codex CLI | `~/.codex` | `~/.codex/skills` | — | — | `~/.codex/AGENTS.md` | — |
| `gemini` | Gemini CLI | `~/.gemini` | `~/.gemini/skills` | — | — | `~/.gemini/GEMINI.md` | — |
| `cursor` | Cursor | `~/.cursor` | —（无 skills 目录） | — | — | `~/.cursor/rules/shipgate.mdc` | — |

能力缺失不是缺陷：harness 没有对应目录就跳过，并在输出里写明「commands 跳过：harness 无 commands 目录」，不静默。

**pi 的 prompts 就是它的 slash command 目录**：格式（frontmatter `description` + `# /name`）与 ShipGate 的 `commands/*.md` 一致，所以 22 个命令原样复用。目标位置已有同名文件时（比如你自己手写的 prompt），ShipGate 会备份为 `*.shipgate-bak.<日期>` 并在输出里明确报出「覆盖了 N 个」，不会静默覆盖。

## 两类 harness，两种约束策略

**成熟 harness（claude / codex / gemini / cursor）**：有各自的权限与工具治理面，ShipGate 没有可挂的 hook。给它们 skills + 注入文档，靠「agent 读到规则后自觉 + `shipgate quality` 可验证」——文档里明确标注**软约束**。

**自由度高的 harness（pi / dsh 等）**：能自由读源码、跑命令。除 skills + 注入外，装一份进程级硬门控产物：破坏性命令分级拦截、跳层直读拦截、受保护工作区清场拦截。

## 装备清单

| 资产 | 源目录 | 目标 |
|---|---|---|
| skills | `skills/<name>/SKILL.md`（27 个） | `<harness>/skills/<name>/` |
| commands | `commands/*.md`（22 个） | `<harness>/commands/`（仅 claude） |
| agents | `agents/*.md`（2 个） | `<harness>/agents/`（仅 claude） |
| 注入 | `templates/agents-snippet.md` | `<harness>` 入口文档的托管区块 |
| 硬门控 | `assets/gates/**` | `<harness gate.dest>` |

## 硬门控产物

`assets/gates/` 是 vendored 产物，源出 `agent-config-bridge` 的 `bridge/gates/`：

```
assets/gates/
├── index.js        扩展入口
├── classifier.js   命令分类
├── policy.js       策略引擎
├── pi/index.js     pi 适配
├── pi/policy.json  pi 默认策略
├── dsh/index.js    dsh 适配
├── dsh/policy.json dsh 默认策略
└── profiles/       域配置（ai4s 等）
```

`policy.json` 由 `shipgate policy` 管理：真源是 `~/.config/shipgate/gate-policy.json`，各 harness 的 `policy.json` 是它的投影。安装时首次合并（并集，且把 harness 既有条目提升回真源），之后 `--sync` 严格按真源覆盖——所以 `--rm-protected` 能真正生效。

升级方式：bridge 侧变更后重新导出覆盖该目录，CHANGELOG 记录来源 hash。

## 自定义 harness

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
      "gate": { "dest": "~/.dsh/extensions/enforce-rules", "kind": "dsh" }
    }
  }
}
```

规则：
- `detect` 省略 → 视为总是存在（允许安装）。
- `skills` / `commands` / `agents` 为 null → 跳过对应分发（像 cursor）。
- `gate` 省略 → 软约束；`gate.kind` 决定用 `pi` 还是 `dsh` 适配。
- 改完配置直接 `shipgate install --harness dsh`，不需要改代码。

## 为什么注入区块而不是整文件

每个 harness 的入口文档都是用户长期手写的（本机实测：CLAUDE.md 479 行、AGENTS.md 387 行、GEMINI.md 335 行）。ShipGate 只追加/替换带标记的一段，且首次改动前备份 `*.shipgate-bak.<日期>`。这样 `revoke` 能真正回到装之前的状态。
