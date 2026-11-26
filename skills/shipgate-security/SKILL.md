---
name: shipgate-security
description: 安全闸使用方法（cbh / Claude-BugHunter）。当需要做授权范围内的安全审计、漏洞狩猎、接口面排序、或提交前安全检查时使用。覆盖 scope 授权红线、cbh 子命令、85 个 hunt-* skill 的调用、7-Question 门控、findings 落盘与 VRT 定级。
---

# security 闸 — 授权范围内的安全审计

## 硬红线（先读这条，再读其他）

1. **没有书面 scope 不许发探测包**。`shipgate security` 没有 `--scope` 时直接拒绝（退出码 2），这是设计。
2. **永不自动执行**。不接编辑钩子、不在 `install` 里跑、不在 CI 里对生产发请求。
3. **只测 scope 内资产**。越界一条 URL 就可能违法，不是"顺手看看"。
4. **证据脱敏**。报告里不写真实用户 PII、token、内部主机名。

## 何时用

- 用户明确要做安全审计 / 漏洞挖掘 / 渗透测试，且能给出授权范围。
- 提交前的安全检查（针对自有代码仓库：静态面 + 依赖面，不做外部探测）。
- 拿到一个 taget 想做侦察排序 → `/recon` → `/surface`。

## 流程

```bash
# 0. 准备范围（必须由人确认）
shipgate security --scope ./scope.md        # 只校验范围 + 打印下一步，不发包

# 1. 侦察（被动优先）
cbh recon <target>            # crt.sh + subfinder + httpx
cbh surface <target>          # 按攻击面排序（先打哪里）

# 2. 归类与狩猎
cbh classify "<url>"          # URL → 应该用哪个 hunt-* skill
# 然后按 classify 结果调用对应 skill：hunt-idor / hunt-auth-bypass / hunt-graphql ...

# 3. 验证与出报告
cbh triage findings/<x>.md    # 7-Question Gate：是不是真发现
cbh report findings/<x>.md --platform h1 --out drafts/
```

## cbh 与 slash command 的分工

| 场景 | 用 |
|---|---|
| 会话里带判断地挖 | Claude Code 的 `/hunt` `/triage`（skill 全文 + LLM 判断） |
| CI / 定时 / 可复现 | `cbh`（确定性、退出码稳定） |
| 批量被动侦察 | `cbh recon` |
| 读 skill 但没装 Claude Code | `cbh` + 直接读 skills/ |

## findings 落盘

每个候选发现一个文件，字段固定，缺字段不算发现：

```
findings/<class>-<yyyy-mm-dd>.md
- 资产 / 端点
- 复现步骤（curl 或 Burp 原始请求）
- 影响（能拿到什么，谁受影响）
- 证据（响应片段，脱敏）
- 7-Question 结论
- VRT 定级建议
```

## 别做的事

- 不把 `subfinder`/`httpx` 批量扫描对着未授权域名跑。
- 不为了"有产出"把低危卫生问题（缺 CSP、栈信息泄露）包装成漏洞——用 `cbh triage` 过一遍。
- 不在报告里贴未脱敏的个人数据。
