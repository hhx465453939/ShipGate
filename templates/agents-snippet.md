<!-- shipgate:begin v3 -->
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

### 引擎：slop 检测（aislop）与安全审计（cbh）

两者都是闸的依赖，装在 PATH 上一次，所有 harness 的 shell 共用；缺了闸返回退出码 3，`shipgate doctor` 会给安装命令。

```bash
npm i -g aislop                                                                        # quality 闸
git clone --depth 1 https://github.com/elementalsouls/Claude-BugHunter ~/.local/src/Claude-BugHunter
python3 -m pip install --user -i https://pypi.org/simple ~/.local/src/Claude-BugHunter   # 无 pipx 走这两步
#   Windows PowerShell 路径写 "$HOME\.local\src\Claude-BugHunter"，python3 换 python；有 pipx 可 pipx install git+…
aislop doctor && cbh --help    # 自检：aislop 四引擎应全 ready；cbh 无 --version，看子命令
```

什么时候调谁：

| 目的 | 命令 |
|---|---|
| 判定这次改动能不能提交 | `shipgate quality`（阈值与 error 级判定都在闸里） |
| 看具体哪些行是 slop / 机械修复 | `aislop scan . -d` → `aislop fix` → 结构性大改 `aislop agent` |
| 安全：先确认授权范围 | `shipgate security --scope <scope.md>`（只校验，不发包） |
| 安全：范围内侦察 / 归类 / 验证 | `cbh recon / surface / diff / classify / triage`，方法论按 `shipgate-security` skill |

`cbh` 自带的 82 个 `hunt-*` skill **默认未装**（体积与迭代频率不合，不随 ShipGate 分发）。需要时自行安装：`pwsh scripts/install.ps1 -All`（装进 `~/.claude/skills`，备份落在加载路径之外），再按 `cbh classify` 指到的 skill 名去读。

调试走 `code-debugger` / `debug-ui` skill，纯提示词、不需要额外引擎。

### 硬规则

1. `quality` 不通过（score < {{MIN}} 或有 error 级发现）→ 先 `aislop fix`，不许带病提交。
2. `security` 没有 `--scope` 会被拒绝（退出码 2）；主动探测永不自动执行。
3. `spec` 不通过 → 补契约三件套，不许先写代码后补文档。
4. 排查入口：`shipgate doctor`；不知道怎么走就问 `shipgate gates`。
5. 引擎缺失不是绕过的理由：`shipgate doctor` 给安装命令；不要用「我手动看过了」代替 quality / security 闸。

<!-- shipgate:end -->
