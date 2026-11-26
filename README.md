# ShipGate

**代码出厂前的闸链 —— 让 AI 写出来的代码，先过闸再落地。**

`spec` → `quality` → `security` → `ship`：四道闸，一道管一个阶段，装到你用的每一个编码 agent 上。

```bash
npm i -g shipgate
shipgate doctor          # 看这台机器有哪些 harness、缺什么引擎
shipgate install         # 装 skills + 注入文档 + 硬门控
```

之后你的 agent 会知道：改代码前过 spec 闸，编辑后过 quality 闸，提交前过 security 闸。

---

## 它解决的问题

AI 编码 agent 让"写代码"变快了，但质量链路没跟上：

| 阶段 | 以前的状况 | ShipGate 的做法 |
|---|---|---|
| 改之前 | 没有契约，需求只在对话里 | `spec` 闸校验 `tasks/CHG-*/` 三件套 |
| 写的时候 | AI 留一堆 slop：空话注释、吞异常、`as any`、幻觉 import | `quality` 闸委派 [aislop](https://github.com/scanaislop/aislop)（50+ 规则 / 12 语言） |
| 提交前 | 没人看安全面 | `security` 闸委派 [cbh](https://github.com/elementalsouls/Claude-BugHunter)，**必须显式给 scope** |
| 换 agent | 每个 harness 各装一遍，还漏 | `ship` 闸：一条命令分发到 claude / pi / codex / gemini / cursor / 自定义 |

## 四道闸

| 闸 | 什么时候过 | 命令 | 通过判据 |
|---|---|---|---|
| **spec** | 任何代码改动之前 | `shipgate spec check` | 契约三件齐全 + status 非 draft + 有 AC |
| **quality** | 每次编辑后 / 提交前 | `shipgate quality` | `score ≥ 80` 且无 error 级发现 |
| **security** | 提交前 / 发布前（显式） | `shipgate security --scope <file>` | scope 合法 + cbh 在 |
| **ship** | 装 / 升级 / 换 harness | `shipgate status` | manifest 与磁盘一致 |

退出码就是结论：`0` 通过 / `1` 闸拦下 / `2` 用法错 / `3` 环境缺。

## 安装

```bash
# 全局固定安装（推荐；npx 临时跑在弱网/低配机上经常失败）
npm i -g shipgate

# 引擎（ShipGate 只检查，不替你装）
npm i -g aislop
pipx install git+https://github.com/elementalsouls/Claude-BugHunter
```

`shipgate install` 会：

1. 探测本机有哪些 harness（`~/.claude`、`~/.pi`、`~/.codex`…）；
2. 把 5 个 `shipgate-*` skill 复制到对应 skills 目录（hash 相同则跳过）；
3. 在入口文档里写入**托管区块**（只改标记之间，其余一字不动，改前备份）；
4. 给自由度高的 harness（pi / dsh）额外装硬门控产物；
5. 写 manifest，供 `status` / `--prune` / `revoke` 使用。

先看会发生什么：

```bash
shipgate install --dry-run
shipgate install --harness claude,pi
```

## harness 矩阵

| id | skills | 注入文档 | 硬门控 |
|---|---|---|---|
| `claude` | `~/.claude/skills` | `~/.claude/CLAUDE.md` | — |
| `pi` | `~/.agents/skills` | `~/.pi/agent/APPEND_SYSTEM.md` | `enforce-rules` 扩展 |
| `codex` | `~/.codex/skills` | `~/.codex/AGENTS.md` | — |
| `gemini` | `~/.gemini/skills` | `~/.gemini/GEMINI.md` | — |
| `cursor` | — | `~/.cursor/rules/shipgate.mdc` | — |
| 自定义 | 配置里写 | 配置里写 | 可选 |

新 agent 不改代码即可接入，见 [docs/HARNESS.md](docs/HARNESS.md)。

## 升级与回滚

```bash
shipgate update --check     # 只查新版本
shipgate update             # 全局升级 + 重装 skills + 重渲染注入
shipgate status             # 每个 harness 装了什么
shipgate revoke claude      # 从备份恢复入口文档，撤销受管
shipgate rollback claude    # 只回滚注入文件
```

`config.json` 里 `update.autoUpdate: true` 时，`install` / `inject` 结束会自动升级一次（失败只告警）。

## 红线（设计如此，不是缺陷）

1. **security 闸永不自动执行**。没有 `--scope` 直接拒绝——主动探测类动作在错误范围上会构成违法。
2. **不改你的入口文档**。只写 `<!-- shipgate:begin -->…<!-- shipgate:end -->` 之间，首次改动前备份。
3. **不 fork 引擎**。aislop / cbh 是外部依赖，ShipGate 只做闸门判定与分发。
4. **不写凭据**。只记路径与开关。
5. **跑 `--prune` 只删自己装的 skill 目录**，且需 hash 匹配。

## 开发

```bash
git clone https://github.com/hhx465453939/ShipGate.git
cd ShipGate
node --test test/           # 零依赖测试
node bin/shipgate.mjs gates
```

改动必须走 `tasks/CHG-<id>/` 契约（本项目自己也要过 spec 闸）。架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 与相邻项目的关系

| 项目 | 关系 |
|---|---|
| [aislop](https://github.com/scanaislop/aislop) | quality 引擎（上游依赖，MIT） |
| [Claude-BugHunter](https://github.com/elementalsouls/Claude-BugHunter) | security 引擎（上游依赖，MIT） |
| agent-config-bridge | 硬门控产物的来源；已冻结，能力由本项目接管 |

## License

MIT
