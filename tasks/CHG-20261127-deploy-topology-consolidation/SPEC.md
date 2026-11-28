---
change_id: CHG-20261127-deploy-topology-consolidation
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261126-skillpack-gates
approved_by: damncheater
approved_at: 2026-11-27
---

# SPEC — 部署拓扑收敛

## 1. 上下文与既有接口

沿用 `CHG-20261126-skillpack-gates` 已交付的：`Verdict` 输出形态、退出码（0/1/2/3）、幂等约定、托管区块注入、manifest、`installGateBundle`、`syncPolicyToHarnesses`。

本 CHG 只做三件事：**扩 harness 矩阵**、**收敛门控真源**、**承接续跑扩展**。不推翻任何既有接口。

实测环境（2026-11-27，Windows 11）：

```
~/.claude   ~/.codex   ~/.gemini   ~/.cursor   ~/.pi   ~/.dsh
~/.kimi-code   ~/.antigravity   ~/.agents/skills -> ~/.claude/skills (junction/symlink)
pi extensions: coding-gateways(bridge) + enforce-rules(ShipGate) + goal-mode.ts
dsh mount:     ~/.dsh/profiles/*/cordis.patch.yml -> agent-config-gates/dsh/index.js
policy:        shipgate=enforce  /  bridge=bypass
```

## 2. harness 矩阵扩展

### 2.1 新增内置项

在 `src/harness/index.mjs` 的 `BUILTIN` 追加：

```js
{
  id: 'kimi',
  label: 'Kimi Code',
  detect: '~/.kimi-code',
  skills: '~/.kimi-code/skills',
  commands: null,          // Kimi 官方声明 Claude custom commands 不在其范围内
  agents: null,
  inject: '~/.kimi-code/AGENTS.md',
  gate: null,              // 无用户可装扩展/钩子机制
},
{
  id: 'antigravity',
  label: 'Antigravity',
  detect: '~/.antigravity',
  skills: '~/.gemini/antigravity/skills',   // 全局 skills 路径（Agent Skills 开放标准）
  commands: null,
  agents: null,
  inject: null,            // 全局规则文档路径未验证，本 CHG 不分发
  gate: null,
},
```

路径依据：
- kimi：`bridge/targets/kimi.json` 已验证（`skills/`、`AGENTS.md`）。
- antigravity：`~/.gemini/antigravity/skills/<name>/SKILL.md` 为官方全局 skills 位置；本机 `~/.gemini/antigravity/` 存在但无 `skills/`，install 时按需创建。项目级 `.agent/skills/` 不在全局分发范围。

### 2.2 zcode 的处理

**不纳入内置**。理由写入 `docs/HARNESS.md`：ZCode 是智谱 GUI IDE，本机未安装、无 `~/.zcode` 目录、3.0 起切换自有 Agent 内核且不再内置其他 Agent 适配。文档给出探测方式与「若未来出现 `~/.zcode/skills` 再用 custom 配置接入」的说明。

### 2.3 能力缺失的输出

沿用现有规则：harness 无对应目录就跳过，输出写明「skills 跳过：harness 无 skills 目录」，不静默。

### 2.4 dsh 的 skills 落点纠正

`BUILTIN` 里 dsh 的 `skills` 从 `~/.dsh/skills` 改为 `~/.agents/skills`。

依据：`agent-config-bridge/bridge/targets/dsh.json` 的 `notes` 是对 dsh 0.2.2-rc.3 实例验证过的（安装文档 + 源码 + 实会话），明确写：

> SKILLS: `~/.agents/skills` is a native user skill root; project `.agents/skills` overrides it and the packaged preset skill overrides both, so the same link pi uses is enough — this manifest declares no skill dimension on purpose.

旧落点 `~/.dsh/skills` 没有任何证据表明 dsh 会读它——对「只装 ShipGate」的 dsh 用户就是死代码。
改后 dsh 与 pi 共用同一条链接，符合「统一权威目录」的目标。历史副本 `~/.dsh/skills` 不自动删除，由 `doctor` 提示。

## 3. `.agents/skills` 链接感知

### 3.1 问题

`~/.agents/skills` 是指向 `~/.claude/skills` 的链接（本机 103 个 skill）。pi 与 dsh 都把它当原生技能根。ShipGate 的 pi harness 声明 `skills: '~/.agents/skills'`，复制 27 个时实际落进 `~/.claude/skills`——「巧合正确」但语义不清。

### 3.2 设计

在 `src/lib/skills.mjs` 的安装路径解析处增加链接解析：

```js
// 伪代码：不新增依赖，用 fs.realpath / lstat
function resolveSkillsTarget(declared) {
  const abs = expandHome(declared);
  if (isSymlink(abs)) {
    const real = fs.realpathSync(abs);
    return { real, followed: true, declared: abs };
  }
  return { real: abs, followed: false, declared: abs };
}
```

行为：
- 目标是链接 → 写入链接目标（`real`），并在计划与结果里打印 `~/.agents/skills -> <real>（跟随链接）`。
- 目标是普通目录 → 直接写入。
- 目标是链接但链接目标不存在 → 报错退出（fail-closed），不创建（建链是 bridge 的职责）。
- `--dry-run` 必须显示解析后的绝对路径。

### 3.3 与 bridge 的分工（写入 `docs/HARNESS.md`）

| 谁 | 对 `~/.agents/skills` 做什么 |
|---|---|
| bridge | 负责创建/维护这条链接（adopt pi 时） |
| ShipGate | 只做复制；检测到链接时跟随；不建链、不删链 |

因此两者同时存在时，写入落到同一份（`~/.claude/skills`），幂等且无副本。

## 4. 门控真源收敛

### 4.1 单一真源

`~/.config/shipgate/gate-policy.json` 是唯一真源。`installGateBundle` 已有 `mergePolicy + savePolicy`，保留。

新增检测（`src/lib/gate.mjs`）：

```js
export function detectLegacyGates(home) -> {
  bridgePiGate: '<home>/.pi/agent/extensions/coding-gateways' | null,
  bridgeDshGate: '<home>/.dsh/plugins/agent-config-gates' | null,
  bridgePolicy: '<home>/.config/agent-config-bridge/gate-policy.json' | null,
  dshMounted: '<profile>/cordis.patch.yml' 命中的 gate 名 | null,
}
```

### 4.2 `doctor` 新增检查项

| 检查 | 触发条件 | 输出 |
|---|---|---|
| `LEGACY_GATE_DUPLICATE` | `coding-gateways` 与 `enforce-rules` 同时存在 | warn + 给停用命令 |
| `LEGACY_POLICY_SOURCE` | bridge gate-policy 存在 | warn + 指明第二真源路径与 mode 差异 |
| `DSH_GATE_MISMOUNT` | dsh 挂载的不是 ShipGate 的 `enforce-rules` | warn + 给 patch 行模板 |
| `SKILLS_LINK_FOLLOWED` | `~/.agents/skills` 是链接 | info + 打印真实落点 |

**不自动删除**。只报告 + 给出可直接执行的命令（如 `mv <dir> <dir>.disabled`）。

### 4.3 安装时的冲突提示

`install` 结束前若检测到 legacy gate，打印一段明确的「重复门控」告警，但不改变退出码（安装本身成功）。

## 5. 续跑扩展承接

### 5.1 资产归位

桥接的 `goal-mode.ts` / `auto-continue.ts` 迁入：

```
assets/pi-extensions/
├── goal-mode.ts
└── auto-continue.ts
```

来源：`agent-config-bridge` 的 `bridge/gates/pi/extensions/`。**不放 `assets/gates/pi/extensions/`**：`installGateBundle` 会 `copyTree(assets/gates → gateDest)`，把扩展嵌进门控目录只会多一层无用嵌套。迁移后 ShipGate 自己拥有维护责任，CHANGELOG 记录来源。

### 5.2 安装方式

二选一，**不进 `install` 默认流程**（与既有 gate 一致：显式命令）：

```bash
shipgate install --with-goal-mode        # 装 goal-mode.ts
shipgate install --with-auto-continue    # 装 auto-continue.ts
```

规则：
- 两者不能同时装，同时指定 → 用法错误退出码 2。
- 目标 `~/.pi/agent/extensions/<name>.ts` 已存在 → 备份 `*.shipgate-bak.<日期>` 再覆盖，并报出「覆盖了 N 个」。
- 非 pi harness 不支持 → 跳过并说明。

## 6. `--yes` 装齐

现状 `harnesses: 'auto'` 已默认全部已探测，但 `status` 显示 codex/gemini/cursor 为 `-`（历史未装）。本 CHG 不需改代码语义，只需：

- `docs/HARNESS.md` 与 README 写明「`--yes` = 全部已探测」。
- `doctor` 增加一项 `HARNESS_NOT_INSTALLED`：目录存在但 manifest 无记录 → info 提示可补装。

## 7. 里程碑

| M | 内容 | 独占文件 | 验收 |
|---|---|---|---|
| M1 | harness 矩阵扩展 | `src/harness/index.mjs` | AC-1、AC-2、AC-3 |
| M2 | skills 链接感知 | `src/lib/skills.mjs`、`src/commands/deploy.mjs`（计划输出） | AC-4 |
| M3 | 门控真源检测 | `src/lib/gate.mjs`、`src/commands/deploy.mjs`（冲突告警）、`src/gates/ship.mjs`（doctor） | AC-5、AC-6 |
| M3b | 扁平 skill 重复检测 | `src/lib/skills.mjs`、`src/commands/deploy.mjs`（doctor） | AC-11 |
| M4 | 续跑扩展承接 | `assets/pi-extensions/**`、`src/commands/deploy.mjs`（`--with-*` 分支） | AC-7 |
| M5 | 文档 | `docs/HARNESS.md`、`docs/ARCHITECTURE.md`、`README.md`、`templates/agents-snippet.md` | AC-8 |
| M6 | 测试 | `test/*.test.mjs` | AC-9、AC-11 |
| M7 | 实机部署与验证 | 无（部署动作） | AC-10 |

## 8. 验收判据

- **AC-1** `node bin/shipgate.mjs install --harness kimi --dry-run` 显示 kimi 的 skills 目标为 `~/.kimi-code/skills`，注入 `~/.kimi-code/AGENTS.md`，且标注 gate 为「-」（软约束）。
- **AC-2** `node bin/shipgate.mjs install --harness antigravity --dry-run` 显示 skills 目标为 `~/.gemini/antigravity/skills`，且明确写「inject 跳过：全局规则文档路径未验证」。
- **AC-3** `node bin/shipgate.mjs doctor` 对 zcode 给出「未支持 + 原因」，不假装探测成功。
- **AC-4** 当 `~/.agents/skills` 为链接时：`install --harness pi --dry-run` 输出 `~/.agents/skills -> C:\Users\...\.claude\skills（跟随链接）`；实际安装后 27 个 skill 出现在链接目标，且不产生 `~/.agents/skills` 第二份副本。
- **AC-5** `shipgate doctor` 在检测到**第二份真实门控产物**时输出 `LEGACY_GATE_DUPLICATE`，并给出一条可执行的停用命令。判定必须基于产物特征（含 `policy.js` 或 `classifier.js`），**不能仅凭目录存在**：provider 网关扩展（只有 `index.ts`）不得被误报。急停命令必须把目录移出 `extensions/`（留在目录内改名仍会被 pi 自动加载）。
- **AC-6** `shipgate doctor` 在检测到 `~/.config/agent-config-bridge/gate-policy.json` 时输出 `LEGACY_POLICY_SOURCE`：两份 mode **不同**时为 `warn`（指出差异），**相同**时降为 `info`（已不影响行为，仅建议清理）；停用命令必须按平台生成（Windows → `Move-Item`，POSIX → `mv`）。dsh 挂载非 `enforce-rules` 时输出 `DSH_GATE_MISMOUNT`。
- **AC-7** `shipgate install --with-goal-mode --harness pi` 把 `goal-mode.ts` 写入 `~/.pi/agent/extensions/goal-mode.ts`，已存在则备份；`--with-goal-mode --with-auto-continue` 同时指定退出码 2。
- **AC-8** `docs/HARNESS.md` 含 kimi / antigravity / zcode 三行，zcode 行写明不支持原因；含 `.agents/skills` 归属表（bridge 建链、ShipGate 跟随）。
- **AC-9** `node --test test/*.test.mjs` 全绿（新增用例：kimi/antigravity 矩阵、链接跟随、legacy gate 检测、`--with-*` 互斥）。
- **AC-10** 实机执行 `shipgate install --yes` 后：`shipgate status` 中 kimi/antigravity 为 managed（若目录存在）、`doctor` 无 `LEGACY_GATE_DUPLICATE`（已停用 bridge 那份）、policy 只剩一份真源、`~/.claude/skills` 数量变化符合预期且 pi 仍可读到同一份。
- **AC-11** `shipgate doctor` 在 skills 目录里检测到「扁平 `<name>.md` 与同名 `<name>/SKILL.md` 并存」时输出 `FLAT_SKILL_DUPLICATE` 及数量，并给出可执行、可回滚的清理命令；只报告不删除。**同一物理目录被多个 harness 共用时（pi/dsh 共享 `~/.agents/skills`）只报一次**，并列共用者；清理命令按平台生成（Windows → PowerShell，POSIX → `mv`）。
- **AC-12** dsh 的 skills 落点必须是其原生技能根 `~/.agents/skills`（与 pi 同一条链接），不是 `~/.dsh/skills`：`install --harness dsh --dry-run` 显示 `skills → <…>\.agents\skills`；安装后该目录（或其链接目标）含 27 个 ShipGate skill。依据：`agent-config-bridge/bridge/targets/dsh.json` 的 VERIFIED 注记「`~/.agents/skills` is a native user skill root … the same link pi uses is enough」。

## 9. DoR / DoD

- DoR：PRD 已批准；三件套齐；`spec check` 通过；bridge 侧配套 CHG 已立（可并行）。
- DoD：AC-1…AC-12 全绿；TRACEABILITY 逐条填实测；README/docs 与实现一致；无「后续再做」遗留；实机部署无重复门控。
