# TRACEABILITY — 门控产物完整性与引擎自诊断

对应 CHG：`CHG-20261128-gate-bundle-integrity` ｜ SPEC v1 ｜ PRD 已批准 ｜ 承接 `CHG-20261128-engines-onboarding`

## 1. 需求 → 设计 → 里程碑 → 验收

| # | PRD 目标 | SPEC 落点 | 里程碑 | 验收 |
|---|---|---|---|---|
| G1 | 真源只保存配置 | §3.1 | M1 | AC-2 |
| G2 | 文档来自各自的出厂版本 | §3.1 | M1 | AC-1 |
| G3 | dsh 产物可加载 | §3.2 | M2 | AC-3 |
| G4 | 引擎跑不起来 ≠ 代码有问题 | §3.3 | M3 | AC-4 |
| G5 | 同类问题下次自己暴露 | §3.4 | M4 | AC-5 |
| G6 | 本仓通过自己的 quality 闸 | §3.5 | M6 | AC-7、AC-9 |

## 2. 里程碑 → 独占文件清单

| M | 独占文件 |
|---|---|
| M1 | `src/lib/gate.mjs`（`mergePolicy` / `installGateBundle` / `shippedPolicy`） |
| M2 | `src/lib/gate.mjs`（`GATE_ENTRY` / `package.json` 写入） |
| M3 | `src/gates/quality.mjs`（`engineErrors` / `engineHint` / `resolveAislopPackageRoot`） |
| M4 | `src/commands/deploy.mjs`（`checkEngines.aislopPython` / doctor 输出） |
| M5 | `test/gates-harness.test.mjs`、`test/core.test.mjs` |
| M6 | `skills/dev-host-init/scripts/fill-placeholders.py`、`render-now.py`、`tools-catalog.py` |
| M7 | `docs/GATES.md`、`docs/HARNESS.md` |
| M8 | 无（运维动作） |

## 3. 验收执行记录（实测填入）

| AC | 命令 / 场景 | 结果 | 时间 |
|---|---|---|---|
| AC-1 | `node --test test/gates-harness.test.mjs`：临时 home，dsh 目录预置 v5 旧 policy | ✅ 用例「installGateBundle：出厂文档 + 真源 config-only + dsh 可加载产物」通过：dsh 写出的 `version` 等于 `assets/gates/dsh/policy.json`（7），`reminder` 不再是 `OLD-V5-REMINDER`，`checks` 10 项保留 | 2026-11-28 |
| AC-2 | 同上：断言真源只有 `config`、protected 并集提升、二次安装幂等 | ✅ 真源 `Object.keys() === ['config']`；`/opt/keep-me` 被提升；第二次安装后真源仍只有 `config` | 2026-11-28 |
| AC-3 | 同上：dsh 目录 `package.json` + `index.js` 指向；pi 目录不写 `package.json` | ✅ dsh：`package.json.type === 'module'`，`index.js` 匹配 `./dsh/index.js`；pi：入口匹配 `./pi/index.js` 且无 `package.json` | 2026-11-28 |
| AC-4 | `node --test test/core.test.mjs`：桩 aislop 输出 `ruff/engine-error` | ✅ `code === 3`、`ok === false`、summary 含「环境问题，不是代码问题」、`evidence.rules` 含 `ruff/engine-error`、hint 非空；普通 error finding 的用例仍 `code === 1` | 2026-11-28 |
| AC-5 | 本机 `chmod a+x` 临时恢复 bundled 引擎可执行位后跑 `shipgate doctor` | ✅ 打印 `AISLOP_PYTHON_ENGINE_UNUSABLE`、二进制绝对路径、「需要 GLIBC ≥ 2.34，本机 2.31」与 `chmod a-x "<path>"` 命令；随后已恢复 `a-x`（回退到系统 ruff 0.15.12） | 2026-11-28 |
| AC-6 | `node --test test/*.test.mjs` | ✅ 67 pass / 0 fail / 1 skipped（skip 为 Windows 专用 .cmd 用例） | 2026-11-28 |
| AC-7 | `ruff check skills/dev-host-init/scripts/*.py` | ✅ `All checks passed!`（原 5 处 E401/F541 已由 `ruff --fix` 修复，`python3 -m py_compile` 三个脚本均通过） | 2026-11-28 |
| AC-8 | grep 两份文档 | ✅ `docs/GATES.md` 新增「引擎级错误（engine-error）与未安装/无法解析的区别」表与判据；`docs/HARNESS.md` 新增「合并方向」表与「入口与模块格式（per-kind）」表 | 2026-11-28 |
| AC-9 | 本机 `shipgate install --yes` ×2 + `policy --sync` + `quality .` + `doctor` | ✅ 真源 `keys=config`、mode=bypass、grants 7；pi `version 6`、dsh `version 7`，均含「受保护工作区」措辞；`policy` 双落地 bypass；`quality .` → `score 87 ≥ 80，无 error`（退出码 0）；`doctor` 无 AISLOP/LEGACY/FLAT/STRAY 告警；重复 install 幂等（17 处「无变化/unchanged」） | 2026-11-28 |
| AC-10 | `node --test test/skills.test.mjs` + 本机 `install --yes` 后 `cmp` 7 个副本 | ✅ `hashTree` 两向用例（只改 SKILL.md / 只改 scripts）均通过；`installSkills` 自愈用例通过（篡改目的嵌套文件后重拷并恢复）；第 1 次 install 后 7 个 harness 的 `dev-host-init/scripts/tools-catalog.py` 与源全部 SAME；再次 install 时 9 个 harness 均「skills 无变化 27」（幂等） | 2026-11-28 |

## 4. 风险与备注

1. **真源历史污染的自愈**：`mergePolicy` 改成"global 只贡献 config"后，即使真源里还留着旧文档字段，写出的 harness 文档也不会被它污染。真源本身只在下一次 install 时被 `savePolicy({config})` 收敛。
2. **dsh 的挂载行仍由操作者维护**：`cordis.patch.yml` 是 dsh 设置面，本 CHG 不写入；产物完整性只保证"挂上就能加载"。
3. **aislop 上游**：老 glibc 上 bundled Python 引擎不可用属于 aislop 的产物问题，本 CHG 只做“可诊断 + 可回退”，不 fork、不改第三方包。
4. **v2 追加的两个发现**（验收时才暴露）：
   - 只 hash `SKILL.md` → 嵌套文件改动永不重拷（7 个 harness 全部 STALE）；
   - 清单哈希只看源不看目的 → 目的目录被篡改/半拷贝不会自愈。
   两者都已在 `installSkills` 修正，并用单测锁定；`sourceTreeDrift` 只比源的文件集，目的端用户自己加的文件不会引发无限重拷。
