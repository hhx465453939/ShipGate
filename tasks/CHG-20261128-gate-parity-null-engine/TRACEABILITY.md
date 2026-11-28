# TRACEABILITY — 闸判据与引擎探针的 null 安全

对应 CHG：`CHG-20261128-gate-parity-null-engine` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261128-gate-bundle-integrity`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 |
|---|---|---|---|---|
| G1 | 三条命令不再因 `pythonEngine: null` 崩溃 | §2.1 | M1、M2 | AC-1、AC-2 |
| G2 | 引擎缺失判断只有一份实现 | §2.1 | M1、M2 | AC-2 |
| G3 | ship 闸与 install 同判据 | §2.2 | M3 | AC-3 |
| G4 | 216 处误报归零 | §2.2 | M3 | AC-3 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 | 实际改动 |
|---|---|---|
| M1 | `src/lib/engines.mjs`、`src/commands/deploy.mjs` | `missingEngineHints` 排除 `pythonEngine` + `info?.bin`；install 尾部改用该函数 |
| M2 | `src/commands/gates.mjs` | `withOk` 构造时过滤探针；引擎行打印改走 `withOk.ok` |
| M3 | `src/gates/ship.mjs` | `hashFile(meta.hash)` → `sourceTreeDrift(srcDir, dstDir)`；删掉不可比的 manifest 哈希分支 |
| M4 | `test/topology.test.mjs` | 新增 2 条用例 |
| M5 | 无（运维动作） | 本机复验 + 全局部署 |

## 3. 验收执行记录（实测填入）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs install --yes` | ✅ 退出码 0；引擎节打印 `✔ aislop 0.23.0`、`✔ cbh (无版本开关)`；无 `Cannot read properties of null` | 2026-11-28 |
| AC-2 | `node bin/shipgate.mjs gates` | ✅ 退出码 0；引擎行 `aislop ok   cbh ok`，不再出现 `pythonEngine missing` | 2026-11-28 |
| AC-3 | `node bin/shipgate.mjs doctor` + 源码 grep | ✅ `产物一致性 ✔ 8 个 harness 的产物与 manifest 一致`；`grep -c "hash 与 manifest 不符" src/` 为 0（该分支已删除） | 2026-11-28 |
| AC-4 | `node --test test/*.test.mjs` | ✅ 73 tests / 71 pass / 0 fail / 2 skipped；新增两条用例通过（`pythonEngine 为 null 时不炸`、`目的自加文件不算漂移`） | 2026-11-28 |
| AC-5 | 重复 `install --yes` + `quality .` + `spec check` | ✅ 第二次 install 全「无变化」（幂等）；`quality .` score 86 ≥ 80、0 error；`spec check` 9 个契约成立 | 2026-11-28 |

## 4. 风险与备注

1. **运维动作不在代码里**：本机 233 个 `*.shipgate-bak.*` 历史备份已迁到 `~/.config/shipgate/backups/skill-bak-cleanup-2026-11-28/`（镜像原路径），未删除；这些是旧 `backupOnce` 直接写进 skill 目录的遗留，新代码已改为写 `backups/` 根外。
2. **`~/.codex/skills/<name>/agents/openai.yaml`**：codex 自带的产物，不是漂移。旧判据把它算进整棵哈希，新判据（`sourceTreeDrift`）忽略目的自加文件。
3. **manifest 哈希仍保留**：`record.skills[name].hash` 仍是 `hashTree(srcDir)`，`installSkills` 用它判断"是否要重拷"；本 CHG 只让 ship 闸不再拿它跟目的目录比。
4. **未做**：多端 commands / agents / MCP 分发（PRD §4 明确不做）。
