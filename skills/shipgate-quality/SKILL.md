---
name: shipgate-quality
description: 质量闸使用方法（aislop）。当需要给代码打分、修 AI 留下的 slop（空话注释、吞异常、as any、幻觉 import、死代码、超大函数）、配置 per-edit 钩子或 CI 阈值时使用。覆盖 scan/fix/agent/ci/hook 的正确用法与失败处置。
---

# quality 闸 — 反 AI slop

## 何时用

- 每次编辑后 / 提交前：`shipgate quality`（内部调 `aislop scan --json`）。
- 分数不达标：`aislop fix` 修机械问题，剩下的交给 `aislop agent`。
- 想每次编辑自动拦：`aislop hook install --claude`（需显式执行，ShipGate 不代劳）。

## 引擎自检（先跑这个）

quality 闸本身不实现规则，全部委派给 `aislop`。引擎不在，闸只会返回 code 3 —— 先把引擎装好再谈分数。

```bash
which aislop            # 是否在 PATH（Windows 上是 aislop.CMD）
aislop --version        # 期望 0.23.0+（本机实测版本）
aislop doctor           # 四个引擎：Formatting / Linting / Code Quality / AI Slop 都应 ready
```

装引擎：

```bash
npm i -g aislop
```

判读与坑：

- `aislop doctor` 有引擎 `✗` → 先修引擎（例如 oxlint 与老 CPU 指令集不兼容会 SIGILL），别去改代码分数。
- 引擎装在 PATH 上一次即可：**所有 harness 的 shell 工具共享同一份**（claude / pi / dsh / codex / gemini / cursor / kimi / antigravity），不需要按 agent 各装一遍。
- 只有**指导**按 harness 分发：这份 skill 被复制到每个 harness 的 skills 根，引擎命令本身是全局的。
- `shipgate doctor` 会打印引擎绝对路径与「bin 目录不在 PATH」告警；看到这条告警说明某个 shell 里调不到它。

## 命令

```bash
shipgate quality                    # 本仓库，阈值来自 .shipgate/config.json 或默认 80
shipgate quality src --min 90        # 指定目录与阈值
shipgate quality --json              # 机器可读 Verdict

aislop scan . -d                    # 人读明细
aislop fix                          # 自动修（可逆）
aislop fix -f                       # 激进修复：依赖、未用文件
aislop agent                         # 交给本地 agent 在隔离 worktree 修
aislop ci                            # CI 模式（项目自带阈值）
aislop hook install --claude         # 每次编辑后跑
```

## 判定

- `ok` 需要同时满足：`score >= min` **且** 没有 `severity=error` 的发现。
- `scoreable=false`（引擎没跑起来，例如 oxlint 失败）按**不通过**处理——不许当绿。
- 退出码：`0` 通过 / `1` 不通过 / `3` aislop 未安装。

## 失败处置顺序

1. `aislop fix`（机械、可逆）
2. 看剩余 findings 的 `rule` + `category`，人工改：空话注释删掉、吞异常改成抛出或记录、`as any` 换成具体类型、幻觉 import 删除
3. 结构性大改（超大函数、重复 helper）→ 走 `aislop agent` 或人工重构，别硬压分数
4. 确属误报 → 在 `.aislop/config.yml` 精确豁免该规则，并写清理由

## 常见 slop 类别（改代码时主动避免）

| 类别 | 表现 |
|---|---|
| 叙事注释 | `// 这里我们遍历数组` 这种自解释代码的注释 |
| 吞异常 | `catch {}` / `catch (e) { return null }` |
| 隐藏兜底 | `try { x } catch { fallback }` 掩盖真实错误 |
| 类型逃逸 | `as any`、`@ts-ignore` |
| 幻觉 import | 引用了不存在的包/路径 |
| 死代码 | 未使用的导出、文件、参数 |
| 巨型函数 | 圈复杂度/嵌套过深 |

## 红线

- 不为过闸而调低阈值、不删测试、不加 `// aislop-disable` 批量豁免。
- 不把 `scoreable=false` 说成"没问题"。
