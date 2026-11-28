# PRD — 引擎上线（aislop / cbh 本机可用 + 多 agent 可达）

- 变更编号：`CHG-20261128-engines-onboarding`
- 状态：approved
- 关联：承接 `CHG-20261128-skill-root-hygiene`（该 CHG 修掉了 quality 闸在 Windows 上从未真正跑通的缺陷）；本 CHG 只做「引擎能装上、能跑通、每个 agent 都知道怎么用」。

## 1. 背景（实测，2026-11-28）

`shipgate doctor` 报两个引擎：

```
▲ aislop 未安装 → npm i -g aislop
▲ cbh 未安装 → pip3 install --user git+https://github.com/elementalsouls/Claude-BugHunter
```

按提示逐个部署，暴露四个环境事实（每个都让「照文档执行」失败）：

| # | 事实 | 证据 |
|---|---|---|
| 1 | 本机 pip 默认镜像不可用 | `pip install --user pipx` → `Could not find a version that satisfies the requirement pipx (from versions: none)`；显式 `-i https://pypi.org/simple` 立刻成功。装 cbh 的构建依赖（`setuptools>=61`）同样被这个镜像卡死 |
| 2 | 没装 pipx | `python -m pipx --version` → `No module named pipx`；而 README 与 security 闸的提示都只给 `pipx install ...` |
| 3 | `pip install git+https://...` 不稳 | 首次 clone 成功但 checkout `exit 128`；改为「先 `git clone` 到 `~/.local/src/Claude-BugHunter`，再 `pip install .`」后成功（还顺带得到可 `git pull` 升级的副本） |
| 4 | `cbh` 没有 `--version` | `cbh --version` → `error: the following arguments are required: command`；ShipGate 的 `version()` 只探 `--version`，于是 doctor 里 cbh 版本栏永远是空的 |

同时核到多 agent 可达性的真实缺口：

- `aislop` / `cbh` 都落在**已在 PATH 上的目录**（`~\AppData\Roaming\npm`、`~\AppData\Roaming\Python\Python313\Scripts`），所以任何 harness 的 shell 工具都能调——引擎是进程级共享的，不需要按 harness 各装一份。
- `shipgate-quality` / `shipgate-security` 两份 skill 在 claude/pi/dsh/codex/gemini/kimi/antigravity 都到位，**唯独 cursor 是 0**：`src/harness/index.mjs` 里 cursor 声明 `skills: null`。而本机 `~/.cursor/skills/`（用户级）与 `~/.cursor/skills-cursor/`（20 个内置 skill：`create-skill`、`loop`、`babysit` …）都存在，证明 Cursor 已支持 Agent Skills，`skills: null` 是过期声明。

## 2. 目标

| # | 目标 | 可验证结果 |
|---|---|---|
| G1 | 两个引擎在本机真实可用 | `aislop doctor` 四个引擎 ready；`cbh --help` 列出 7 个子命令；`shipgate quality` 出分、`shipgate security --scope` 通过且 evidence 里带 cbh 路径 |
| G2 | 失败时的提示能直接照抄执行 | `checkEngines()` 给出的安装命令在本机逐字可跑（含 `-i https://pypi.org/simple`、`git clone` 两步式；有 pipx 时才给 pipx） |
| G3 | 版本探测不再假装 | `cbh` 无 `--version` 时 doctor 明确写「无版本开关」，不显示空白 |
| G4 | 每个 agent 都能拿到指导 | cursor 纳入 skills 分发；9 个 harness 的 skills 目录里都有 `shipgate-quality` / `shipgate-security` |
| G5 | 文档与实况一致 | README / docs/GATES.md / docs/HARNESS.md 写的是本机验证过的命令与坑 |

## 3. 非目标

- 不把 cbh 的 82 个 `hunt-*` skill 装进 ShipGate 仓库或本机 skills 根（体积与迭代频率都不合；需要时用 cbh 自己的 `install.ps1 -All`，命令写进文档）。
- 不改闸的判定逻辑、不降低阈值、不改 security 闸「不自动探测」的红线。
- 不为引擎写包装层（ShipGate 只做委派与提示，`docs/ARCHITECTURE.md` 的既有约定）。

## 4. 关键用户故事

1. 作为新机器上的用户，我照 README 敲引擎安装命令，一次就过（不会先被 pip 镜像和缺失的 pipx 卡住）。
2. 作为在 Cursor 里干活的用户，我要和别的 agent 一样能读到 `shipgate-quality` / `shipgate-security`。
3. 作为排查「闸为什么不过」的人，我跑 `shipgate doctor` 就能分清「引擎没装」和「引擎装了但跑不起来」。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| Cursor 是否真的读 `~/.cursor/skills` 未做官方验证 | 证据：该目录已有用户 skill，`skills-cursor/` 有 20 个内置 skill（`create-skill` 等）；写入路径与官方内置同构。若判断错，代价是 27 个未被读取的目录（可用 `--prune` 清），不会破坏 Cursor |
| 安装命令硬编码 `pypi.org` 在受限网络下同样不可达 | 提示写成「默认镜像失败时显式指定」的备选，而不是唯一路径 |
| 给 cbh 加 `--version` 探测会误伤其他工具 | 只把 `cbh` 标为「无版本开关」，不改 `version()` 的通用行为 |
| 引擎升级后子命令变化 | skill 文档要求先 `cbh --help` 核对子命令，再照写 |
