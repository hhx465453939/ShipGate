# TRACEABILITY — 注入文档补引擎用法

对应 CHG：`CHG-20261128-inject-engine-guidance` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261128-engines-onboarding`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| G1 | 注入块安装命令本机可执行 | §2.2 | M1 | AC-1 | 模板 grep + 单测断言 |
| G2 | agent 知道自检与调用时机 | §2.2 | M1 | AC-1 | 「什么时候调谁」表进模板 |
| G3 | `hunt-*` 缺口写明 | §2.2 | M1 | AC-3 | 7 个注入目标各 1 处 `hunt-*` |
| G4 | 7 份已注入文件刷新 | §2.1、§2.3 | M3 | AC-3、AC-4 | install 输出 `[updated]` + status `v3` |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `templates/agents-snippet.md` |
| M2 | `test/inject.test.mjs` |
| M3 | 无（运维动作，结果记 §3、§4） |

## 3. 验收执行记录（实测填入）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node --test test/inject.test.mjs` | ✅ 用例「区块带着『引擎什么时候调』的具体指引」通过：区块含 `aislop doctor && cbh --help`、`pypi.org/simple`、`aislop scan . -d`、`shipgate security --scope`、`hunt-*`、`install.ps1 -All`；`pipx` 只以注释形式出现（两处「有 pipx 可 pipx install」），不再是唯一命令 | 2026-11-28 |
| AC-2 | `blockVersion(renderBlock(...))` | ✅ `v3`，标记 `<!-- shipgate:begin v3 -->` | 2026-11-28 |
| AC-3 | `shipgate install --yes` 后逐文件 grep | ✅ 7 个目标全部 `shipgate:begin v3`，且每个含 `hunt-*`（1 处）与 `aislop doctor && cbh --help`（1 处）：CLAUDE.md、APPEND_SYSTEM.md、.dsh/AGENTS.md、.codex/AGENTS.md、GEMINI.md、cursor/rules/shipgate.mdc、.kimi-code/AGENTS.md | 2026-11-28 |
| AC-4 | `shipgate status` | ✅ inject 列 claude/pi/dsh/codex/gemini/cursor/kimi 全为 `v3`；antigravity 无注入路径，保持 `-`（设计如此） | 2026-11-28 |
| AC-5 | `node --test test/*.test.mjs` | ✅ 64/64 通过（新增 1 条区块内容断言，v2→v3 断言已同步） | 2026-11-28 |
| AC-6 | `shipgate spec check` / `shipgate quality` | ✅ spec：6 个契约成立；quality：`score 86 ≥ 80，无 error 级发现` | 2026-11-28 |

## 4. 风险与备注

1. **注入前都留了备份**：覆盖 `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md` 等文件前，`upsertBlock` 走 `backupOnce` → `*.shipgate-bak.2026-11-28`（实测两份备份存在）。回滚：把 `*.shipgate-bak.2026-11-28` 复制回原名即可。
2. **只替换标记之间**：标记外的用户手写内容一字不动（`upsertBlock` 的既有行为，单测「已有用户内容但无区块 → appended，用户内容一字不动」覆盖）。
3. **篇幅控制**：新增内容约 0.9 KB，删掉了旧段落的重复表述；这段进每次会话上下文，所以只放「什么时候调谁 + 红线 + 自检」，不放教程。
4. **`hunt-*` 的处理与 `CHG-20261128-engines-onboarding` 一致**：不随 ShipGate 分发，但注入块现在会主动告诉 agent「默认没装、要装怎么装、装到哪、按 `cbh classify` 结果去读」——避免 agent 拿到 skill 名后自己编方法论。
5. **`antigravity` 仍无注入**：其全局规则文档路径未验证（`CHG-20261127` 的既有结论），所以它只拿到 27 个 skill，不拿注入块；`hunt-*` 与引擎说明对它暂不可见，属已知缺口。
