# TRACEABILITY — 部署拓扑收敛

对应 CHG：`CHG-20261127-deploy-topology-consolidation` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261126-skillpack-gates`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 | 验证证据 |
|---|---|---|---|---|---|
| G1 | ShipGate 成为门控与续跑唯一权威 | §4、§5 | M3、M4 | AC-5、AC-6、AC-7 | doctor 检测 + 实机只剩一份生效门控 |
| G2 | 消除 policy 双真源 | §4.1、§4.2 | M3 | AC-6 | `LEGACY_POLICY_SOURCE` 输出 + 迁移后只剩 shipgate 真源 |
| G3 | 覆盖 kimi / antigravity，zcode 明示不支持 | §2.1、§2.2 | M1 | AC-1、AC-2、AC-3 | dry-run 输出目标路径；doctor 输出 zcode 原因 |
| G4 | `.agents/skills` 语义确定 | §3 | M2 | AC-4 | dry-run 显示「跟随链接」+ 落点绝对路径 |
| G5 | 一次性多 agent 部署 | §6 | M5 | AC-10 | `install --yes` 后 status 全 managed |
| G6 | 续跑扩展归位 | §5 | M4 | AC-7 | `--with-goal-mode` 写入 + 互斥退出码 2 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `src/harness/index.mjs` |
| M2 | `src/lib/skills.mjs` `src/commands/deploy.mjs`（计划输出段） |
| M3b | `src/lib/skills.mjs` `src/commands/deploy.mjs`（doctor） |
| M4 | `assets/gates/pi/extensions/**` `src/commands/deploy.mjs`（`--with-*` 分支） |
| M5 | `docs/HARNESS.md` `docs/ARCHITECTURE.md` `README.md` `templates/agents-snippet.md` |
| M6 | `test/*.test.mjs` |
| M7 | 无（部署动作，结果记入本文件 §3） |

## 3. 验收执行记录（实测填入，禁止预先勾选）

| AC | 命令 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `install --harness kimi --dry-run` | ✅ skills → `~/.kimi-code/skills`；注入 → `AGENTS.md`；gate `-`（软约束）；commands/agents 明确跳过 | 2026-11-27 |
| AC-2 | `install --harness antigravity --dry-run` | ✅ skills → `~/.gemini/antigravity/skills`；inject 无（未验证，未编造） | 2026-11-27 |
| AC-3 | `doctor`（zcode 项） | ✅ 输出「未纳入：zcode（智谱 GUI IDE，自有内核；未探测到 ~/.zcode…）」 | 2026-11-27 |
| AC-4 | `install --harness pi --dry-run`（链接跟随） | ✅ `skills → C:\Users\…\.claude\skills（跟随链接 C:\Users\…\.agents\skills）`；实装后 27 个落在链接目标，无第二份副本 | 2026-11-27 |
| AC-5 | `doctor`（LEGACY_GATE_DUPLICATE） | ✅ 检测改为「真门控产物」（含 `policy.js`/`classifier.js`）；**修掉一个误报**：`~/.pi/agent/extensions/coding-gateways` 实为用户的 provider 网关扩展（只有 `index.ts`），旧检测建议移走会弄坏模型接入。停用命令已改为移出 `extensions/` | 2026-11-27 |
| AC-6 | `doctor`（LEGACY_POLICY_SOURCE / DSH_GATE_MISMOUNT） | ✅ 检出 bridge `bypass` vs ShipGate `enforce`；`DSH_GATE_MISMOUNT` 已检出，dsh 挂载已改为 `extensions/enforce-rules/dsh/index.js` 后消失 | 2026-11-27 |
| AC-7 | `install --with-goal-mode` + 互斥 | ✅ 已存在 → 备份 `goal-mode.ts.shipgate-bak.2026-11-27` 后覆盖；两者同指定 → 退出码 2 | 2026-11-27 |
| AC-8 | `docs/HARNESS.md` 三行 + 归属表 | ✅ kimi / antigravity / zcode 三行 + `.agents/skills` 归属表 + 续跑与遗留检测节 | 2026-11-27 |
| AC-9 | `node --test test/*.test.mjs` | ✅ 52/52 pass（新增 kimi/antigravity/链接/legacy/flat/互斥 用例） | 2026-11-27 |
| AC-10 | `install --yes` + `status` + `doctor` | ⚠️ **部分**：8 个 harness 全部 managed；dsh 已切到 ShipGate 产物；**pi 双门控与 bridge policy 移除被门控自保护拦下**（agent 不能拆门控），待主人执行 §5 命令 | 2026-11-27 |
| AC-11 | `doctor`（FLAT_SKILL_DUPLICATE） | ✅ 检出 claude skills 下 19 个扁平 `.md` 与同名目录并存，给出备份+移出命令 | 2026-11-27 |
| AC-12 | dsh skills 落点 | ✅ 改为 `~/.agents/skills`（与 pi 同一链接）；实装输出 `skills → C:\Users\…\.claude\skills（跟随链接 C:\Users\…\.agents\skills）`，27 个可见 | 2026-11-27 |

## 4. 风险与备注

1. **不自动删除**：bridge 遗留的 `coding-gateways` / `agent-config-gates` 只报告 + 给命令，删除由用户显式执行。停用建议用改名（`*.disabled`）而非删除。
2. **dsh profile 不写**：`~/.dsh/profiles/**` 是 `never_touch`。`DSH_GATE_MISMOUNT` 只给 patch 行模板，不落盘。
3. **antigravity inject 未验证**：本 CHG 不做注入，只分发 skills；`docs/HARNESS.md` 写明「全局规则文档路径未验证，待实机确认」。
4. **zcode 不纳入**：本机无 `~/.zcode`，GUI IDE 自有内核；文档记录探测方式，不假装支持。
5. **bridge 侧配套 CHG**：`CHG-20261127-bridge-scope-narrowing` 负责删除 bridge 的 gates/续跑维度并补 target。本 CHG 完成后 bridge 才能安全收缩；顺序上允许并行立契约，串行实施（先 ShipGate 承接，再 bridge 收缩）。
6. **`~/.agents/skills` 链接是 bridge 建的**：ShipGate 不建链、不删链，只跟随。若链接目标不存在则 fail-closed 报错。
7. **AC-10 的两步需主人手执行**（门控自保护拦截 agent 拆门控）：

```powershell
# 1) 停用 bridge 在 pi 上的旧门控（移出 extensions，改名留在目录内仍会被 pi 加载）
mkdir -Force "$HOME\.pi\agent\extensions-disabled"
Move-Item "$HOME\.pi\agent\extensions\coding-gateways" "$HOME\.pi\agent\extensions-disabled\coding-gateways"

# 2) 停用 bridge 的第二份 policy 真源
Move-Item "$HOME\.config\agent-config-bridge\gate-policy.json" "$HOME\.config\agent-config-bridge\gate-policy.json.disabled"
```

执行后 `shipgate doctor` 应无 `LEGACY_GATE_DUPLICATE` / `LEGACY_POLICY_SOURCE`。
8. **扁平 skill 重复**：`~/.claude/skills` 下 19 个扁平 `.md` 是同名目录的旧版残留，ShipGate 只报告不删除（可能是用户手写副本）。
9. **dsh 旧技能目录残留**：修复前 ShipGate 把 dsh skills 写到 `~/.dsh/skills`（27 个）。改到 `~/.agents/skills` 后该目录成为冗余副本。按 bridge 的 VERIFIED 结论，dsh 不读它；若要清理，主人自行 `mv ~/.dsh/skills ~/.dsh/skills.shipgate-bak` 并重启 dsh 验证。
10. **move 等价性核查结果（2026-11-27）**：bridge `policy.js` 与 ShipGate `assets/gates/policy.js` 同输入差分测试：
   - `CHECK_NAMES` / `HARD_CHECKS` / `DESTRUCTIVE_TIERS` 完全相同；
   - bash 命令 23/23、密钥 6/6、轮末拖延 4/4、`shouldBlock` 端到端均一致；
   - `pi/index.js` 与 `dsh/index.js` 符号名完全一致（差异仅在函数体内部，不改变接口）；
   - `DEFAULT_CONFIG` 唯一差异：ShipGate 多 `protected_worktrees: []`（无害，用于阻止 agent 清场）；
   - **唯一真实行为差异**：`git checkout -f` / `git switch -f` 在 ShipGate 为 `confirm/git-history`，bridge 放行（ShipGate 更严，不影响原本能跑的命令）；
   - **唯一实质运行差异**：bridge 真源是 `destructive_mode: bypass`，ShipGate 是 `enforce`（项目产物默认一致；这是机器本地配置，需主人决定是否对齐 `shipgate policy --mode bypass`）。
11. **pi 侧不存在双门控**：bridge 的 pi gate `install_as` 也是 `enforce-rules`，与 ShipGate 同目录；本机只有一份。`coding-gateways` 不是门控。
12. **bridge 的 gate-policy.json 现在是死配置**：运行中的门控（ShipGate 产物）不读它，清理它只是消除混淆，不改变行为。
