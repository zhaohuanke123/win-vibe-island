## Why

`src-tauri/src/hook_server.rs` 的 `try_refresh_title()` 硬编码 `phase: SessionPhase::Running` 并发射 `state_change: "running"`。
在 `handle_stop` 的 200ms 延迟任务（L755-764）中被调用时，session 已被 `handle_stop` 设为 `completed`，但 `try_refresh_title` 又把状态回退到 `running`。

实际流程：`handle_stop → state_change: completed & SessionCompleted → 200ms → try_refresh_title → ActivityUpdated(Running) & state_change: running`。
前端表现为：已完成的 session 短暂闪烁回 running 状态。

这违反 `openspec/specs/state-machine/spec.md` 的「Legal State Transitions」不变量（Stop 后不得回到 running）。

对应 cron-review critical **HOOK-010**。

## What Changes

给 `try_refresh_title` 增加 `opt_phase: Option<SessionPhase>` 参数：Stop 路径传入 `Some(SessionPhase::Completed)`，其他路径传入 `None`（使用默认 `Running`）。延迟刷新 title 时保持已完成状态，不再回退。

## Non-Goals

- 不重构 `try_refresh_title` 的 title 刷新逻辑本身
- 不调整 `handle_stop` 的主状态转换（completed）

## Capabilities

### New Capabilities
（无）

### Modified Capabilities

- **state-machine**：新增 `Stop Phase Permanence` requirement（delta 见 `specs/state-machine/spec.md`）。原 spec 只定义 Stop 的合法转换，未约束延迟回调不得回退；本 change 补齐该不变量。

## Impact

- 受影响文件：`src-tauri/src/hook_server.rs`（`try_refresh_title` 签名 + 所有调用点，特别是 L353-372、L755-764）
- 行为变化：Stop 后 200ms 的 title 刷新保持 completed 状态，前端不再闪烁回 running
- 风险：需检查所有 `try_refresh_title` 调用点，确认 `None` 默认值不破坏现有路径
