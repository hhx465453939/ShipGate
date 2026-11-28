# TRACEABILITY — skill 根目录卫生

对应 CHG：`CHG-20261128-skill-root-hygiene` ｜ SPEC v2 ｜ PRD 已批准 ｜ 承接 `CHG-20261127-deploy-topology-consolidation`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| G1 | 备份落点永远在 skills 根之外 | §3.1 | M1、M2 | AC-1 | 单测 `skillsBackupDir 永远落在 skills 根之外` |
| G2 | doctor 看见伪技能目录/碰撞/超规 | §3.2、§3.3 | M1、M2 | AC-2、AC-3、AC-5 | 临时目录用例 + 本机 doctor 前后对比 |
| G3 | 分发物满足 Agent Skills 规格 | §3.4、§3.5 | M3、M4 | AC-6 | `migrate-skillpack --check` 正负用例 |
| G4 | 本机冲突归零且可回滚 | §3.6 | M7 | AC-4 | pi loader 复测前后对比 + 备份路径 |
| G5 | 边界写清（bridge 不写根） | §2.3 | M6 | AC-8 | `docs/HARNESS.md` 新节 |
| G6 | 闸链本身在 Windows 上可跑（v2） | §4 M8/M9 | M8、M9 | AC-10、AC-11 | `.cmd` 垫片单测 + `quality` 出分 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `src/lib/skills.mjs` |
| M2 | `src/commands/deploy.mjs` |
| M3 | `scripts/migrate-skillpack.mjs` |
| M4 | `skills/discover-skill-opportunities/SKILL.md` |
| M5 | `test/skills.test.mjs` `test/topology.test.mjs` |
| M6 | `docs/HARNESS.md` |
| M7 | 无（运维动作，结果记入 §3、§4） |
| M8 | `src/lib/exec.mjs` `test/core.test.mjs` |
| M9 | `src/gates/quality.mjs` `skills/dev-host-init/scripts/render-now.py` `skills/dev-host-init/scripts/tools-catalog.py` |

## 3. 验收执行记录（实测填入）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node --test test/skills.test.mjs` | ✅ `skillsBackupDir 永远落在 skills 根之外` 通过；`skillsBackupDir('skills-flat','2026-01-01')` → `~/.config/shipgate/backups/skills-flat-2026-01-01`，相对 `~/.claude/skills` 与 `~/.agents/skills` 均为 `..` 开头 | 2026-11-28 |
| AC-2 | 同上（`auditSkillRoot` 用例） | ✅ 临时根同时含 `ai-spec.md` + `ai-spec/SKILL.md` + `_flat-backup/*.md` + 1100 字符 description + 深层目录：`skills=4`、`strayDirs=['_flat-backup']`、`collisions=['ai-spec']`（winner 为目录版）、`longDescriptions=[1100]`、干净目录零发现 | 2026-11-28 |
| AC-3 | 同上（`validateSkillName` 用例） | ✅ `_flat-backup`/`auto version and publish`/`a--b`/`-a`/65 字符/`Upper` 全部判非法；`a-b-1` 合法 | 2026-11-28 |
| AC-4 | pi 1.4.0 自带 loader 复现（`loadSkills`，逐目录注册） | ✅ 改前 `.claude/skills` `collisions=21 / warnings=10`；清理后 `.claude` 85 个 skill `0/0`、`.codex` 61 `0/0`、`.gemini` 56 `0/0`、`.cursor` 1 `0/0`；单根模式 `.kimi-code` 27、`.gemini/antigravity` 27 全为 `0/0` | 2026-11-28 |
| AC-5 | `node bin/shipgate.mjs doctor` | ✅ 清理前输出 `SKILL_STRAY_DIR ..._flat-backup 有 19 个 .md`、2 条 `SKILL_NAME_COLLISION`（`skills` 4 路、`extract` / `shidianguji-fetcher` 6 路）、4 条 `SKILL_DESCRIPTION_TOO_LONG`，清理命令目标为 `~/.config/shipgate/backups/...`；清理后同命令 grep 这 5 类 code 计数为 `0`；共用目录只出现一次并标注 `被 claude, pi, dsh 共用` | 2026-11-28 |
| AC-6 | `node scripts/migrate-skillpack.mjs --check` | ✅ 干净时 `✔ 迁移体检通过`（27 个 skill）；临时放一个 1100 字符 description 的 skill → `✖ description 超过 1024 字符（1100）`、`exit=1`；删掉后 `exit=0`。`discover-skill-opportunities` 由 1110 压到 969 | 2026-11-28 |
| AC-7 | `node --test test/*.test.mjs` | ✅ 61 项全绿（skills 13 项含 6 项新增；core 10 项含 `.cmd` 垫片用例） | 2026-11-28 |
| AC-8 | `docs/HARNESS.md` | ✅ 新增「skill 根卫生（doctor）」节：备份落点约定 + 三条 loader 规则 + 五类 code 表 + bridge 不写根的核查结论 | 2026-11-28 |
| AC-9 | `node bin/shipgate.mjs spec check` + `quality` | ✅ `spec check` → 4 个契约成立；`quality` → `score 86 ≥ 80，无 error 级发现` | 2026-11-28 |
| AC-10 | `node --test test/core.test.mjs` | ✅ `.cmd` 垫片用例通过（路径与参数均含空格）；`version(which('aislop'))` 由 `null` 变为 `0.23.0`，`run()` 不再 `exit=-1` | 2026-11-28 |
| AC-11 | `node bin/shipgate.mjs quality` | ✅ 修复前 `aislop 输出无法解析（exit=-1）`（不可跑）；启动修好后 `score 65 / 7 个 error`；剔出 vendored 上游树 + 删两个未使用变量后 `score 86 / 0 error` | 2026-11-28 |

## 4. 风险与备注

1. **神经中枢问题已定位到具体一行**：`src/commands/deploy.mjs` 旧代码 `const backup = path.join(item.dir, '_flat-backup')` 把备份放进 skills 根内部，等于把旧版扁平 skill 重新注册成 skill，并在同名碰撞里**赢过**真正的新版目录。镜像里 21 条 collision 逐条都能追溯到它。
2. **本机清理全部可回滚**（移动，不删除）：
   - `~/.claude/skills/_flat-backup` → `~/.config/shipgate/backups/skills-stray-2026-11-28/_flat-backup`（19 个 `.md`）；
   - `~/.{codex,gemini,cursor}/skills/shidianguji-fetcher.bak.*`（13 个目录）与 `~/.{codex,gemini}/skills/extract`（2 个目录） → `~/.config/shipgate/backups/user-skills-stale-2026-11-28/<harness>/`。
   回滚：把上述目录原样 `Move-Item` / `mv` 回各自的 `skills` 根。
3. **用户自有扁平 skill 补了 `name:`**：`~/.claude/skills/{dr-midas,office-docs,paper-submission-manager,scrna-celltype-annotation}.md` 原来无 `name:`，pi 会把名字回落成父目录名 `skills`，四个文件互相碰撞；`extract-research-framework.md` 原本没有 frontmatter（pi 直接跳过、永不加载），补齐后成为可触发 skill。正文未改。
4. **bridge 侧结论**：`scanSkills` 只认含 `SKILL.md` 的目录，扁平 `.md` 只计数不桥接；全仓 `flat-backup` 命中 0；备份落到 `<repo>/.bridge/backups`。故本 CHG 不改 bridge，只在文档里写明责任边界。
5. **审计规则以 pi 1.4.0 为准**：`name = frontmatter.name ?? parentDirName`、根级直接 `.md` 才算扁平 skill、`.` 前缀跳过。单测锁定这套规则，pi 改动时先红。
6. **quality 闸的两个既有缺陷**（v2 追加）：`.cmd` 垫片直接 spawn 在 Windows 上恒 `EINVAL`（quality 闸从未真正跑过）；修好后暴露出 vendored 上游树被当成本仓代码计分。前者用 `windowsVerbatimArguments` + `cmd /d /s /c` 解决，后者改为 `excludes` 并在注释里写明「运行时提供依赖、零依赖才要 vendored」。
7. **aislop 已本机安装**（`npm i -g aislop` → 0.23.0），否则 quality 闸按设计返回 code 3（环境缺口，不是代码问题）。
8. **`~/.claude/skills` 仍是 86 项**：其中 5 个根级扁平 `.md` 是用户自有单文件 skill，现已带合法 `name:`，pi 正常加载，不再互相碰撞。
