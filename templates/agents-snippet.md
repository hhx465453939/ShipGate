<!-- shipgate:begin v1 -->
## ShipGate 闸链（`shipgate install` 维护的托管区块，勿手改区块内内容）

本机已部署 ShipGate {{VERSION}}。写代码不是想写就写，四道闸按事件触发：

| 闸 | 什么时候过 | 命令 | 对应 skill |
|---|---|---|---|
| spec | 任何代码改动之前 | `shipgate spec check` | `shipgate-spec` |
| quality | 每次编辑后 / 提交前 | `shipgate quality` | `shipgate-quality` |
| security | 提交前 / 发布前（必须显式给范围） | `shipgate security --scope <scope.md>` | `shipgate-security` |
| ship | 装/升级/换 harness 之后 | `shipgate status` | `shipgate-install` |

硬规则：

1. `quality` 不通过（score < {{MIN}} 或有 error 级发现）→ 先 `aislop fix` 修可自动修的部分，再交；不许带病提交。
2. `security` 没有 `--scope` 会被 ShipGate 直接拒绝（退出码 2）。主动探测类动作永不自动执行，范围由人确认。
3. `spec` 不通过 → 先补契约三件套（`PRD.md` / `SPEC.md` / `TRACEABILITY.md`）；没有契约的改动不算完成。
4. 排查入口一律 `shipgate doctor`；不知道走哪道闸就问 `shipgate gates`。

<!-- shipgate:end -->
