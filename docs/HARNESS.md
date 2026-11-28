# harness 矩阵与适配

## 内置

| id | 标签 | 探测路径 | skills | commands | agents | 注入文件 | 硬门控 |
|---|---|---|---|---|---|---|---|
| `claude` | Claude Code | `~/.claude` | `~/.claude/skills` | `~/.claude/commands` | `~/.claude/agents` | `~/.claude/CLAUDE.md` | — |
| `pi` | pi agent | `~/.pi` | `~/.agents/skills` | `~/.pi/agent/prompts` | — | `~/.pi/agent/APPEND_SYSTEM.md` | `~/.pi/agent/extensions/enforce-rules` |
| `dsh` | dsh | `~/.dsh` | `~/.agents/skills`（与 pi 同一链接） | — | — | `~/.dsh/AGENTS.md` | `~/.dsh/extensions/enforce-rules` |
| `codex` | Codex CLI | `~/.codex` | `~/.codex/skills` | — | — | `~/.codex/AGENTS.md` | — |
| `gemini` | Gemini CLI | `~/.gemini` | `~/.gemini/skills` | — | — | `~/.gemini/GEMINI.md` | — |
| `cursor` | Cursor | `~/.cursor` | —（无 skills 目录） | — | — | `~/.cursor/rules/shipgate.mdc` | — |
| `kimi` | Kimi Code | `~/.kimi-code` | `~/.kimi-code/skills` | —（官方不支持 Claude commands） | — | `~/.kimi-code/AGENTS.md` | — |
| `antigravity` | Antigravity | `~/.antigravity` | `~/.gemini/antigravity/skills` | — | — | —（全局规则路径未验证） | — |

### 未纳入：ZCode

ZCode 是智谱的 GUI IDE，**本机未安装**（无 `~/.zcode`），且 3.0 起切换自有 Agent 内核、不再内置其他 Agent 适配。当前的诚实处理是**不假装支持**：

- `shipgate doctor` 不会列出 zcode（未探测到）。
- 若将来机器上出现 `~/.zcode/skills`，按下面的「自定义 harness」用 `custom` 配置接入，不改代码。
- 探测方式：`ls -d ~/.zcode ~/AppData/Roaming/ZCode 2>/dev/null`。

### Antigravity 的两个路径别混

| 用途 | 路径 |
|---|---|
| 全局 skills（ShipGate 写这里） | `~/.gemini/antigravity/skills/<name>/SKILL.md` |
| 项目级 skills | `<repo>/.agent/skills/` |
| IDE 自身设置 | `~/.antigravity/settings.json`（不入本工具受管） |

注意单复数：Antigravity 项目级是 **`.agent`**，pi/dsh 的共享技能根是 **`.agents`**，两者不是同一个目录。

能力缺失不是缺陷：harness 没有对应目录就跳过，并在输出里写明「commands 跳过：harness 无 commands 目录」，不静默。

**pi 的 prompts 就是它的 slash command 目录**：格式（frontmatter `description` + `# /name`）与 ShipGate 的 `commands/*.md` 一致，所以 22 个命令原样复用。目标位置已有同名文件时（比如你自己手写的 prompt），ShipGate 会备份为 `*.shipgate-bak.<日期>` 并在输出里明确报出「覆盖了 N 个」，不会静默覆盖。

## 两类 harness，两种约束策略

**成熟 harness（claude / codex / gemini / cursor / kimi / antigravity）**：有各自的权限与工具治理面，ShipGate 没有可挂的 hook。给它们 skills + 注入文档，靠「agent 读到规则后自觉 + `shipgate quality` 可验证」——文档里明确标注**软约束**。

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

## `~/.agents/skills` 归属（避免两个项目抢同一目录）

本机 `~/.agents/skills` 是指向 `~/.claude/skills` 的链接（pi 与 dsh 都把 `.agents/skills` 当原生技能根）。分工必须明确：

| 谁 | 对 `~/.agents/skills` 做什么 |
|---|---|
| `agent-config-bridge` | 负责**创建/维护**这条链接（adopt pi 时） |
| ShipGate | 只做**复制**；检测到链接时**跟随**到真实目标，不建链、不删链 |

因此两者同时存在时，写入落到同一份（`~/.claude/skills`），幂等且不产生第二份副本。`install --dry-run` 会打印 `skills → <真实路径>（跟随链接 <声明路径>）`；链接断开则 fail-closed 报错，并提示去 bridge 重建链接。

## 续跑扩展（可选，不进默认安装）

`assets/pi-extensions/` 下有 `goal-mode.ts` 与 `auto-continue.ts`（源出 agent-config-bridge，ShipGate 现在拥有维护责任）。二者都驱动轮次边界，**互斥**：

```bash
shipgate install --with-goal-mode       # 带预算与空转保护
shipgate install --with-auto-continue   # 无轮数上限
```

同时指定 → 退出码 2。目标已存在会先备份 `*.shipgate-bak.<日期>` 再覆盖。

## 遗留门控检测（doctor）

`shipgate doctor` 会报告与 agent-config-bridge 并存导致的冲突，**只报告不自动删**：

| code | 含义 | 处理 |
|---|---|---|
| `LEGACY_GATE_DUPLICATE` | pi 同时装了 `coding-gateways`(bridge) 与 `enforce-rules`(ShipGate) | 按提示停用其中一份 |
| `LEGACY_POLICY_SOURCE` | 存在第二份 policy 真源 `~/.config/agent-config-bridge/gate-policy.json` | 统一到 `~/.config/shipgate/gate-policy.json` |
| `DSH_GATE_MISMOUNT` | dsh 的 cordis.patch 挂的不是 `enforce-rules` | 改挂接行指向 ShipGate 产物 |

## skill 根卫生（doctor）

skills 根是**共用**资源：`~/.agents/skills` 是 `~/.claude/skills` 的链接，pi / dsh / claude 读的是同一份。往里塞任何非 skill 的东西都会变成 skill，因此有三条约定。

### 约定 1：备份永远落在根外

清理命令的落点是 `~/.config/shipgate/backups/<kind>-<YYYY-MM-DD>/`，**不是** `<skillsRoot>/_flat-backup`。

原因（pi 1.4.0 `dist/core/skills.js` 实读）：

| 加载规则 | 后果 |
|---|---|
| `name = frontmatter.name ?? parentDirName` | 备份目录里的 `*.md` 若没有 `name:`，名字变成目录名（`_flat-backup` → 非法字符告警） |
| 非 `SKILL.md` 文件只要有 `description` 就加载 | 旧版扁平 skill 被重新注册 |
| 同名后到者 skipped | 被跳过的是**新版目录**，生效的是**旧版扁平文件** —— 静默降级 |

改前实测：`~/.claude/skills/_flat-backup/` 让 pi 报出 21 条 collision + 10 条 warning（10 个真实同名、10 个伪名、1 个 `skills` 伪名）。

### 约定 2：`doctor` 报四类发现

| code | 判据 | 处置 |
|---|---|---|
| `FLAT_SKILL_DUPLICATE` | 根内 `<name>.md` 与 `<name>/SKILL.md` 并存 | 给「移到根外备份目录」的命令 |
| `SKILL_STRAY_DIR` | 根的直接子目录无 `SKILL.md` 但有 `.md` | 同上（这种目录一旦被当 skill path 传入就会产生伪技能） |
| `SKILL_NAME_COLLISION` | 同一 root 内多个文件声明同一 `name` | 只报告，列出 winner / 被跳过者 |
| `SKILL_INVALID_NAME` / `SKILL_DESCRIPTION_TOO_LONG` | 不满足 `^[a-z0-9-]+$`、≤64、无 `--`；`description` > 1024 | 只报告，要求在**源 skill** 里改（改分发副本会被下次 install 覆盖） |

全部**只报告不删除**；命令按平台生成（Windows → `Move-Item`，POSIX → `mv`）。同一物理目录被多个 harness 共用时只报一次并列出共用者。

### 约定 3：分发物在出厂前就校验

`node scripts/migrate-skillpack.mjs --check` 与单测同时校验 27 个 skill 的 `name` / `description` 取值，所以超规内容在 CI 就红，不会等 pi 启动才告警。

### 边界：agent-config-bridge 不写 skills 根

核查结论（2026-11-28）：

- `bridge/lib/source.js` 的 `scanSkills` 只认「目录且含 `SKILL.md`」，扁平 `.md` 仅进 `flatDuplicates` 计数，从不桥接；
- 全仓 `flat-backup` 命中 0；
- 备份落点是 `backupsDir(repo) = <repo>/.bridge/backups`（`bridge/lib/paths.js`），在 skills 根之外。

因此根目录卫生由 ShipGate 单方面负责：**不往根里塞东西 + 报告根里的问题**。

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
