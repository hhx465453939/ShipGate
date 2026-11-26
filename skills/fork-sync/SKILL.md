---
name: fork-sync
description: 开源项目 Fork 分支同步管理器。检测本地 fork 与上游仓库的分歧，智能分析冲突，自动合并非冲突代码，逐冲突项决策（保留本地功能 vs 采用上游更新），在新版本基础上嵌入本地功能，测试后灵活推送。
---

# Fork Sync — 开源 Fork 分支同步管理器

## 触发方式

当用户看到类似消息：
> This branch is 20 commits ahead of and 279 commits behind magicyuan876/mineru-tianshu:main

或直接说"同步上游"、"更新 fork"、"merge upstream"时激活。

---

## 工作流程（5 阶段）

### Phase 0：前置检测

执行：
```
git fetch upstream
git rev-list --count HEAD..upstream/main     → behind
git rev-list --count upstream/main..HEAD     → ahead
git log upstream/main..HEAD --oneline        → 你的定制
git log HEAD..upstream/main --oneline        → 上游更新
```

输出诊断报告：ahead/behind 数 + 提交摘要。behind=0 则退出；ahead=0 则可直接 fast-forward。

### Phase 1：冲突分析

```
git merge-base HEAD upstream/main                         → 共同祖先
git diff <base>..HEAD --stat                              → 你的改动范围
git diff <base>..upstream/main --stat                     → 上游改动范围
交叉比对 → 列出同时修改的文件 → 逐文件判定冲突类型
```

输出冲突矩阵：文件 | 本地改动 | 上游改动 | 类型 | 风险

### Phase 2：分层合并

**2a** — 自动合并非冲突文件：
```bash
git merge upstream/main --no-commit --no-ff
git add <non-conflicting-files>
```

**2b** — 逐冲突项三层决策：

1. **上游是否已覆盖？** — 语义分析上游新代码是否等价/超越你的定制
2. **用户选择**：
   - A) 采用上游，放弃本地
   - B) 保留本地，忽略上游
   - C) 嵌入改造（在新版基础上重写本地功能）
   - D) 查看详细 diff 再定
3. **执行**：A→`--theirs`, B→`--ours`, C→进入 Phase 3

### Phase 3：嵌入改造

将本地独有功能移植到新版代码：
- 分析本地功能的核心逻辑
- 在新版代码中定位最佳嵌入点
- 最小侵入原则：优先用 hook/配置扩展
- 用 `# [FORK-CUSTOM]` 标记所有定制代码
- 保持向后兼容

### Phase 4：测试验证

必须执行：构建验证、上游测试套件、本地功能测试、上游新功能冒烟、端到端集成测试。

### Phase 5：版本管理

- **推送选择**：直接 push main / 开新分支 / 手动操作
- **PR 选择**：是否将本地功能整理为 PR 提交到上游

---

## 安全原则

- 合并前确保工作区干净
- 大规模合并(behind>100)先在分支上进行
- 不改写已推送的历史
- 所有 merge 使用 `--no-commit --no-ff`
