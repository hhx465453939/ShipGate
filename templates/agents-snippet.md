<!-- shipgate:begin v2 -->
## ShipGate 闸链（`shipgate install` 维护的托管区块，勿手改区块内内容）

本机部署了 ShipGate {{VERSION}}：27 个开发 skill + 4 道闸 + 按 harness 分级的门控。

### 一件事先记住：先立契约，再写代码

任何非琐碎改动，先走 `ai-spec` skill 生成 `tasks/CHG-<id>/{PRD,SPEC,TRACEABILITY}.md`，再用 `shipgate spec check` 验证契约成立。没有契约的改动不算完成。

### 四道闸与触发时机

| 闸 | 什么时候过 | 命令 | 对应 skill |
|---|---|---|---|
| spec | 任何代码改动之前 | `shipgate spec check` | `ai-spec` / `shipgate-spec` |
| quality | 每次编辑后 / 提交前 | `shipgate quality` | `shipgate-quality` |
| security | 提交前 / 发布前（必须显式给范围） | `shipgate security --scope <scope.md>` | `shipgate-security` |
| ship | 装 / 升级 / 换 harness 后 | `shipgate status` | `shipgate-install` |

### 全周期技能入口（按阶段找 skill）

| 阶段 | 用哪个 skill |
|---|---|
| 需求模糊 | `intent-grill` |
| 项目没基线 | `project-health-audit` |
| 写 PRD | `prd` |
| 工程契约 | `ai-spec` |
| 实现 | `goal-driven-development`（或用 `/ralph`、`/ralph-yolo` 循环） |
| 调试 | `code-debugger` / `debug-ui` |
| 审查 | `code-review` / `security-audit` / `ux-experience-audit` |
| 迭代与收尾 | `iteration-manager` / `nodejs-npm-auto-release` |
| 宿主环境初始化 | `dev-host-init` |
| 复盘找可复用流程 | `discover-skill-opportunities` |

### 门控分级（重要，别误判）

- **硬拦截**（进程级）：`pi`、`dsh` 等自由度高的 harness —— 装了 `enforce-rules` 扩展，破坏性命令、跳层直读会被真的拦下。
- **软约束**（靠 skill + 本文档）：`claude`、`codex`、`gemini`、`cursor`、`kimi`、`antigravity` —— 这些 harness 没有对应 hook 面，ShipGate 不会假装它们有硬门控；改代码质量靠 `shipgate quality` 可验证。

### 硬门控策略（仅 pi / dsh 生效）

```bash
shipgate policy                     # 看当前 policy 与受保护工作区
shipgate policy --add-protected <dir>
shipgate policy --mode enforce|bypass
```

受保护工作区里的 `git stash/reset --hard/clean -f/checkout -- .` 等清场命令会被拦下；需要临时放宽用 `--mode bypass` 并说明原因。

### 引擎（闸的依赖，按需安装；缺了闸会退出码 3）

ShipGate 只检查不代装，自行执行：

```bash
npm i -g aislop                                                  # quality 闸：slop 检测/修复
pipx install git+https://github.com/elementalsouls/Claude-BugHunter  # security 闸：cbh
```

调试走 `code-debugger` / `debug-ui` skill，纯提示词、不需要额外引擎；`shipgate doctor` 会列出当前缺哪些引擎。

### 硬规则

1. `quality` 不通过（score < {{MIN}} 或有 error 级发现）→ 先 `aislop fix`，不许带病提交。
2. `security` 没有 `--scope` 会被拒绝（退出码 2）；主动探测永不自动执行。
3. `spec` 不通过 → 补契约三件套，不许先写代码后补文档。
4. 排查入口：`shipgate doctor`；不知道怎么走就问 `shipgate gates`。

<!-- shipgate:end -->
