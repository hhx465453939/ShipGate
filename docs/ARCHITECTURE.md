# 架构

三层，职责不许越界：

```
bin/shipgate.mjs ─► src/cli.mjs（解析 argv、加载配置、分发）
                        │
        ┌───────────────┼────────────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   src/gates/*     src/harness/*    src/inject/*       src/lib/*
   判断过不过       知道装到哪        幂等写注入          fsx/exec/cfg/state/skills/update
```

## 1. 闸层（`src/gates/`）

每个闸输出统一的 `Verdict`：

```js
{ gate, ok, code, summary, findings[], evidence }
```

- `code` 就是路由结论：`0` 通过 / `1` 拦下 / `2` 用法错 / `3` 环境缺。
- 闸不写文件、不装东西。`quality` / `security` 只做**委派**（调 aislop / 检查 cbh），不重写引擎逻辑。
- `spec` 与 `ship` 是内置判据（契约完整性、manifest 一致性）。

## 2. 适配层（`src/harness/`）

一份 `harness profile`：

```js
{ id, label, detect, skills, inject, gate }
```

`gate` 只有自由度高的 harness 才需要（pi / dsh），指向 `assets/pi-gate/` 那份 vendored 硬门控产物。Claude Code / Codex 这类成熟 harness 不带 `gate`，靠 skills + 注入文档约束。

自定义 harness 从 `~/.config/shipgate/config.json` 的 `custom` 读取，不改代码就能接新 agent。

## 3. 渲染层（`src/inject/`）

注入 = 托管区块，幂等是硬要求：

- 区块内不含时间戳 → 同样输入必出同样字节。
- 区块外内容永不改写；没有区块时只**追加**。
- 每次改写前留 `*.shipgate-bak.<YYYYMMDD>`（每天一份，避免刷屏）。

## 数据落点

| 文件 | 作用 |
|---|---|
| `~/.config/shipgate/config.json` | 全局配置（harness 列表、阈值、自动更新） |
| `~/.config/shipgate/manifest.json` | 受管状态（每 harness 的 skills hash、注入版本、安装时间） |
| `~/.cache/shipgate/last-update-check` | 每日一次更新检查的日期戳 |
| `<repo>/.shipgate/config.json` | 项目级覆盖（阈值、spec 目录、scope） |

## 零依赖

运行时只用 Node 内置模块（`fs` / `path` / `child_process` / `crypto` / `fetch`）。理由：这台机器只有 8 GiB 内存且常年吃紧，任何依赖都会让 `install` 变成不确定事件。
