# TRACEABILITY — ShipGate v0.2

对应 CHG：`CHG-20261126-skillpack-gates` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261126-shipgate-bootstrap`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 需求 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| R1 | 技能包必须是可用的 22 个 full-dev skill | §2.1 统一结构 | M1 | AC-1、AC-2 | `ls skills \| wc -l` = 27；`node scripts/migrate-skillpack.mjs --check` |
| R2 | slash command 与 subagent 一起分发 | §2.2 能力矩阵 | M1、M2 | AC-3 | `ls ~/.claude/commands \| wc -l` = 22；`ls ~/.claude/agents` = 2 |
| R3 | 硬门控由 ShipGate 拥有，覆盖 pi 与 dsh | §3.1 | M3 | AC-4 | `md5sum assets/gates/policy.js ~/.pi/.../policy.js` 一致 |
| R4 | policy 单一真源、可增删受保护工作区、同步到各 harness | §3.2 | M3 | AC-5 | `shipgate policy --add-protected /tmp/x` 后两处都能 grep 到 |
| R5 | 硬/软约束必须诚实标注 | §3.3 | M3、M6 | AC-8 | 注入区块与 README 均出现"软约束"字样 |
| R6 | 一句话交给 agent 就能出选择题部署 | §4、§6 | M4、M6 | AC-6、AC-8 | `install --ask </dev/null` 不挂起；README 首屏含引导段 |
| R7 | 包名 shipgate-cli，命令仍 shipgate，可全局升级 | §5 | M5 | AC-7 | `package.json.name`；`update --check` 的 URL |
| R8 | 幂等：重复安装不重复追加 | 沿用 v0.1 §4.2 | M7 | AC-10 | 连续两次 install 后 md5/policy 比对 |
| R9 | 测试覆盖新增能力 | §7 M7 | M7 | AC-9 | `node --test test/*.test.mjs` |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `scripts/migrate-skillpack.mjs` `skills/**`（新增 22） `commands/**` `agents/**` `references/**` `templates/{dev-profile.schema.json,prd.json.example,rule.json.example}` |
| M2 | `src/harness/index.mjs` `src/lib/skills.mjs` |
| M3 | `assets/gates/**` `src/lib/gate.mjs` `src/commands/policy.mjs` `src/gates/hardgate.mjs` ；删除 `assets/pi-gate/**` |
| M4 | `src/commands/ask.mjs` `src/commands/deploy.mjs`（install 分支） `src/cli.mjs` |
| M5 | `package.json` `src/lib/update.mjs` `src/commands/deploy.mjs`（提示文案） |
| M6 | `README.md` `templates/agents-snippet.md` `docs/{ARCHITECTURE,GATES,HARNESS}.md` `skills/shipgate*/**` |
| M7 | `test/*.test.mjs` `tasks/CHG-20261126-skillpack-gates/TRACEABILITY.md` |

## 3. 验收执行记录（实测填入，禁止预先勾选）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `ls skills \| wc -l` + `migrate-skillpack --check` | ✅ 27 个技能目录；frontmatter 体检 exit 0（修了 10 个缺 name 的） | 2026-11-26 |
| AC-2 | 三个子目录文件数比对 | ✅ dev-host-init 8=8；discover-skill-opportunities 13=13；security-audit 5=5 | 2026-11-26 |
| AC-3 | `install --harness claude` 后数 manifest | ✅ claude skills 27 / commands 22 / agents 2；`~/.claude/skills` 总数 100（含用户原有） | 2026-11-26 |
| AC-4 | `install --harness pi` + hash | ✅ policy.js `905babdec3…`、classifier.js `9c70f1cd15…` 与 assets/gates 完全一致 | 2026-11-26 |
| AC-5 | `policy --add/--rm-protected` | ✅ add 后全局 1 / pi 1；rm 后全局 0 / pi 0（修复了 union 导致 rm 失效的 bug） | 2026-11-26 |
| AC-6 | `install --ask </dev/null --dry-run` | ✅ exit 0 不挂起，输出 5 个 harness 的计划与「软约束」标注 | 2026-11-26 |
| AC-7 | 包名 / registry / 全局安装 | ✅ name=`shipgate-cli` version=0.2.0；`update.mjs` 查 `registry.npmjs.org/shipgate-cli/latest` | 2026-11-26 |
| AC-8 | README 首屏 + 软/硬标注 | ✅ 首 40 行含「把下面这段原样丢给你的编码 agent」+ 仓库链接；README 4 处、注入模板 1 处明确「软约束」 | 2026-11-26 |
| AC-9 | `node --test test/*.test.mjs` | ✅ 39/39 pass（新增技能包、policy、harness 能力矩阵、ask 非交互用例） | 2026-11-26 |
| AC-10 | 连续两次 `install --harness pi` | ✅ APPEND_SYSTEM.md `801c2961…` 两次一致；policy.json `ac87e0ee…` 一致；skills 无变化 27 个 | 2026-11-26 |
| AC-11 | 迁移后 command 引用可用 | ✅ 修掉 9 个 `` `.claude/skills/x.md` `` 断裂引用 → `skill \`x\``（嵌套反引号已修）；`--check` 新增该项校验 | 2026-11-27 |
| AC-12 | 迁移可重跑且不丢修复 | ✅ `--apply` = 复制 + 修引用 + 补 frontmatter + 体检，一次完成（之前重跑会覆掉 frontmatter 修复） | 2026-11-27 |
| AC-13 | `--yes` = 全部已探测 | ✅ `harnesses: 'auto'` 默认值；`install --yes` 输出「对全部已探测 harness 执行（claude, pi, codex, gemini, cursor）」 | 2026-11-27 |
| AC-14 | pi 复用 commands 作为 prompts | ✅ `~/.pi/agent/prompts` 装 22 个；原有同名 22 个已备份并逐条告警(不静默覆盖) | 2026-11-27 |
| AC-15 | 内置 dsh profile | ✅ `doctor` 列出 dsh（detect `~/.dsh`，gate kind=dsh，本机未装故 found=no） | 2026-11-27 |
| AC-16 | quality 区分「环境缺」与「代码差」 | ✅ 引擎未跑起来 → 退出码 3（之前误用 1）；输出「环境问题，不是代码问题」 | 2026-11-27 |
| AC-17 | 引擎安装命令随环境 fallback | ✅ 本机无 pipx → 自动给 `pip3 install --user …`（pipx → pip3 → python3 -m pip 三级） | 2026-11-27 |
| AC-18 | 测试全绿 | ✅ 41/41（新增 auto 默认、dsh 内置、pi prompts、覆盖告警用例） | 2026-11-27 |
| AC-19 | CI 发布通路 | ✅ `.github/workflows/release.yml`：tag 触发 = 版本一致校验 + 全量测试 + 契约闸 + `npm publish`（NPM_TOKEN）；也支持手动 dry-run | 2026-11-27 |

## 4. 风险与备注

1. `assets/gates/**` 为 vendored 上游产物（源：`agent-config-bridge` 的 `bridge/gates/`）；升级需重新导出并记录 hash。
2. full-dev skill 的 frontmatter 若不齐（缺 `name`/`description`），迁移脚本必须报错而非静默通过（Claude Code 不识别会导致"装了但没触发"）。
3. `--ask` 在非 TTY 必须退化，否则 agent 调用会永久挂起。
4. claude / codex / gemini / cursor 无进程级拦截，文档不得暗示它们有硬门控。
5. **npm 发布未完成（已改为 CI 通路）**：本机 `npm whoami` → ENEEDAUTH，`~/.npmrc` 无 token。包名 `shipgate-cli` 在 registry 为 404（未被占用），`npm publish --dry-run` 产物 299 kB / 119 files 正常。现在有两条解除方式：
   - **推荐**：在 GitHub 仓库添加 secret `NPM_TOKEN`（automation token，publish 权限），然后 `git tag v0.2.1 && git push --tags` 自动发布（tag 与 package.json 版本不一致会被拦）。
   - 本机直发：`npm login` 后 `npm publish --access public`。
7. 本机 pi 的 `~/.pi/agent/prompts` 原有 22 个同名文件已被 ShipGate 版本覆盖（均留有 `*.shipgate-bak.2026-11-27` 备份）；两者内容同源，以 ShipGate 为唯一真源。
6. 本机部署终态（2026-11-26）：claude 27 skills / 22 cmds / 2 agents；pi 27 skills + enforce 硬门控；codex 27；gemini 27；cursor 仅注入 mdc；`doctor` 产物一致性 4 个 harness 全绿。
