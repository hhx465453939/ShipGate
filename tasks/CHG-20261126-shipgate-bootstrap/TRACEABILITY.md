# TRACEABILITY — ShipGate v0.1

对应 CHG：`CHG-20261126-shipgate-bootstrap` ｜ SPEC v1 ｜ PRD 已批准

## 1. 需求 → 设计 → 交付 → 验收

| # | PRD 需求 | SPEC 落点 | 里程碑 | 验收判据 | 验证证据（命令） |
|---|---|---|---|---|---|
| R1 | 一条命令完成部署，幂等 | §3 `install`、§4.2 托管区块、§4.3 manifest | M3、M5 | AC-4、AC-5 | `install --dry-run`（不写盘）→ 实跑两次 → `diff` 注入文件 |
| R2 | 换 harness 不改代码 | §2.1 `src/harness/*`、§3 `--harness` | M3 | AC-4、AC-7 | `install --harness codex` + `status --json` |
| R3 | 注入段让 agent 知道何时用何工具 | §4.2、`templates/agents-snippet.md`、`skills/shipgate` | M3、M5 | AC-5 | 渲染产物包含四闸触发时机表 |
| R4 | 闸能真拦（非零退出码） | §5 四道闸、§3 退出码约定 | M2、M4 | AC-2、AC-3、AC-6 | `spec check` 空目录/成立契约两种输入各跑一次 |
| R5 | 全局更新一次 + 各 harness 重部署可审计 | §4.1 配置、§4.3 manifest、`status` | M3、M5 | AC-7、AC-8 | `status --json` 输出 hash/installedAt |
| R6 | 上游契约（ai-spec）纳入闸链 | §5 spec 闸 | M2 | AC-2、AC-3 | `spec check tasks/CHG-20261126-shipgate-bootstrap` |
| R7 | 中游质量（aislop）纳入闸链 | §5 quality 闸 | M4 | AC-6 | 未装引擎 → 退出码 3；装后按 `--min` 判定 |
| R8 | 下游安全（cbh）纳入闸链，且不可自动跑 | §5 security 闸、§6 红线 | M4 | AC-6 | 无 `--scope` → 退出码 2 |
| R9 | 零依赖、轻量 | §1 约束、§2 架构（Node 内置模块） | M1 | AC-1、AC-8 | `package.json` 无 `dependencies`；`node --test` 全绿 |
| R10 | 不覆盖主人手写注入文件 | §4.2 幂等规则 + 备份 | M3 | AC-5 | 注入前后比对"区块外行数不变" |
| R11 | 接管 bridge 的硬门控产物（pi/dsh 等自由度高的 harness） | §2.2 gate 列、`assets/pi-gate/` | M6 | AC-9 | `install --harness pi` 后 `policy.json` hash 与源一致 |
| R12 | 受管 / 撤回 / 回滚（取代 bridge 的 adopt-revoke-rollback） | §3 `adopt`/`revoke`/`rollback` | M6 | AC-10 | `adopt` → `status` managed:true → `revoke` 恢复备份 |
| R13 | 全局固定安装 + 更新检查/自更新（不用 npx 临时装） | §4.4、§4.5、`update` | M6 | AC-11、AC-12 | `update --check` 离线不抛栈；同日第二次启动无网络请求 |
| R14 | 本机即参考部署，产物清单以实测为基准 | §1 参考部署、§2.2 | M3/M6 | AC-4、AC-9 | 本机 `install` 后目录清单与 SPEC §2.2 一致 |

## 2. 非目标对照（防范围蔓延）

| PRD §4 非目标 | 落实方式 |
|---|---|
| 不 fork aislop / cbh / 85 skills | `package.json` 无对应依赖；`src/gates/*` 只做 `exec` 委派 |
| 不接管 bridge 的 apply | 不 import `agent-config-bridge`；`dsh` 留 generic adapter 配置项 |
| 不做 UI / MCP | 无 `src/mcp*`、无前端产物 |
| 不自动跑 security | 代码层无 hook 注册；`install` 不含 security 调用 |

## 3. 里程碑 → 独占文件清单（防并发冲突）

| M | 独占文件 |
|---|---|
| M1 | `package.json` `bin/shipgate.mjs` `src/cli.mjs` `src/lib/*.mjs` `src/version.mjs` |
| M2 | `src/gates/spec.mjs` |
| M3 | `src/harness/index.mjs` `src/inject/render.mjs` `templates/agents-snippet.md` `assets/pi-gate/**` |
| M4 | `src/gates/{quality,security}.mjs` `src/gates/ship.mjs` |
| M5 | `skills/**` `docs/**` `test/**` `README.md` `AGENTS.md` `LICENSE` `.gitignore` |
| M6 | `src/commands/{adopt,revoke,rollback,update}.mjs` `src/lib/state.mjs` `src/lib/update.mjs` |

## 4. 验收执行记录（实现完成后逐条填，禁止预先勾选）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs gates` | ✅ exit 0：四道闸表 + 引擎状态（aislop ok / cbh missing） | 2026-11-26 |
| AC-2 | `node bin/shipgate.mjs spec check /tmp/sg-empty` | ✅ exit 1：输出「没有任何 CHG-* 变更目录」 | 2026-11-26 |
| AC-3 | `spec check tasks/CHG-20261126-shipgate-bootstrap` | ✅ exit 0：「1 个变更契约成立」 | 2026-11-26 |
| AC-4 | `install --dry-run --harness claude` | ✅ 列出 5 个 skill + 注入文件；`CLAUDE.md` mtime 1795703557 前后未变 | 2026-11-26 |
| AC-5 | 连续两次 `install --harness claude` | ✅ 两次 md5 均为 `2d1cb927…`；479 → 500 行（仅追加 21 行区块）；备份 `CLAUDE.md.shipgate-bak.2026-11-26` | 2026-11-26 |
| AC-6 | `quality`（PATH 无 aislop）/ `security`（无 scope） | ✅ quality exit 3 且打印 `npm i -g aislop`；security exit 2 直接拒绝 | 2026-11-26 |
| AC-7 | `status --json` / `status` | ✅ claude `managed` 5 skills `v1`；pi `managed` 5 skills + gate present | 2026-11-26 |
| AC-8 | `node --test test/*.test.mjs` | ✅ 26/26 pass | 2026-11-26 |
| AC-9 | `install --harness pi` + hash 比对 | ✅ `policy.js` md5 `905babde…` 与 assets 一致；既有 `policy.json` 保留 | 2026-11-26 |
| AC-10 | `adopt claude` → `status` → `revoke claude` | ✅ managed:true → revoke 后区块计数 0 → 重装恢复 1 | 2026-11-26 |
| AC-11 | `update --check`（离线/弱网） | ✅ exit 0，不抛栈；提示 `2.1.0`（npm 同名包占位，见备注） | 2026-11-26 |
| AC-12 | 同日两次 `gates` | ✅ 第二次无版本查询提示（`~/.cache/shipgate/last-update-check` = 当天） | 2026-11-26 |

## 5. 备注与遗留风险

1. **npm 包名冲突（阻塞发版，不影响本地使用）**：`npm view shipgate` = `2.1.0`，仓库 `Ship-Gate/ShipGate`，描述「Stop AI from shipping fake features」，与本项目语义高度重叠。发布前必须改名或改用 scope（如 `@<owner>/shipgate`、`shipgate-cli`）。
2. **本机 oxlint 不可用**：CPU 仅 `sse4_2`（无 AVX2），oxlint 二进制直接 SIGILL；因此本机 `aislop` 的 lint 引擎恒失败、`scoreable=false`，quality 闸按不通过处理（不假绿）。已在 `quality` 的 `evidence.hint` 给出处置（项目内 `engines.lint: false` 或换 CI 机器）。
3. `assets/pi-gate/` 为 vendored 上游产物，quality 闸默认 `--exclude`，不参与本仓评分；升级时整体覆盖并在 CHANGELOG 记来源 hash。
