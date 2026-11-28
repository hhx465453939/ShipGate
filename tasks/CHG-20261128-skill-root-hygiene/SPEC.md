---
change_id: CHG-20261128-skill-root-hygiene
version: 2
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261127-deploy-topology-consolidation
approved_by: damncheater
approved_at: 2026-11-28
---

# SPEC — skill 根目录卫生

## 1. 上下文与既有接口

沿用 `CHG-20261127` 已交付的：`doctor` 的分节输出、`detectFlatSkillDuplicates`、按 realpath 去重（pi/dsh 共用一份 `~/.agents/skills` 只报一次）、平台分支命令生成（Windows / POSIX）、`Verdict` 与退出码约定。

本 CHG 只做四件事：**修备份落点**、**扩 doctor 审计**、**给分发物加规格校验**、**清本机存量**。不推翻任何既有接口。

### 1.1 复现基线（改前实测）

复现脚本（pi 1.4.0 自己的 loader，不经模型）：

```js
// 见 TRACEABILITY §3 AC-4 的命令
const { loadSkills } = await import('file:///<pi>/dist/core/skills.js');
loadSkills({ cwd: HOME, includeDefaults: false,
  skillPaths: [join(HOME,'.agents','skills'), join(HOME,'.agents','skills','_flat-backup')] });
```

改前：`skills=82, collisions=21, warnings=10`。逐条与用户上报一致（10 个真实同名 + 10 个 `_flat-backup` 伪名 + 1 个 `skills` 伪名；9 个非法 name + 1 个超长 description）。

## 2. 根因

### 2.1 代码级根因

`src/commands/deploy.mjs`（`doctor`，`FLAT_SKILL_DUPLICATE` 分支）：

```js
const backup = path.join(item.dir, '_flat-backup');   // ← 备份目录落在 skills 根内部
```

pi `dist/core/skills.js` 的加载规则（1.4.0，实读源码）：

| 规则 | 出处 | 后果 |
|---|---|---|
| `name = frontmatter.name ?? parentDirName` | `loadSkillFromFile` | 无 `name:` 的扁平文件名字变成父目录名（`_flat-backup` / `skills`） |
| 非 `SKILL.md` 文件只要 `description` 非空就加载 | `loadSkillsFromFile` | 备份 `.md` 会真的变成可触发 skill |
| 顶层 skill path 的**直接** `.md` 会被加载（`includeRootFiles=true`） | `loadSkillsFromDirInternal` | 根级扁平 `.md` → 名字回落为根目录名 |
| 同名后到者 skipped | `loadSkills` 的 `collision` 分支 | 被 skipped 的是**新版目录**，生效的是**旧版扁平文件** |

结论：把备份放进根里，等于把「旧版扁平 skill」重新注册成 skill；在 `--skill <dir>` 或任何逐目录注册的调用下必然冲突。

### 2.2 规格级根因

`discover-skill-opportunities/SKILL.md` 的 `description` 长 1110 > 1024（Agent Skills 规范上限，pi `MAX_DESCRIPTION_LENGTH`）。`scripts/migrate-skillpack.mjs` 的 `frontmatterIssue()` 只检查 `name:`/`description:` **存在**，不检查取值是否合法，所以能把超规 description 分发出去。

### 2.3 边界（谁不背这个锅）

`agent-config-bridge` 经核查**无同类缺陷**：

- `bridge/lib/source.js` 的 `scanSkills` 只认「目录且含 `SKILL.md`」，扁平 `.md` 只进 `flatDuplicates` 计数，从不桥接；
- 全仓 `flat-backup` 命中 0；
- 备份落点是 `backupsDir(repo) = <repo>/.bridge/backups`（`bridge/lib/paths.js:46`），在 skills 根之外。

因此本 CHG 不改 bridge，只在其结论上补文档。

## 3. 设计

### 3.1 备份落点：skills 根的 sibling，不是 child

`src/lib/skills.mjs` 新增：

```js
export const AGENT_SKILLS_LIMITS = { nameMax: 64, descriptionMax: 1024 };

/** <stateDir>/backups/<kind>-<date>：在 skills 根之外，任何 harness 都不扫。 */
export function skillsBackupDir(kind, date = today()) {
  return path.join(stateDir(), 'backups', `${kind}-${date}`);
}
```

`kind` 取值 `skills-flat`（扁平重复文件）、`skills-stray`（伪技能目录）。输出的清理命令一律写到这个目录。

### 3.2 `doctor` 的 skill 根审计

`src/lib/skills.mjs` 新增 `auditSkillRoot(root)`，规则与 pi 1.4.0 严格对齐（有单测锁定）：

- 目录含 `SKILL.md` → 该目录是一个 skill，不再下钻；
- 否则下钻子目录找 `SKILL.md`；只有**根目录的直接** `.md` 算扁平 skill（与 pi `includeRootFiles` 语义一致）；
- 跳过 `.` 开头项与 `node_modules`；
- `name` 校验：`^[a-z0-9-]+$`、≤64、不以 `-` 开头/结尾、不含 `--`；
- `description` 校验：缺失或长度 > 1024；
- 同名按 `name` 聚合，先到者胜，其余记为 loser。

返回形态：

```js
{ root, skills: number,
  invalidNames: [{ name, file, messages: string[] }],
  longDescriptions: [{ file, length }],
  collisions: [{ name, winner, losers: string[] }],
  strayDirs: [{ dir, mdCount }] }
```

`strayDirs` 的判据（只扫根的**直接**子目录）：目录内没有 `SKILL.md`，但有 ≥1 个 `.md` —— 这正是 `_flat-backup` 的形状，一旦被当 skill path 传入就会变成伪技能。

### 3.3 `doctor` 输出

在既有「扁平 skill 重复」位置改为统一的「skill 根卫生」节，按 realpath 去重（pi/dsh 共用只报一次，并列共用者），每类给一条可执行命令：

| code | 触发 | 命令落点 |
|---|---|---|
| `FLAT_SKILL_DUPLICATE` | 根内 `<name>.md` 与 `<name>/SKILL.md` 并存（沿用 AC-11 判据） | `skills-flat-<date>` |
| `SKILL_STRAY_DIR` | 根的直接子目录无 `SKILL.md` 但含 `.md` | `skills-stray-<date>` |
| `SKILL_NAME_COLLISION` | 同一 root 内多个文件声明同一 `name` | 只报告，列出 winner/losers 与目录名 |
| `SKILL_INVALID_NAME` | 名字不满足 `^[a-z0-9-]+$` / ≤64 / 无 `--` | 只报告（要求在源 skill 里改） |
| `SKILL_DESCRIPTION_TOO_LONG` | `description` 长度 > 1024 | 只报告（要求在源 skill 里改） |

原则不变：**只报告，不删除**；命令可复制、可回滚（移动而非删除）。

### 3.4 分发物规格校验

`scripts/migrate-skillpack.mjs` 的 `frontmatterIssue()` 扩展为同时校验取值：

- `name`：`^[a-z0-9-]+$`、≤64、无首尾 `-`、无 `--`；
- `description`：非空且 ≤1024。

`--check` 逐条报出，退出码 1。同一规则另写一条单测（`test/skills.test.mjs`），保证 CI 与本地一致。

### 3.5 规格超限修复

`skills/discover-skill-opportunities/SKILL.md` 的 `description` 压到 ≤1024（保留全部触发语义：会话复盘触发条件、边界禁止项），并留 ≥30 字符余量。

### 3.6 本机存量清理（不改代码）

| 对象 | 动作 | 落点 |
|---|---|---|
| `~/.claude/skills/_flat-backup/`（19 个 `.md`） | 整目录移出根 | `<stateDir>/backups/skills-stray-2026-11-28/` |
| `~/.claude/skills/*.md` 中 4 个无 `name:` 的自有 skill | 补 `name: <文件名主干>` | 原地（只加一行） |
| `~/.{codex,gemini,cursor}/skills/shidianguji-fetcher.bak.*`（13 个目录） | 移出根 | `<stateDir>/backups/user-skills-stale-2026-11-28/<harness>/` |
| `~/.{codex,gemini}/skills/extract/`（与 `extract-research-framework` 同 name） | 移出根 | 同上 |

全部为 `mv`（可逆），执行前列出清单，执行后给出回滚命令。

## 4. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | 备份落点移出根 + 审计函数 | `src/lib/skills.mjs` | AC-1、AC-2、AC-3 |
| M2 | `doctor` 输出改造 | `src/commands/deploy.mjs` | AC-2、AC-5 |
| M3 | 分发物规格校验 | `scripts/migrate-skillpack.mjs` | AC-6 |
| M4 | 超限 description 修复 | `skills/discover-skill-opportunities/SKILL.md` | AC-6 |
| M5 | 单测 | `test/skills.test.mjs`、`test/topology.test.mjs` | AC-7 |
| M6 | 文档 | `docs/HARNESS.md` | AC-8 |
| M7 | 本机清理与复测 | 无（运维动作，结果记 TRACEABILITY） | AC-4 |
| M8 | Windows `.cmd` 垫片可启动（v2 追加） | `src/lib/exec.mjs`、`test/core.test.mjs` | AC-10 |
| M9 | quality 闸可跑通（v2 追加） | `src/gates/quality.mjs`、`skills/dev-host-init/scripts/*.py` | AC-11 |

## 5. 验收判据

- **AC-1** `src/lib/skills.mjs` 不再输出任何位于 skills 根内部的备份路径；`skillsBackupDir()` 落在 `<stateDir>/backups/` 下。单测断言 `skillsBackupDir('skills-flat','2026-01-01')` 不以任何 skills 根为前缀。
- **AC-2** 对一个临时目录构造「`<name>.md` + `<name>/SKILL.md` + `_flat-backup/*.md`」，`auditSkillRoot()` 同时报出 `FLAT_SKILL_DUPLICATE` 等价项、`strayDirs`（含 `_flat-backup`）与 0 误报；`doctor` 打印的清理命令的目标路径位于根外。
- **AC-3** `auditSkillRoot()` 对 `name` 校验与 pi 1.4.0 一致：`_flat-backup`（下划线）、`auto version and publish`（空格）判非法；`a--b`、`-a`、65 字符名判非法。
- **AC-4** 本机复测（pi loader 复现脚本）：改前 `collisions=21, warnings=10`；清理后 `collisions=0, warnings=0`（homes 全量：claude/codex/gemini/cursor/kimi/antigravity）。
- **AC-5** `node bin/shipgate.mjs doctor` 在本机输出 `SKILL_STRAY_DIR`（清理前）并在清理后不再输出；同一物理目录被 pi/dsh 共用时只报一次。
- **AC-6** `node scripts/migrate-skillpack.mjs --check` 通过；把 description 改回 1110 字符时该命令退出码 1 并指出超限文件名。
- **AC-7** `node --test test/*.test.mjs` 全绿（新增：审计规则、备份落点、分发物规格）。
- **AC-8** `docs/HARNESS.md` 新增「skill 根卫生」节：备份落点约定（根外）、4 类发现的含义、bridge 不写 skills 根的证据。
- **AC-9** `node bin/shipgate.mjs spec check` 通过；`shipgate quality` 无 error 级发现。
- **AC-10**（v2）`run()` 在 Windows 上能启动 `.cmd` 垫片，且含空格的路径与参数不被拆开：`test/core.test.mjs` 的 `.cmd` 用例通过；`which('aislop')` 解析出的 `aislop.CMD` 可被 `version()` 读出（不再是 `exit=-1`）。
- **AC-11**（v2）`node bin/shipgate.mjs quality` 在装有 aislop 的机器上**能跑出分数**（不是 `输出无法解析`），且 score ≥ 80、error 级发现 0；vendored 上游树（`assets/gates`、`assets/pi-gate`、`assets/pi-extensions`）不计入本仓评分，理由写进 `src/gates/quality.mjs` 注释。

## 6. 变更记录

- v2（2026-11-28）：验收时发现两个阻断 AC-9 的既有缺陷，追加 M8/M9 与 AC-10/AC-11：
  1. `run()` 直接 spawn `.cmd` 垫片 —— Node 的 CVE-2024-27980 修复后返回 `EINVAL`，Windows 上 quality 闸恒为 `exit=-1`；
  2. 修好启动后暴露出 7 个 error 级发现：3 个来自 vendored 上游树（运行时提供依赖，不该计分），2 个是本仓 Python 脚本里的未使用变量（已删）。

## 6. DoR / DoD

- DoR：PRD 已批准；既有 CHG-20261127 契约成立；根因已用 pi loader 复现并逐条对应。
- DoD：AC-1…AC-9 全绿；TRACEABILITY 逐条填实测；本机 conflicts 归零且回滚命令已给出；无「以后再做」遗留。
