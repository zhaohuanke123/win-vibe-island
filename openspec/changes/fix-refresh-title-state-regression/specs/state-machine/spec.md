## ADDED Requirements

### Requirement: Stop Phase Permanence

`Stop` 事件将 session 转入 `completed` 后，后续延迟任务（如 title 刷新、清理）MUST NOT (MUST NOT) 将状态回退到 `running` 或其他非完成态。
涉及延迟回调的状态发射 MUST (MUST) 接受显式的 phase 参数，调用方按当前真实状态传入，不得硬编码 `Running`。

#### Scenario: Stop 后延迟 title 刷新

- **WHEN** `handle_stop` 将 session 设为 `completed`，随后（约 200ms）延迟任务调用 `try_refresh_title`
- **THEN** `try_refresh_title` MUST 传入 `Some(SessionPhase::Completed)`，发射的 `state_change` 保持 `completed`，前端 MUST NOT 观察到回退到 `running` 的闪烁
