# 四道闸

| 闸 | 管什么 | 触发 | 引擎 | 通过判据 |
|---|---|---|---|---|
| spec | 改动有没有成立的契约 | 任何代码改动前 | 内置 | `tasks/CHG-*/` 三件齐全 + SPEC status 非 draft + 有 AC |
| quality | AI 留下的 slop | 每次编辑后 / 提交前 | aislop | `score >= min` 且无 error 级发现 |
| security | 授权范围内的漏洞面 | 提交前 / 发布前（显式） | cbh | scope 合法 + 引擎在 + 人为确认 |
| ship | 产物是否装到位 | 装 / 升级 / 换 harness | 内置 | manifest 与磁盘一致 |

## 退出码

| 码 | 含义 | 下一步 |
|---|---|---|
| 0 | 通过 | 继续 |
| 1 | 闸拦下 | 读 findings，修完重跑；不要改阈值绕过 |
| 2 | 用法错 | 例如 security 缺 `--scope` |
| 3 | 环境缺 | 引擎未装 / 输出无法解析 |

## spec 闸细节

- 扫描 `cfg.spec.dir`（默认 `tasks`）下的 `CHG-*` 目录；也可直接指向一个 CHG 目录。
- 缺件、`status: draft`、无验收判据都判不通过。
- **没有 CHG 目录也判不通过**——"无契约"正是它要拦的情况。

## quality 闸细节

- 调 `aislop scan <dir> --json`，自己按 `--min` 判定，不依赖项目 `.aislop/config.yml`。
- `scoreable: false`（引擎未跑起来）按不通过处理，summary 里列出 `coverage.failedEngines`。
- 阈值优先级：`--min` > 项目 `.shipgate/config.json` > 全局配置 > 80。

## security 闸细节

- 只做**前置合规校验**：scope 存在、非空、有范围段落、cbh 在。
- 不自动发探测包（红线）。通过后打印 `cbh recon/surface/classify/triage` 的下一步。
- 想把它变成自动扫描器是错的：主动探测在错误范围上会构成违法。

## ship 闸细节

校验每个受管 harness：

1. manifest 里记录的 skill 文件都在，且 hash 与源一致；
2. 注入文件里有 `<!-- shipgate:begin -->` 区块；
3. 带 gate 的 harness 有 `policy.js` 等硬门控产物。

`shipgate status` 是它的输出视图，`shipgate doctor` 会额外跑一遍一致性检查。

## 技能包与闸的联动

四道闸不是孤立的命令：技能包里的 skill 会在对应时机调用它们。

| 阶段 | skill | 触发哪道闸 |
|---|---|---|
| 立项 / 改需求 | `ai-spec`、`prd`、`intent-grill` | 写完后 `shipgate spec check` |
| 写代码 | `goal-driven-development`、`ralph` | 每次编辑后 `shipgate quality` |
| 调试 | `code-debugger`、`debug-ui` | 修完 `shipgate quality` |
| 审查 | `code-review`、`security-audit` | `shipgate quality` + `shipgate security --scope` |
| 发布 | `nodejs-npm-auto-release`、`gh-actions-architect` | 提交前两道闸都要绿 |

纪律：skill 负责「怎么做」，闸负责「过不过」。skill 写完代码不能自己宣告完成，必须跑闸拿到退出码。

## 硬门控与闸的区别（别混）

| | 硬门控（gate bundle） | 四道闸（shipgate gates） |
|---|---|---|
| 作用时机 | agent 执行命令时 | 阶段交付时 |
| 拦截方式 | 进程级：直接拦下命令 | 退出码：判不通过，交给人/agent 修 |
| 覆盖 harness | pi / dsh（有 hook 面） | 全部 |
| 策略来源 | `shipgate policy` | `shipgate quality --min` 等 |

