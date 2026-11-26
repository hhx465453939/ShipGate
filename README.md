# ShipGate

**全周期代码开发的技能与闸门分发器。** 一条命令把 27 个开发 skill、4 道闸、硬门控，装到你用的每一个编码 agent 上。

> **把下面这段原样丢给你的编码 agent**（Claude Code / Codex / Gemini CLI / pi / dsh）：
>
> ```text
> 读 https://github.com/hhx465453939/ShipGate 这个仓库，按 README「一键部署」把 ShipGate
> 装到我这台机器上：skills + commands + agents + 对应 harness 的硬门控 + 全局注入文档。
> 装之前先跑 npx shipgate-cli install --dry-run 给我看会动哪些文件，我确认后再真装。
> 装完把所有选择、写了哪些路径、装了多少个 skill 报给我。
> ```
>
> agent 会执行 `npx shipgate-cli install --ask`，列出它在你机器上探测到的 agent，让你勾选，再确认写入。

安装后的效果：任何 agent 打开就问自己「这活该走哪道闸」，改代码前有契约、编辑后有质量闸、提交前有安全闸。

---

## 一键部署

```bash
# 1) 交互式（推荐）：列出探测到的 agent，逐个确认
npx shipgate-cli install --ask

# 2) 全局固定安装（长期用，别每次 npx）
npm i -g shipgate-cli
shipgate install --ask

# 3) 非交互 / CI
shipgate install --yes
shipgate install --harness claude,pi,codex
shipgate install --dry-run        # 只看计划，不写盘
```

引擎（ShipGate 只检查，不替你装）：

```bash
npm i -g aislop                                                  # quality 闸
pipx install git+https://github.com/elementalsouls/Claude-BugHunter  # security 闸
```

## 装了之后拿到什么

| 项 | 数量 | 落到哪 |
|---|---|---|
| 开发 skill | **27**（22 个全周期 + 5 个闸用法） | `<harness>/skills/` |
| slash command | **22** | `~/.claude/commands/`（仅 Claude Code 支持） |
| subagent | **2**（context-builder / debug-executor） | `~/.claude/agents/` |
| 硬门控 | pi / dsh 类才装 | `~/.pi/agent/extensions/enforce-rules/` |
| 注入文档 | 托管区块 | `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、`~/.gemini/GEMINI.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.cursor/rules/shipgate.mdc` |

### 27 个 skill 按阶段分

| 阶段 | skill |
|---|---|
| 需求 | `intent-grill` · `prd` · `project-health-audit` |
| 契约 | `ai-spec` · `shipgate-spec` |
| 实现 | `goal-driven-development` · `ralph` · `ralph-yolo` · `loop-engineer` · `api-first-modular` · `codebase-context` |
| 调试 | `code-debugger` · `debug-ui` · `dev-env-scan` |
| 审查 | `code-review` · `security-audit` · `ux-experience-audit` · `shipgate-quality` · `shipgate-security` |
| 收尾 | `iteration-manager` · `nodejs-npm-auto-release` · `gh-actions-architect` · `fork-sync` |
| 环境与元能力 | `dev-host-init` · `discover-skill-opportunities` · `shipgate` · `shipgate-install` |

## 四道闸

| 闸 | 什么时候过 | 命令 | 引擎 |
|---|---|---|---|
| **spec** | 任何代码改动之前 | `shipgate spec check` | 内置（校验 `tasks/CHG-*/` 三件套） |
| **quality** | 每次编辑后 / 提交前 | `shipgate quality` | [aislop](https://github.com/scanaislop/aislop)（50+ 规则 / 12 语言） |
| **security** | 提交前 / 发布前（显式） | `shipgate security --scope <file>` | [cbh](https://github.com/elementalsouls/Claude-BugHunter) |
| **ship** | 装 / 升级 / 换 harness | `shipgate status` | 内置（manifest 校验） |

退出码就是结论：`0` 通过 / `1` 闸拦下 / `2` 用法错 / `3` 环境缺。

## harness 矩阵与门控分级

| harness | skills | commands | agents | 注入 | 门控 |
|---|---|---|---|---|---|
| Claude Code | ✓ | ✓ | ✓ | `CLAUDE.md` | 软约束 |
| pi agent | ✓ | — | — | `APPEND_SYSTEM.md` | **硬拦截** |
| Codex CLI | ✓ | — | — | `AGENTS.md` | 软约束 |
| Gemini CLI | ✓ | — | — | `GEMINI.md` | 软约束 |
| Cursor | — | — | — | `rules/shipgate.mdc` | 软约束 |
| 自定义（dsh 等） | 配置 | 配置 | 配置 | 配置 | 可选硬拦截 |

**说清楚**：只有自由度高的 harness（pi / dsh）能装进程级硬门控——破坏性命令、跳层直读会被真的拦下。Claude Code / Codex / Gemini / Cursor 没有对应的 hook 面，ShipGate 给它们 skill + 注入，不假装有硬门控。

接新 agent 不改代码：

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

## 硬门控与 policy

```bash
shipgate policy                              # 策略真源 + 每个 harness 落地状态
shipgate policy --add-protected /path/repo   # 加入受保护工作区
shipgate policy --rm-protected /path/repo
shipgate policy --mode enforce|bypass
shipgate policy --sync                       # 同步到所有装了门控的 harness
```

真源是 `~/.config/shipgate/gate-policy.json`；各 harness 的 `policy.json` 是它的投影。受保护工作区里 `git stash / reset --hard / clean -f / checkout -- .` 这类清场命令会被拦下。

## 升级、受管、回滚

```bash
shipgate update --check     # 只查新版本（查 npm 的 shipgate-cli）
shipgate update             # 全局升级 + 重装 skills/commands/agents + 重渲染注入
shipgate adopt claude       # 纳入受管（改动前备份）
shipgate revoke claude      # 撤回：注入文件从备份恢复
shipgate rollback claude    # 只回滚注入文件
shipgate status --json      # 机器可读的受管状态
```

## 红线（设计如此）

1. **security 闸永不自动执行**：没有 `--scope` 直接拒绝。主动探测在错误范围上违法。
2. **不改你手写文档**：只写 `<!-- shipgate:begin -->…<!-- shipgate:end -->` 之间，首次改动前备份 `*.shipgate-bak.<日期>`。
3. **不 fork 引擎**：aislop / cbh 是外部依赖，ShipGate 只做判定与分发。
4. **`--prune` 只删 manifest 记录过、且包里已不存在的 skill**，不碰你自己写的 skill。
5. **不写凭据**。

## 从源码开发

```bash
git clone https://github.com/hhx465453939/ShipGate.git
cd ShipGate
node --test test/*.test.mjs          # 零依赖测试
node bin/shipgate.mjs doctor
node scripts/migrate-skillpack.mjs --check   # 技能包 frontmatter 体检
```

改动必须走 `tasks/CHG-<id>/` 契约（本项目自己也要过 spec 闸）。架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，门控细节见 [docs/GATES.md](docs/GATES.md)，harness 适配见 [docs/HARNESS.md](docs/HARNESS.md)。

## 与上游的关系

| 项目 | 关系 |
|---|---|
| [aislop](https://github.com/scanaislop/aislop) | quality 引擎（MIT，外部依赖） |
| [Claude-BugHunter](https://github.com/elementalsouls/Claude-BugHunter) | security 引擎（MIT，外部依赖） |
| agent-config-bridge | 硬门控产物来源（已冻结，能力由本项目接管） |

## License

MIT
