# TRACEABILITY — 闸要说真话

对应 CHG：`CHG-20261128-gate-truthfulness` ｜ SPEC v1 ｜ 承接 `CHG-20261128-gate-parity-null-engine`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 |
|---|---|---|---|---|
| G1 | 产物漂移能让命令失败 | §2.3 | M3 | AC-3、AC-4 |
| G2 | 注入区块版本参与校验 | §2.2 | M2 | AC-2 |
| G3 | `spec check <dir>` 接受仓库根 | §2.1 | M1 | AC-1 |
| G4 | 未探测 harness 文案与行为一致 | §2.4 | M4 | AC-5 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 | 实际改动 |
|---|---|---|
| M1 | `src/gates/spec.mjs` | 抽出 `changeDirsIn()`；`runSpecGate` 在 `<dir>` 无契约时下探一层 `<dir>/tasks`；错误信息保留用户传入的路径 |
| M2 | `src/inject/render.mjs`、`src/gates/ship.mjs` | 新增 `expectedBlockVersion()`（从模板解析，单一真源）；ship 闸比对区块版本 |
| M3 | `src/commands/deploy.mjs` | `doctor` 改 `return ship.ok ? 0 : 1`；`status --strict` 跑同一检查并返回 1（json 模式附带 `ship` 字段） |
| M4 | `src/commands/deploy.mjs` | `reportMissing` 去掉"跳过"，改为"按显式指定预装" |
| M5 | `docs/GATES.md`、`test/topology.test.mjs` | ship 闸细节重写；新增 2 条回归用例 |

## 3. 验收执行记录（实测填入）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs spec check E:/Development/ShipGate` 与 `… /tasks` | ✅ 两个入口都识别到同一份契约（用例断言 `viaRoot.evidence.changes === ['CHG-20260101-probe']` 且 `viaTasks.ok === true`）；仓库根传参不再报"没有任何 CHG-*"。空仓库根仍 `code 1` | 2026-11-28 |
| AC-2 | `node --test` 用例「注入区块版本旧于模板时报错」 | ✅ `<!-- shipgate:begin v2 -->` 产出 `注入区块是 v2，当前版本是 v3`；写模板版本（`expectedBlockVersion()`）时 0 findings | 2026-11-28 |
| AC-3 | `node bin/shipgate.mjs doctor; echo $?` | ✅ 本机一致时 `exit=0`；实现为 `return ship.ok ? 0 : 1`，出现 finding 即 1（原先无条件 0） | 2026-11-28 |
| AC-4 | `node bin/shipgate.mjs status --strict; echo $?` / 默认 `status` | ✅ `--strict` 本机一致时 `exit=0`，不一致路径返回 1 并打印同款 findings；默认 `status` 仍是只读表、不改退出码 | 2026-11-28 |
| AC-5 | `grep -n "按显式指定预装" src/commands/deploy.mjs` | ✅ 文案已改（`已按显式指定预装；不想预装就不要把它写进 --harness`）。**本机 8 个 harness 全部探测到，无法触发 missing 分支**——行为由代码保证，未做伪装实测 | 2026-11-28 |
| AC-6 | `node --test test/*.test.mjs` + 四道自检 | ✅ 75 tests / 73 pass / 0 fail；`spec check`、`quality .`、`migrate-skillpack --check` 通过 | 2026-11-28 |

## 4. 风险与备注

1. **`doctor` 退出码变更**：从恒 0 改为有 finding 时 1。这是修复而非回归——它本来就在打印 `✖`。
2. **`spec check` 下探只一层**：不递归搜索，避免把 `node_modules` 里别人的 `tasks/` 认成契约。
3. **AC-5 未做端到端实测**：本机不存在"未安装的 builtin harness"，构造它需要改用户 `config.json`，代价大于收益；用代码 + grep 记录，不假装测过。
4. **#2 / #4 已在 `d4f0575` 修复**（ship 闸哈希口径、`gates` 的 `pythonEngine`），本 CHG 不重复。
