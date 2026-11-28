---
change_id: CHG-20261128-trusted-publishing
version: 1
status: approved
approved_by: shpc_101170
approved_at: 2026-11-28
---

# TRACEABILITY — 发布凭据换成 OIDC

对应 CHG：`CHG-20261128-trusted-publishing` ｜ SPEC v1 ｜ 承接 `CHG-20261128-release-cicd`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 |
|---|---|---|---|---|
| G1 | 发布不再依赖长期 token | §2.1、§2.3 | M2、M4 | AC-3、AC-6 |
| G2 | 2FA 不再是发布阻塞项 | §2.1、§2.2 | M2 | AC-3、AC-6 |
| G3 | 过渡期不中断发布 | §2.3 | M2 | AC-3、AC-6 |
| G4 | 绑定步骤可自查 | §2.4、§2.5 | M3 | AC-7 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 | 实际改动 |
|---|---|---|
| M1 | `tasks/CHG-20261128-trusted-publishing/{PRD,SPEC,TRACEABILITY}.md` | 立契约 |
| M2 | `.github/workflows/release.yml` | publish job 加 `permissions.id-token: write`；加「升级 npm（OIDC 需要 ≥ 11.5.1）」步骤；`检查 NPM_TOKEN` 由阻断改为提示（OIDC 优先，token 仅 fallback） |
| M3 | `README.md` | 发版章节改为 OIDC 主路径：绑定字段表 + 必须勾 `Allow npm publish` + token 降为备用 |
| M4 | `.github/workflows/release.yml` | 阶段二：AC-6 验证通过后删除 token 注入与预检步骤 |

## 3. 验收执行记录（实测填入，未跑不勾）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs spec check` | ✅ 退出码 0，「12 个变更契约成立」，含 `CHG-20261128-trusted-publishing` | 2026-11-28 |
| AC-2 | `yaml.safe_load` 解析两个 workflow | ✅ `ci.yml` OK；`release.yml` OK，`publish.permissions = {'contents': 'read', 'id-token': 'write'}` | 2026-11-28 |
| AC-3 | `grep -n "id-token\|npm i -g npm@" .github/workflows/release.yml` | ✅ 42 行 `id-token: write`；51 行 `npm i -g npm@^11.15.0` | 2026-11-28 |
| AC-4 | `node --test test/*.test.mjs`；`node scripts/migrate-skillpack.mjs --check` | ✅ pass 74 / fail 0；技能包体检「27 技能 / 22 命令 / 2 subagent」通过 | 2026-11-28 |
| AC-5 | `node bin/shipgate.mjs quality .` | ✅ `score 86 ≥ 80，无 error 级发现` | 2026-11-28 |
| AC-6 | npm 侧绑定后 `gh workflow run release -f dry_run=false` 真发一次 | 待实测（阻塞：需在 npm 网页完成 Trusted Publisher 绑定） | - |
| AC-7 | `grep -n "Trusted Publisher\|Allow .npm publish\|id-token" README.md` | ✅ 188 行 Trusted Publisher 章节、194 行绑定路径、244 行 ENEEDAUTH 新口径 | 2026-11-28 |

## 4. 阶段二（待 AC-6 通过后执行）

删除 `release.yml` 中 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 与「检查 NPM_TOKEN」整段，并在报告里提示删除仓库 secret。在此之前，token 只是 fallback：npm 官方行为是「先检测 OIDC 并用它认证，失败才回退 token」。
