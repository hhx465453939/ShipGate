# PRD — skill 根目录卫生（备份落点、伪技能目录、Agent Skills 规格校验）

- 变更编号：`CHG-20261128-skill-root-hygiene`
- 状态：approved
- 关联：承接 `CHG-20261127-deploy-topology-consolidation`（其 M3b 交付了 `FLAT_SKILL_DUPLICATE` 检测与清理命令）；外部证据来自 pi 1.4.0 的 skill loader。

## 1. 背景（实测，2026-11-28，Windows 11）

pi 启动时报出一串 skill 冲突与校验告警：

```
[Skill conflicts]
  "ai-spec" collision:      ✓ ~\.agents\skills\ai-spec\SKILL.md      ✗ ~\.agents\skills\_flat-backup\ai-spec.md (skipped)
  "_flat-backup" collision: ✓ ~\.agents\skills\_flat-backup\api-first-modular.md  ✗ …\code-debugger.md (skipped)
  …
  auto (user) ~\.agents\skills\discover-skill-opportunities\SKILL.md
    description exceeds 1024 characters (1110)
  ~\.agents\skills\_flat-backup\*.md
    name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)
```

用 pi 1.4.0 自己的 loader（`dist/core/skills.js` 的 `loadSkills`）复现，一次得到 **21 条 collision + 10 条 warning**。根因链如下：

1. `CHG-20261127` 的 `doctor`（`src/commands/deploy.mjs`）在检测到「扁平 `<name>.md` 与 `<name>/SKILL.md` 并存」时，给出的清理命令把扁平文件移动到
   `path.join(item.dir, '_flat-backup')` —— 即 **skills 根目录的子目录**。
2. 该目录名以下划线开头、内部是带 `description:` 的 `.md`。只要它被当作 skill path 传入（pi 的 `--skill <dir>`、或任何把子目录逐个注册的调用方式），loader 就会加载这些 `.md`：
   `name = frontmatter.name ?? parentDirName`（pi `dist/core/skills.js:248`）。
   - 10 个带 `name:` 的文件 → 与真正的 `<name>/SKILL.md` **同名碰撞**，后者被 skipped，生效的是旧版扁平文件（**静默降级**）。
   - 9 个没有 `name:` 的文件 → 名字回落成父目录 `_flat-backup`，触发 `name contains invalid characters`，并彼此碰撞成 10 条。
3. 因此：**ShipGate 自己的清理建议把用户的可运行状态弄坏了**，而且默认 `loadSkills`（不传 skillPaths）根本看不到这个备份目录——问题只在特定调用下爆，属于「静默埋雷」。

同时暴露两个同类问题：

| 现象 | 位置 | 说明 |
|---|---|---|
| `description exceeds 1024` | 27 个 skill 中的 `discover-skill-opportunities` | 1110 字符，超出 Agent Skills 规范上限；pi 告警，其他 harness 也可能拒载 |
| 4 个根级扁平 `.md` 归到同一个名字 `skills` | `~/.claude/skills/*.md`（dr-midas、office-docs、paper-submission-manager、scrna-celltype-annotation） | 无 `name:` 字段 → 名字回落为父目录名；4 个文件互相碰撞 |
| `shidianguji-fetcher` 5 路碰撞 | `~/.codex`、`~/.gemini`、`~/.cursor` 下的 `shidianguji-fetcher.bak.<时间戳>/` | 旧备份目录留在 skills 根里，每个都带完整 `SKILL.md`，声明同一个 `name:` |
| `extract` 两个目录同 name | `~/.codex`、`~/.gemini` 的 `extract/` 与 `extract-research-framework/` | 同一 skill 的两份目录副本 |

## 2. 目标

| # | 目标 | 可验证结果 |
|---|---|---|
| G1 | ShipGate 产生的任何备份落点都在 skills 根**之外** | 清理命令与代码里不再出现 `<skillsRoot>/<backup>` |
| G2 | `doctor` 能看见「根内的伪技能目录 / 陈旧副本 / 名字碰撞 / 超长 description」 | `shipgate doctor` 输出这 4 类发现与可执行、可回滚的命令 |
| G3 | 分发的 27 个 skill 永远满足 Agent Skills 规格 | `migrate-skillpack --check` 与单测在 name/description 上把关，CI 先于用户看到 |
| G4 | 本机现存的冲突被清掉且可回滚 | 复现脚本从 21 collision + 10 warning 降到 0 |
| G5 | 边界说清楚：谁是根目录卫生的责任人 | 文档写明 ShipGate 负责「不往根里塞东西 + 报告」，bridge 不写 skills 根 |

## 3. 非目标

- 不接管用户自己的 skill 内容（不改 `description` 以外的正文，不删用户手写 skill）。
- 不为 codex / gemini / cursor / kimi 各自写一套冲突检测——pi 的 loader 规则与 Agent Skills 规范一致，一套规则覆盖。
- 不自动删除任何东西：所有清理都打印命令，本机一次性修复由主人可见的 `mv` 完成。
- 不改 `install` / `prune` 的既有语义与退出码。

## 4. 关键用户故事

1. 作为只跑 `shipgate doctor` 的用户，我不想让工具建议的清理命令把 skills 根弄脏；备份应该落在根外，且命令可直接粘贴执行。
2. 作为同时被 4 个 harness 读同一份 skills 的用户，我希望冲突只报一次，并告诉我「哪一份赢、哪一份被跳过」。
3. 作为维护者，我希望 `migrate-skillpack --check` 就能挡住超长 description 与非法 name，而不是等 pi 启动时告警。
4. 作为刚被我指导清理过的用户，我要能一条命令回滚。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 把备份移出根后用户找不到 | 路径固定 `~/.config/shipgate/backups/`，并在输出里打印绝对路径 |
| 自动改名/移动用户 skill 造成数据丢失 | 只移动不删除；命令带 `--dry-run` 级别的可见输出；本机修复记入 TRACEABILITY 并给回滚命令 |
| pi loader 规则变化导致检测失真 | 检测规则写成与 pi 1.4.0 一致的常量并有单测锁定；规则变化时单测先红 |
| 根外 sibling 备份被 harness 误扫 | sibling 名以 `.shipgate-` 结尾的备份目录不在任何 harness 声明路径内（`skillsPath` 指向根本身） |
