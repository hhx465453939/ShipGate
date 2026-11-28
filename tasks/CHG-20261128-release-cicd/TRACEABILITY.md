---
change_id: CHG-20261128-release-cicd
version: 1
status: approved
approved_by: shpc_101170
approved_at: 2026-11-28
---

# TRACEABILITY — 发版链路

对应 CHG：`CHG-20261128-release-cicd` ｜ SPEC v1 ｜ 承接 `CHG-20261128-gate-truthfulness`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 |
|---|---|---|---|---|
| G1 | push main / PR 都过闸 | §2.1 | M2 | AC-2、AC-3、AC-5 |
| G2 | 发布可安全重跑 | §2.2 | M3 | AC-2、AC-5 |
| G3 | 发版流程写进仓库 | §2.3 | M4 | AC-6 |
| G4 | 发布只由 tag/dispatch 打开 | §2.2 | M3 | AC-2、AC-5 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 | 实际改动 |
|---|---|---|
| M1 | `tasks/CHG-20261128-release-cicd/{PRD,SPEC,TRACEABILITY}.md` | 立契约 |
| M2 | `.github/workflows/ci.yml` | 新建：`verify`（node 20/22/24 × 测试 + 技能包体检 + 契约闸）+ `quality`（aislop@0.23.0 固定版本） |
| M3 | `.github/workflows/release.yml` | 新增「版本是否已发布（幂等）」步骤；`npm publish` 条件追加 `steps.published.outputs.already == 'false'` |
| M4 | `README.md` | 新增「## 发版与 CI/CD」章节（两条流水线分工 + NPM_TOKEN 配置 + 三步发版 + dry-run 验证） |

## 3. 验收执行记录（实测填入，未跑不勾）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs spec check` | 待实测 | - |
| AC-2 | `python3` + `yaml.safe_load` 解析 `.github/workflows/*.yml` | 待实测 | - |
| AC-3 | `node --test test/*.test.mjs`；`node scripts/migrate-skillpack.mjs --check` | 待实测 | - |
| AC-4 | `node bin/shipgate.mjs quality .` | 待实测 | - |
| AC-5 | `gh workflow run release -f dry_run=true` + `gh run watch` | 待实测（依赖 commit/push 与远端 runner） | - |
| AC-6 | `grep -n "NPM_TOKEN" README.md` | 待实测 | - |
