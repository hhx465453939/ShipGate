---
change_id: CHG-20261128-gate-bundle-integrity
version: 1
status: approved
prd_ref: PRD.md
supersedes: null
extends: CHG-20261128-engines-onboarding
approved_by: shpc_101170
approved_at: 2026-11-28
---

# PRD — 门控产物完整性与引擎自诊断

## 1. 背景

2026-11-28 在一台 Ubuntu 20.04（GLIBC 2.31）主机上按 README 一键部署，暴露出三个可复现缺陷。它们都不是"用户环境特殊"，而是产物与判定本身缺一层：

1. **策略文档被旧副本反向覆盖**：`install` 把 harness 上已有的整份 `policy.json`（v5）合并后写回真源，下一次安装又把这份旧文档投给另一个 harness。结果两个 harness 跑着新代码（v6/v7 引擎）+ 旧文档（v5 的 reminder/description），真源里也混进了文档字段。
2. **dsh 装上了但加载不了**：`assets/gates/index.js` 导出的是 **pi** 适配器，`copyTree` 原样复制；目录里也没有 `package.json {"type":"module"}`，dsh 的 ESM 插件解析必然失败。"已安装"因此不等于"能加载"。
3. **引擎级失败被当成代码问题**：aislop 自带的 Python 引擎二进制要求 GLIBC ≥ 2.34，老发行版上动态链接失败、输出为空，aislop 把它报成 `ruff/engine-error` 的 error 级发现。`quality` 闸照单全收，报"score 86，1 个 error"，让人以为代码有问题；`aislop doctor` 还显示四个引擎全 ready，掩盖了真相。

## 2. 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | 真源只保存策略配置，不保存文档 | install 后真源只有 `config`；重复 install/sync 幂等 |
| G2 | 每个 harness 的文档来自它自己的出厂版本 | pi = v6、dsh = v7，且含各自的 reminder 措辞 |
| G3 | dsh 产物天然可加载 | 目录内有 `package.json {"type":"module"}`，入口指向 dsh 适配器 |
| G4 | 引擎跑不起来 ≠ 代码有问题 | 引擎级错误返回退出码 3 + 可照抄的处置命令 |
| G5 | 同类问题下次能自己暴露 | `doctor` 在"老 glibc + 可执行的 bundled Python 引擎"时给出明确告警 |
| G6 | 本仓能通过自己的 quality 闸 | `shipgate quality .` ≥80 且 0 error |

## 3. 用户与场景

- **单机多 agent 的操作者**：一台机器装 claude / pi / dsh / codex / gemini / cursor / kimi / codebuddy / zcode，期望"装一次、各处一致"。
- **CI 使用者**：希望 quality 闸的失败能区分"改代码"与"修环境"，否则红灯没有信息量。

## 4. 范围

**做**：`installGateBundle` 的合并方向与产物完整性；`quality` 闸的引擎级错误分类；`doctor` 的引擎可执行性诊断；本仓 3 个 Python 脚本的 5 处 lint；对应单测与文档。

**不做**：不改 aislop / cbh 上游；不自动改写 dsh 的 `cordis.patch.yml`（用户设置面）；不引入依赖；不改门控判定规则本身。

## 5. 成功信号

- 重复执行 `shipgate install` 后，三份策略文件的内容与版本保持稳定（真源 config-only、pi v6、dsh v7）。
- 在没有系统 ruff、只有 aislop bundled 引擎的老 glibc 机器上，`shipgate quality` 退出码是 3 且提示可照抄；`shipgate doctor` 主动指出同一问题。
- `node --test test/*.test.mjs`、`migrate-skillpack --check`、`spec check`、`quality` 四道自检全绿。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 调整合并方向后丢掉用户在 `policy.json` 里手改的配置 | 只换文档字段，`config` 仍按"出厂默认 ← 既有 ← 真源"三层合并，且 protected worktrees 取并集并回写真源 |
| dsh 的入口文件被写坏 | 入口内容固定为一个 re-export，单测断言两种 kind 的入口文本 |
| 引擎错误被过度降级成 3，真问题被漏掉 | 只有 `*/engine-error` 规则命中才降级；普通 finding 仍按 error 计 |
