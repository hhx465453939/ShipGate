# TRACEABILITY — `shipgate gates` 的引擎提示改成真话

对应 CHG：`CHG-20261128-gates-engine-hint` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261128-engines-onboarding`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| G1 | `gates` 不再自相矛盾 | §2.2 | M3 | AC-1 | 实跑输出 + `PATH=''` 缺失场景 |
| G2 | 安装提示单一真源 | §2.1 | M1、M2 | AC-2 | `resolveAislop` 定义数 = 1 |
| G3 | 缺引擎提示本机可执行 | §2.1 | M1 | AC-1、AC-4 | 缺失场景打印 clone + 显式索引命令 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `src/lib/engines.mjs`（新增：`resolveAislop` / `cbhInstallHint` / `checkEngines` / `reportEngines` / `missingEngineHints`） |
| M2 | `src/gates/quality.mjs`（改从 lib 取）、`src/commands/deploy.mjs`（删本地副本，修被并成一行的函数头） |
| M3 | `src/commands/gates.mjs`（条件化输出 + JSON 升级） |
| M4 | `test/topology.test.mjs` |

## 3. 验收执行记录（实测填入）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `shipgate gates` | ✅ 引擎齐全时输出 `aislop ok   cbh ok`，**不再出现**「缺失引擎」字样；`PATH=''` 场景（node 直接调 `listGates`）输出 `aislop missing   cbh missing` + 逐条命令：`aislop → npm i -g aislop`、`cbh → git clone … "$HOME\.local\src\Claude-BugHunter"; python -m pip install --user -i https://pypi.org/simple …` | 2026-11-28 |
| AC-2 | `grep -rn "function resolveAislop" src` | ✅ 命中 1 处（`src/lib/engines.mjs:12`）；`src/commands/deploy.mjs` 本地引擎函数残留 0 个；lib 导出 5 个函数 | 2026-11-28 |
| AC-3 | `shipgate doctor` / `shipgate status` | ✅ 引擎节不变：`✔ aislop 0.23.0 …`、`✔ cbh (无版本开关) …`；产物一致性 `8 个 harness 的产物与 manifest 一致`；status 8 行全 `managed / 27 / v3`（antigravity inject `-` 为设计） | 2026-11-28 |
| AC-4 | `node --test test/*.test.mjs` | ✅ 65/65 通过；新增用例 `missingEngineHints：齐全时为空，缺哪个就只给哪个的命令` | 2026-11-28 |
| AC-5 | `shipgate spec check` / `shipgate quality` | ✅ spec：7 个契约成立；quality：`score 85 ≥ 80，无 error 级发现` | 2026-11-28 |

## 4. 风险与备注

1. **发现场景**：本 CHG 是「全局部署核验」时发现的——`shipgate gates` 在同一次输出里先写 `aislop ok  cbh ok`、紧接着写「缺失引擎：npm i -g aislop / pipx install git+…」。这类自相矛盾会直接让 agent 去装已经装好的东西，属于必须当场修的缺陷。
2. **JSON 契约变化**：`shipgate gates --json` 的 `engines` 从布尔升为完整对象（`bin` / `version` / `path` / `onPath` / `install` / `ok`），`ok` 保留供脚本沿用。目前仓内没有消费方依赖旧形态（`grep` 确认）。
3. **顺手修的**：`deploy.mjs` 里上一轮编辑把 `export function checkEngines(ctx) {` 与函数体第一行并成了一行；搬到 lib 时已恢复正常格式。
4. **没有改动**：闸的判定逻辑、退出码、doctor/install 的输出格式都未变；`resolveAislop` 的解析顺序（项目本地 `node_modules/.bin` 优先，其次 PATH）原样保留。
5. **quality 分数从 86 → 85**：新增 `lib/engines.mjs` 拆分后覆盖面变化所致，仍远高于阈值，且 error 级发现为 0。
