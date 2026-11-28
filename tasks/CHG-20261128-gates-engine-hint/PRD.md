# PRD — `shipgate gates` 的引擎提示改成真话

- 变更编号：`CHG-20261128-gates-engine-hint`
- 状态：approved
- 关联：承接 `CHG-20261128-engines-onboarding`（那次换了 `checkEngines()` 的安装提示，但 `shipgate gates` 没走这条路）

## 1. 背景（2026-11-28 全局部署核验时发现）

装完引擎、跑全局部署核验，`shipgate gates` 打印：

```
引擎
aislop ok   cbh ok
缺失引擎：npm i -g aislop  /  pipx install git+https://github.com/elementalsouls/Claude-BugHunter
```

两处冲突：

1. **自相矛盾**：上面说 `ok ok`，下面说「缺失引擎」。这行是无条件打印的（`src/commands/gates.mjs` 里 `log.info` 直出）。
2. **命令是过期的**：`pipx install git+…` 在本机必失败（无 pipx、pip 默认镜像返回空版本表），而 `CHG-20261128-engines-onboarding` 已经把正确提示封进 `checkEngines()` —— 只是 `gates` 没调用它。

同一处代码还暴露两个结构问题：

- `resolveAislop` 有两份调用口径（`gates/quality.mjs` 定义，deploy 与 gates 各自 import），引擎信息的「唯一真源」并不唯一；
- 上一次改动把 `export function checkEngines(ctx) {` 与函数体第一行并到了一行（语法合法但可读性差），顺手修掉。

## 2. 目标

| # | 目标 | 可验证结果 |
|---|---|---|
| G1 | `gates` 的输出不再撒谎 | 引擎齐全时零「缺失引擎」字样；缺哪个才列哪个 |
| G2 | 安装提示只有一处真源 | `checkEngines()` 抽到 `src/lib/engines.mjs`，`gates` / `doctor` / `install` 共用 |
| G3 | 缺引擎时的提示本机可执行 | 与 `CHG-20261128-engines-onboarding` 一致：有 pipx 走 pipx，没有走 clone + `-i https://pypi.org/simple` |

## 3. 非目标

- 不改闸的判定逻辑与退出码；`shipgate gates` 仍是「清单 + 引擎状态」，不是闸本身。
- 不动 `deploy` 的 doctor/install 输出格式（只换成从 lib 取数）。
- 不做命令层重构（`commands/gates.mjs` 仍只负责渲染）。

## 4. 关键用户故事

1. 作为照文档排查「闸为什么不过」的人，`shipgate gates` 不该在同一次输出里既说 ok 又让我去装引擎。
2. 作为维护者，我改引擎提示只需要动 `src/lib/engines.mjs` 一处，不用记哪个命令是另一套。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 抽 lib 时漏掉调用点导致 `deploy` 崩 | 现有 doctor/install 的引擎节有单测与会话实测兜底；改完立刻跑 `shipgate doctor` 对比输出 |
| 把 `reportEngines` 放进 lib 造成 lib 依赖 `log` | `lib/log.mjs` 本来就是零依赖渲染层，lib → lib 合法；不引入 gates/commands 反向依赖 |
