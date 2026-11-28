---
change_id: CHG-20261128-release-cicd
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-gate-truthfulness
approved_by: shpc_101170
approved_at: 2026-11-28
---

# PRD — 发版链路：常规 CI 补位、发布可重跑、流程写进仓库

## 1. 背景（实测现状，不是假设）

| 事实 | 证据 |
|---|---|
| 远端已有 `release.yml`，状态 active | `gh workflow list` → `release active 432276298` |
| 它**一次都没跑过** | `gh run list` 返回空；本地 `git tag -l` 为空 |
| npm 上 `shipgate-cli` **还不存在** | `npm view shipgate-cli` → `E404 Not Found` |
| 本机 npm 未登录 | `npm whoami` → `ENEEDAUTH`，发布只能走 CI |

由此得到三个真实缺口：

| # | 缺口 | 后果 |
|---|---|---|
| 1 | 只有 tag 触发 `verify`，**push main / PR 不跑任何测试** | 坏代码能一路进 main，直到打 tag 才发现，回滚成本被放大 |
| 2 | `publish` 无幂等防护 | 版本已存在于 npm 时再 `npm publish` 报 E403，红灯掩盖真问题（重跑 dispatch、tag 重推都会踩） |
| 3 | 发版流程与 `NPM_TOKEN` 配置**不在仓库里** | 只有人脑记得；换机器/换人就从零摸索（本次即为此返工） |

## 2. 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | 每次 push main 与 PR 都过测试与三道仓库级闸 | `ci.yml` 在 push/pull_request 触发且失败即红 |
| G2 | 发布可安全重跑 | 版本已在 npm 时跳过发布并标记 notice，job 仍绿 |
| G3 | 发版流程可自查 | README 有「发版与 CI/CD」章节，含 `NPM_TOKEN` 两种 token 的创建路径与 secret 名 |
| G4 | 发布开关仍只有一个 | 发布只由 `v*` tag 或手动 dispatch 触发，push main 绝不自动发版 |

## 3. 范围

**做**：新增 `.github/workflows/ci.yml`；在 `release.yml` 的 `publish` 前加版本存在性检查；`README.md` 增加「发版与 CI/CD」一章节；本 CHG 三件套。

**不做**：

- 不做 push main 自动 bump 版本（会让每次合并都发版，发布权应留在人手上）。
- 不加 npm provenance（首次发布前不引入新的失败面，列为本 CHG 之后的可选项）。
- 不改 `src/` 下任何运行时逻辑，不改 `assets/`。
- 不把 `NPM_TOKEN` 的任何真实值写进仓库（只写 secret 名与配置路径）。

## 4. 风险

| 风险 | 缓解 |
|---|---|
| CI 新增 aislop 外部依赖，版本漂移导致红绿不稳 | 固定 `aislop@0.23.0`（与本机实测版本一致） |
| Node 矩阵（20/22/24）拉长 CI 时长 | 每个版本只跑三件套且零依赖，实测 < 1s/次；`fail-fast: false` 便于定位 |
| 质量闸在 CI 里首次跑就红 | 提交前本地实跑 `shipgate quality .`，实测 86 分通过才提交 |
| 幂等检查误判（npm 网络抖动返回空） | 只有 `npm view` **成功且取到版本号**才判"已发布"，失败一律当"未发布"继续发布 |

## 5. 验收判据（AC）

- **AC-1** `node bin/shipgate.mjs spec check` 通过，含本 CHG。
- **AC-2** 两个 workflow 文件均能被 YAML 解析器解析通过。
- **AC-3** `node --test test/*.test.mjs` 全绿；`node scripts/migrate-skillpack.mjs --check` 通过。
- **AC-4** `node bin/shipgate.mjs quality .` ≥ 80 且无 error 级发现。
- **AC-5** `gh workflow run release -f dry_run=true` 实跑成功：`verify` 与 `publish --dry-run` 两 job 绿。
- **AC-6** README 中存在 `NPM_TOKEN` 配置步骤与发版三行命令。
