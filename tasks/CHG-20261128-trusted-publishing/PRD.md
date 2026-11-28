---
change_id: CHG-20261128-trusted-publishing
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-release-cicd
approved_by: shpc_101170
approved_at: 2026-11-28
---

# PRD — 发布凭据换成 OIDC（Trusted Publishing）

## 1. 背景（有据可查）

| 事实 | 证据 |
|---|---|
| 现状靠长期 token 发布 | `release.yml` 的 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` |
| 账号开了 2FA，token 反复踩坑 | 已踩两次：`ENEEDAUTH`（secret 名不符）、`EOTP`（token 未获免 2FA 写权限，run 46134527553） |
| npm 官方支持 OIDC 短时凭据 | docs.npmjs.com/trusted-publishers：npm CLI ≥ 11.5.1、Node ≥ 22.14.0，GitHub-hosted runner 支持 |
| 绑定后 token 仍可用，npm 优先 OIDC | 官方原文：accept publishes from authorized workflow, "in addition to traditional authentication methods"；CLI 先检测 OIDC 再回退 token |
| npm 网页绑定默认只给 stage 权限 | 2026-09-03 之后创建的配置"automatically set to allow `npm stage publish`"，直接 `npm publish` 需显式勾选 |

## 2. 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | CI 发布不再依赖长期 token | 发布日志显示走 OIDC；删除 `NPM_TOKEN` 后仍能发布 |
| G2 | 2FA 不再是发布阻塞项 | 无 token 场景下 `npm publish` 成功，不出现 `EOTP` |
| G3 | 过渡期不中断发布能力 | 绑定生效前保留 token fallback（npm 原生优先级：OIDC → token） |
| G4 | 绑定步骤可自查 | README 写明三个必填字段与「必须勾 Allow npm publish」这个坑 |

## 3. 范围

**做**：`release.yml` 加 `id-token: write`、升级 runner 上的 npm、token 降级为 fallback（第二阶段删除）；`README.md` 发版章节改为 OIDC 主路径并给出绑定步骤；本 CHG 三件套。

**不做**：

- 不改 `ci.yml`（CI 不发布，不需要 OIDC）。
- 不改 `src/` 任何运行时逻辑、不加依赖。
- 不改成 `npm stage publish`（需要人工 approve，当前流程不需要）。
- 不动自建 runner（npm 官方尚不支持）。

## 4. 风险

| 风险 | 缓解 |
|---|---|
| npm 侧只勾了 stage 权限 → `npm publish` 被拒 | README 与验收里显式要求勾 **Allow `npm publish`**；失败时按此排查 |
| runner 自带 npm 10.x，不满足 ≥ 11.5.1 | publish job 显式 `npm i -g npm@^11.15.0`（11.15 同时满足 CLI trust 子命令的版本线） |
| 绑定未生笑就删 token → 发布全断 | 分两阶段：先保留 token fallback 并验证 OIDC 生效，再删 token 与 secret |
| 仓库字段填错（repo/workflow 名） | 绑定字段与仓库实际值逐一对照：`hhx465453939/ShipGate` + `release.yml` |

## 5. 验收判据（AC）

- **AC-1** `node bin/shipgate.mjs spec check` 通过（含本 CHG）。
- **AC-2** 两个 workflow 文件 YAML 解析通过。
- **AC-3** `release.yml` 的 publish job 声明 `id-token: write`，并有 npm 升级到 ≥ 11.15.0 的步骤。
- **AC-4** `node --test test/*.test.mjs` 0 失败；`node scripts/migrate-skillpack.mjs --check` 通过。
- **AC-5** `node bin/shipgate.mjs quality .` ≥ 80 且无 error。
- **AC-6** npm 侧绑定后真实发布一次成功，日志显示使用 OIDC 身份（而非 token），且 registry 上新版本可下载。
- **AC-7** README 含绑定三字段与「必须勾 Allow npm publish」提示；`grep` 可验证。
