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
| — | CI 首跑暴露的测试环境耦合 | §2.4 | M5 | AC-7 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 | 实际改动 |
|---|---|---|
| M1 | `tasks/CHG-20261128-release-cicd/{PRD,SPEC,TRACEABILITY}.md` | 立契约 |
| M2 | `.github/workflows/ci.yml` | 新建：`verify`（node 20/22/24 × 测试 + 技能包体检 + 契约闸）+ `quality`（aislop@0.23.0 固定版本） |
| M3 | `.github/workflows/release.yml` | 新增 secret 预检与「版本是否已发布（幂等）」两步；`npm publish` 条件追加 `steps.published.outputs.already == 'false'` |
| M4 | `README.md` | 新增「## 发版与 CI/CD」章节（两条流水线分工 + NPM_TOKEN 配置 + 三步发版 + 排错口径） |
| M5 | `test/core.test.mjs` | 「auto 只取已探测 harness」用例去掉对真实 HOME 的断言，改用受控 custom profile（`here` / `gone`） |

## 3. 验收执行记录（实测填入，未跑不勾）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node bin/shipgate.mjs spec check` | ✅ 退出码 0，「11 个变更契约成立」，输出含 `CHG-20261128-release-cicd` | 2026-11-28 |
| AC-2 | `python3 -c "yaml.safe_load(...)"` 解析两个 workflow | ✅ `ci.yml` jobs=`['verify','quality']`；`release.yml` jobs=`['verify','publish']` | 2026-11-28 |
| AC-3 | `node --test test/*.test.mjs`；`node scripts/migrate-skillpack.mjs --check` | ✅ tests 75 / pass 74 / fail 0 / skipped 1（win32-only 用例）；技能包体检「27 技能 / 22 命令 / 2 subagent」通过 | 2026-11-28 |
| AC-4 | `node bin/shipgate.mjs quality .` | ✅ `score 86 ≥ 80，无 error 级发现` | 2026-11-28 |
| AC-5 | `gh workflow run release -f dry_run=true`（run 46129933087）；push main 触发的 ci（run 46129909913） | ✅ release：`verify` success + `publish` success（日志为 `npm publish --dry-run`，未真发）；✅ ci：`verify(20/22/24)` + `quality` 四个 job 全 success | 2026-11-28 |
| AC-6 | `grep -n "NPM_TOKEN" README.md` | ✅ 命中 189/191/212/218 行；发版命令 `git tag v… && git push origin v…` 在 234 行 | 2026-11-28 |
| AC-7 | `env HOME=/tmp/sg-empty-home node --test test/*.test.mjs` | ✅ 74 pass / 0 fail，与正常 HOME 结果一致（修复前该场景必红） | 2026-11-28 |
| AC-8 | `gh workflow run release -f dry_run=false`（NPM_TOKEN 尚未配置，run 46132822308） | ✅ 第 7 步「检查 NPM_TOKEN（secret 名对齐）」failure，其后 `幂等`/`npm publish` 全部 skipped，未误发；失败注释直接落在该步，文案指向 secret 配置路径与「不支持改名」 | 2026-11-28 |

## 4. 首次实跑失败与修复（不掩盖）

| 项 | 内容 |
|---|---|
| 现象 | 首次 `workflow_dispatch dry_run=true`（run 46128771005）`verify` 红，`not ok 6 - harnesses=auto 时默认取全部已探测 harness` |
| 本地差异 | 本机 74 pass / 0 fail（因为本机装了 claude，`~/.claude` 存在） |
| 根因 | 测试直接断言真实 HOME 中存在 `claude`：CI runner 无任何 harness 目录 → auto 结果为空 → 断言必炸。是**测试与环境耦合**，不是 CI 配置错误 |
| 修复 | M5：用临时目录造 `here`（detect 存在）/ `gone`（detect 不存在）两个 custom profile，断言 auto 只含 `here`。语义不变（auto = 只保留 detect 存在的项），与环境无关 |
| 验证 | 正常 HOME 与空 HOME 两个场景各 74 pass / 0 fail；CI 复跑全绿 |
| 教训 | 断言"本机装了什么"的测试在 CI 上必红；验证探测类逻辑要喂受控输入，不读宿主状态 |

## 5. 真实发布失败与修复（v0.2.1，run 46132387855）

| 项 | 内容 |
|---|---|
| 现象 | `publish` 在 `npm publish` 步骤红：`npm error code ENEEDAUTH` / `need auth` |
| 断言需要证伪的第一个假设 | 以为是 token 权限不足（granular token 没勾 Read and write）。**被否掉**：权限不足应报 `E403`，`ENEEDAUTH` 是"没有任何凭据" |
| 根因 | `gh secret list` 只有 `NPM20261128`；workflow 读 `secrets.NPM_TOKEN`。名字不匹配 → 该表达式为空串 → setup-node 写进 `.npmrc` 的 `_authToken=${NODE_AUTH_TOKEN}` 成了空值 → npm 认为未登录 |
| 修复 | 1) 仓库侧：新建 secret `NPM_TOKEN`（GitHub 不支持改名，需重新粘贴值）并删旧名；2) 代码侧：`release.yml` 加 secret 预检，缺 token 时 error 注释直接点名配置路径（AC-8） |
| 教训 | 凭据类的 `ENEEDAUTH` 先查"名字对不对"，再查"权限够不够"；两者报错码不同（ENEEDAUTH vs E403） |
