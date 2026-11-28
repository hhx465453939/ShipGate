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

# SPEC — 发版链路：常规 CI 补位、发布可重跑、流程写进仓库

## 1. 上下文

沿用：`.github/workflows/release.yml`（tag `v*` 触发 + `workflow_dispatch` 的 `dry_run` 开关）、`bin/shipgate.mjs`（自带 `spec check` / `quality`）、`scripts/migrate-skillpack.mjs --check`、`package.json`（`name=shipgate-cli`、`engines.node>=20`、`files` 白名单）。

不新增运行时依赖、不改 `src/`。

## 2. 设计

### 2.1 新增 `.github/workflows/ci.yml`（常规 CI）

触发：`push` 到 `main`、`pull_request` 到 `main`、`workflow_dispatch`。权限 `contents: read`，`concurrency` 按 ref 取消旧运行。

两个 job：

| job | 内容 | 失败处理 |
|---|---|---|
| `verify` | 矩阵 `node: [20, 22, 24]`，各跑 `node --test test/*.test.mjs`、`node scripts/migrate-skillpack.mjs --check`、`node bin/shipgate.mjs spec check` | `fail-fast: false`，任一版本红即 job 红 |
| `quality` | `npm i -g aislop@0.23.0` 后跑 `node bin/shipgate.mjs quality .` | 质量闸不通过即红（不设 `continue-on-error`） |

固定 aislop 版本的理由：闸的阈值与规则随版本变化，浮动版本会让同一份代码今天绿明天红。

### 2.2 `release.yml` 的 `publish` 加幂等防护

在真正的 `npm publish` 之前插入一步，用 `package.json` 的 `name` 与 `version` 查 registry：

```yaml
      - name: 版本是否已发布（幂等）
        id: published
        if: startsWith(github.ref, 'refs/tags/v') || (github.event_name == 'workflow_dispatch' && !inputs.dry_run)
        run: |
          pkg=$(node -p "require('./package.json').name")
          version=$(node -p "require('./package.json').version")
          if npm view "$pkg@$version" version >/dev/null 2>&1; then
            echo "already=true" >> "$GITHUB_OUTPUT"
            echo "::notice::$pkg@$version 已存在于 npm，跳过发布"
          else
            echo "already=false" >> "$GITHUB_OUTPUT"
          fi

      - name: npm publish
        if: (startsWith(github.ref, 'refs/tags/v') || (github.event_name == 'workflow_dispatch' && !inputs.dry_run)) && steps.published.outputs.already == 'false'
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- 只有 `npm view` 成功才判"已发布"；查询失败（网络/权限）一律按"未发布"继续走发布，避免把抖动当成"已发过"而静默漏发。
- 包名与版本一律从 `package.json` 读，不写死，避免改名后失效。
- 触发方式保持原样：发布只由 tag 或手动 dispatch 打开，push main 不发版（PRD G4）。

### 2.3 README 增加「发版与 CI/CD」

插入位置：`## 从源码开发` 之后、`## 与上游的关系` 之前。内容三块：

1. 两条流水线各管什么（ci / release）。
2. `NPM_TOKEN` 配置：npm 侧建 token（Granular Access Token，包权限 Read and write，或 Automation token）→ GitHub 侧 `Settings → Secrets and variables → Actions → New repository secret`，名字必须是 `NPM_TOKEN`。
3. 发版三步：改 `package.json` 版本 → `git tag v<版本> && git push origin v<版本>` → 看 Actions 结果；以及"只想验证不发版"用 `workflow_dispatch` + `dry_run=true`。

### 2.4 CI 首跑暴露的测试环境耦合（当场修，不留给后续）

首次 `workflow_dispatch` 实跑时 `verify` 红：`not ok 6 harnesses=auto 时默认取全部已探测 harness`。本地绿、CI 红，根因是测试直接断言真实 HOME 上装了 `claude`：CI runner 没有任何 harness 目录，断言必炸。

修法（改测试，不改产品代码）：用临时目录造两个 custom profile——`here`（`detect` 指向真实存在的目录）与 `gone`（`detect` 指向不存在路径）——断言 auto 结果包含 `here`、不包含 `gone`。这样验证的仍是 auto 的语义（只保留 detect 存在的项），但与宿主环境无关。

验证手段：`env HOME=<空目录> node --test test/*.test.mjs` 等价于 CI 干净环境，必须与正常 HOME 同为全绿。

## 3. 里程碑 → 独占文件

| M | 文件 | 改动 |
|---|---|---|
| M1 | `tasks/CHG-20261128-release-cicd/{PRD,SPEC,TRACEABILITY}.md` | 立契约 |
| M2 | `.github/workflows/ci.yml` | 新建：verify 矩阵 + quality 闸 |
| M3 | `.github/workflows/release.yml` | 加幂等检查步骤，publish 条件加 `already == 'false'` |
| M4 | `README.md` | 新增「发版与 CI/CD」章节 |
| M5 | `test/core.test.mjs` | 「auto 只取已探测 harness」用例改成受控 custom profile，去掉对真实 HOME 的依赖 |

## 4. 验收判据（AC）

- **AC-1** `node bin/shipgate.mjs spec check` 退出码 0，且输出包含 `CHG-20261128-release-cicd`。
- **AC-2** `python3 -c "import yaml,sys; [yaml.safe_load(open(p)) for p in sys.argv[1:]]" .github/workflows/*.yml` 解析通过。
- **AC-3** `node --test test/*.test.mjs` 失败数 0；`node scripts/migrate-skillpack.mjs --check` 退出码 0。
- **AC-4** `node bin/shipgate.mjs quality .` 输出 `score ≥ 80` 且无 error 级发现。
- **AC-5** `gh workflow run release -f dry_run=true` 后，该次 run 的 `verify` 与 `publish` 均 success。
- **AC-6** `grep -n "NPM_TOKEN" README.md` 命中，且该章节含 tag 发版命令。

- **AC-7** `env HOME=<空目录> node --test test/*.test.mjs` 与正常 HOME 同为 0 失败（CI 等价环境回归）。

## 5. 回滚

删除 `ci.yml`、还原 `release.yml` 的 publish 条件与步骤、删除 README 章节即可；无数据迁移、无兼容性影响。
