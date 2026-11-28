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

# SPEC — 发布凭据换成 OIDC（Trusted Publishing）

## 1. 上下文

沿用：`.github/workflows/release.yml`（`verify` + `publish` 两个 job，触发为 `v*` tag 或 `workflow_dispatch`）、现有的 tag/版本一致性校验与发布幂等检查、`package.json`（`name=shipgate-cli`，`repository.url` 指向本仓库）。

不新增运行时依赖；不改 `src/`。

## 2. 设计

### 2.1 publish job 增加 OIDC 权限

workflow 顶层已有 `permissions: contents: read`。在 **publish job 级**追加 `id-token: write`，把权限收窄到真正需要 OIDC 的那一个 job：

```yaml
  publish:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # OIDC：让 npm 用 GitHub 签发的短时凭据认证
```

`verify` job 不涉及发布，不授予 `id-token: write`。

### 2.2 升级 runner 上的 npm

`actions/setup-node@v4` + `node-version: 22` 自带 npm 10.x，低于 OIDC 要求的 11.5.1。在 publish job 里、`npm publish` 之前显式升级：

```yaml
      - name: 升级 npm（OIDC 需要 ≥ 11.5.1）
        run: npm i -g npm@^11.15.0
```

选 11.15.0 而不是 11.5.1：同一条线也满足 `npm trust` 子命令的版本要求，便于将来用 CLI 管理绑定。

### 2.3 token 降级为 fallback（分两阶段）

npm CLI 的行为是「先检测 OIDC 环境并用它认证，失败才回退到 token」，因此阶段一可以**同时保留** token：

- **阶段一（本次提交）**：保留 `NPM_TOKEN` 注入与 `检查 NPM_TOKEN` 预检，但把预检从「必须有 token」改为「提示性」——不阻断，因为 OIDC 已可用。
- **阶段二（AC-6 验证通过后）**：删除 `NODE_AUTH_TOKEN` 注入、删除 secret 预检步骤、删除仓库 secret `NPM_TOKEN`。

阶段划分的理由：绑定字段一旦填错，OIDC 会失败；此时若无 token fallback，发布能力直接归零。

### 2.4 npm 侧绑定（人工，一次性）

npm 包页面 → **Settings** → **Trusted Publisher** → 选 **GitHub Actions**：

| 字段 | 值 |
|---|---|
| Organization or user | `hhx465453939` |
| Repository | `ShipGate` |
| Workflow filename | `release.yml`（只写文件名，含扩展名） |
| Environment name | 留空 |
| Allowed actions | **必须勾上允许 `npm publish`**（默认只勾 stage publish，会被拒） |

CLI 等价（本机需先 `npm login`，且账号级 2FA 已开、不能用 bypass-2FA 的 granular token）：

```bash
npm trust github shipgate-cli \
  --repo hhx465453939/ShipGate \
  --file release.yml \
  --allow-publish
```

### 2.5 README 发版章节改写

`## 发版与 CI/CD` 里把 `NPM_TOKEN` 从「必需」降为「OIDC 未绑定时的备用路径」，并补：绑定步骤表格、`Allowed actions` 必须勾 `npm publish`、以及「token 可在验证通过后删除」。

## 3. 里程碑 → 独占文件

| M | 文件 | 改动 |
|---|---|---|
| M1 | `tasks/CHG-20261128-trusted-publishing/{PRD,SPEC,TRACEABILITY}.md` | 立契约 |
| M2 | `.github/workflows/release.yml` | publish job 加 `id-token: write`、加 npm 升级步骤、预检改为提示性 |
| M3 | `README.md` | 发版章节改为 OIDC 主路径，附绑定字段表与 `Allow npm publish` 提醒 |
| M4 | `.github/workflows/release.yml` | **阶段二**：删除 token 注入与预检（仅在 AC-6 通过后执行） |

## 4. 验收判据（AC）

- **AC-1** `node bin/shipgate.mjs spec check` 退出码 0，输出含 `CHG-20261128-trusted-publishing`。
- **AC-2** `yaml.safe_load` 解析 `ci.yml` 与 `release.yml` 均通过。
- **AC-3** `release.yml` 中 publish job 含 `id-token: write`，且存在 `npm i -g npm@^11.15.0` 步骤（`grep` 可验证）。
- **AC-4** `node --test test/*.test.mjs` 失败 0；`node scripts/migrate-skillpack.mjs --check` 退出码 0。
- **AC-5** `node bin/shipgate.mjs quality .` 输出 score ≥ 80 且无 error。
- **AC-6** 绑定生效后真实发布一次成功：日志出现 npm 的 OIDC 身份信息（不出现 `ENEEDAUTH`/`EOTP`），registry 上新版本 HTTP 200 且 `dist-tags.latest` 指向它。
- **AC-7** `grep -n "Trusted Publisher\|Allow .npm publish\|id-token" README.md` 均命中。

## 5. 回滚

删除 `id-token: write` 与 npm 升级步骤，恢复 `NODE_AUTH_TOKEN` 注入即可回到 token 发布；npm 侧 `npm trust revoke --id <id> shipgate-cli` 可撤销绑定。无数据迁移。
