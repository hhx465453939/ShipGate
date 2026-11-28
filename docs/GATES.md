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

code 3 有两种含义，先分清再动手：

| 现象 | 含义 | 处置 |
|---|---|---|
| `aislop 未安装` / `cbh 未安装` | 引擎不在 PATH | `shipgate doctor` 里的 install 列给的命令可直接执行 |
| `aislop 输出无法解析（exit=…）` | 引擎在但跑不起来 | 单独跑 `aislop scan . --json` 看真实报错；`.cmd` 垫片启动问题、引擎崩溃都在这一类 |

### 引擎自检

```bash
shipgate doctor            # 引擎节：绝对路径 + 版本 +「bin 目录不在 PATH」告警
which aislop && aislop doctor          # Formatting/Linting/Code Quality/AI Slop 全 ready
which cbh && cbh --help                # cbh 无 --version，只能看子命令
```

引擎是**进程级共享**的：装在 PATH 上一次，所有 harness 的 shell 工具都能调；只有**闸用法 skill** 是按 harness 分发的。

## spec 闸细节

- 扫描 `cfg.spec.dir`（默认 `tasks`）下的 `CHG-*` 目录；也可直接指向一个 CHG 目录。
- 缺件、`status: draft`、无验收判据都判不通过。
- **没有 CHG 目录也判不通过**——"无契约"正是它要拦的情况。

## quality 闸细节

- 调 `aislop scan <dir> --json`，自己按 `--min` 判定，不依赖项目 `.aislop/config.yml`。
- `scoreable: false`（引擎未跑起来）按不通过处理，summary 里列出 `coverage.failedEngines`。
- 阈值优先级：`--min` > 项目 `.shipgate/config.json` > 全局配置 > 80。

### 引擎级错误（`engine-error`）与“未安装”、“输出无法解析”的区别

| 现象 | 含义 | 退出码 | 处置 |
|---|---|---|---|
| `aislop 未安装` / `cbh 未安装` | 引擎不在 PATH | 3 | 按 `shipgate doctor` 给的命令装 |
| `aislop 输出无法解析（exit=…）` | aislop 本身没跑起来 | 3 | 单独跑 `aislop scan . --json` 看真实报错 |
| `无法评分（ruff 引擎报错）` | aislop 跑了，但底层引擎崩了（诊断里是 `<engine>/engine-error`） | 3 | 看 `evidence.hint`；典型是老 glibc 上 aislop 自带的 Python 引擎加载失败 |
| `score < min` / `N 个 error 级发现` | 代码问题 | 1 | `aislop fix` 或改代码 |

判据：只有 `rule` 以 `engine-error` 结尾的诊断算引擎级错误；普通 finding 仍按 error 计，不会被降级成“环境问题”。

典型根因（实测）：aislop 0.23.0 的 `tools/python/linux-x64/aislop-python` 要求 GLIBC ≥ 2.34。Ubuntu 20.04（2.31）上它静默失败，ruff 输出为空 → aislop 记一条 `ruff/engine-error`。处置：`chmod a-x <该二进制>`（回退到 PATH 上的 ruff），`shipgate doctor` 会在引擎节直接报 `AISLOP_PYTHON_ENGINE_UNUSABLE` 并给出带绝对路径的命令。

## security 闸细节

- 只做**前置合规校验**：scope 存在、非空、有范围段落、cbh 在。
- 不自动发探测包（红线）。通过后打印 `cbh recon/surface/classify/triage` 的下一步。
- cbh 实际子命令：`recon` / `surface` / `diff` / `classify` / `triage` / `report` / `scope`；**没有 `--version`**（查版本用 `pip show claude-bughunter`）。
- 想把它变成自动扫描器是错的：主动探测在错误范围上会构成违法。

## ship 闸细节

校验每个受管 harness：

1. manifest 里记录的 skill 文件都在，且与源逐文件一致（判据同 `installSkills`：目的自加文件不算漂移）；
2. 注入文件里有 `<!-- shipgate:begin vN -->` 区块，**且版本等于当前模板的版本**（旧版残留区块算漂移）；
3. 带 gate 的 harness 有 `policy.js` 等硬门控产物。

谁能让它失败：

| 命令 | 行为 |
|---|---|
| `shipgate doctor` | 跑一遍一致性检查；有 finding 时退出码 1（体检必须能红） |
| `shipgate status --strict` | 同样的检查；不一致时退出码 1，适合 CI |
| `shipgate status` | 默认只是状态表，不校验、不改退出码 |

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

