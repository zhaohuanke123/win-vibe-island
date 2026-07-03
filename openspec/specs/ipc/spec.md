# IPC Specification

## Purpose

定义 Tauri 前后端通信的契约面：命令/事件命名、注册、节流、HWND 序列化、payload 序列化、前端封装。
覆盖 `architecture.md` 的 IPC Commands 表与 Tauri Events 表所列全部命令/事件。

实现参考：`src-tauri/src/lib.rs`（`generate_handler!`）、`src-tauri/src/commands.rs`、`src-tauri/src/events.rs`、`frontend/src/hooks/`。

## Requirements

### Requirement: Command and Event Naming

Tauri 命令名（前端→后端）与事件名（后端→前端）MUST (MUST) 用 `snake_case`（如 `set_window_size`、`submit_approval_response`、`session_start`、`state_change`、`permission_request`）。前端调用 MUST (MUST) 用字符串精确匹配。

#### Scenario: 新增命令命名

- **WHEN** 新增一个获取会话详情的命令
- **THEN** 命名 MUST 为 `get_session_details`（snake_case），不得用 `getSessionDetails`

### Requirement: Command Registration

每个 `#[tauri::command]` 函数 MUST (MUST) 在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![...]` 中注册，否则前端 `invoke()` 调用会失败。

#### Scenario: 忘记注册

- **WHEN** 新命令未加入 `generate_handler!`
- **THEN** 前端 invoke 报「command not found」；代码审查 / 测试 MUST 拦截

### Requirement: HWND String Serialization

HWND 句柄 MUST (MUST) 序列化为字符串（`format!("{:?}", hwnd)`）跨 Tauri IPC 传递；前端传回时 MUST (MUST) 用对应解析函数。禁止 (MUST NOT) 直接传递 raw 指针。

#### Scenario: 后端返回 HWND

- **WHEN** `create_overlay` 返回 HWND 给前端
- **THEN** 返回值 MUST 是字符串（如 `"0x1234"`），不得是数字指针

### Requirement: High-Frequency IPC Throttling

高频 IPC（如 `update_overlay_size`、`update_overlay`）MUST (MUST) 至少 16ms 节流；后端用 `AtomicU64` / `AtomicI32` 缓存避免重复计算；前端用 `requestAnimationFrame` 或 throttle hook 控制调用频率。

#### Scenario: 动画驱动的高频 resize

- **WHEN** 前端动画每帧调用 `update_overlay_size`
- **THEN** 实际跨 IPC 调用 MUST 被 ≥16ms 节流

### Requirement: Payload Serialization Conventions

Rust 端 IPC payload MUST (MUST) 派生 `Serialize` / `Deserialize`；枚举与字段 MUST (MUST) 用 `#[serde(rename_all = "camelCase")]` 保持前端命名一致；动态类型用 `serde_json::Value`。

#### Scenario: 枚举变体序列化

- **WHEN** 后端发射含 `SessionPhase::WaitingForApproval` 的事件
- **THEN** 前端收到 `waitingForApproval`（camelCase），不得是 `WaitingForApproval`

### Requirement: Frontend IPC Wrapping

前端组件 MUST NOT (MUST NOT) 直接调用 `invoke()`；所有 IPC 调用 MUST (MUST) 封装在 `frontend/src/hooks/` 的自定义 hook 中（如 `useAgentEvents.ts`）。事件监听 MUST (MUST) 用 `@tauri-apps/api/event` 的 `listen()`，返回 `UnlistenFn` 在 `useEffect` 中清理。

#### Scenario: 组件内直接 invoke

- **WHEN** React 组件直接调 `invoke("set_window_size", ...)`
- **THEN** 违反封装约束；MUST 抽到 hook
