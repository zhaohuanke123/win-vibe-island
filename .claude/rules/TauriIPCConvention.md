# Tauri IPC 规范

Tauri 前后端通信的约束和约定。

## 命名

- 命令名（前端→后端）：`snake_case`（如 `set_window_size`、`get_hook_server_status`）
- 事件名（后端→前端）：`snake_case`（如 `session_start`、`state_change`、`permission_request`）
- 前端调用时使用字符串匹配：`invoke("command_name", { args })`

## 后端→前端（事件推送）

使用 `app_handle.emit("event_name", &payload)` 发射事件：

```rust
// events.rs
#[derive(Debug, Clone, Serialize)]
pub struct StateChange {
    pub session_id: String,
    pub state: String,
}

pub fn emit_state_change(app: &AppHandle, event: StateChange) -> Result<(), String> {
    app.emit("state_change", &event)
        .map_err(|e| format!("Failed to emit state_change: {}", e))
}
```

前端监听：

```typescript
const unlisten = await listen<StateChangeEvent>("state_change", (event) => {
    // 处理事件
});
```

## 前端→后端（命令调用）

Rust 端定义命令并注册：

```rust
// commands.rs
#[tauri::command]
pub fn my_command(param: String) -> Result<String, String> { ... }

// lib.rs — 必须注册
.invoke_handler(tauri::generate_handler![
    commands::my_command,
    // ... 其他命令
])
```

前端调用：

```typescript
const result = await invoke<string>("my_command", { param: "value" });
```

## Payload 序列化

- Rust 端使用 `#[derive(Serialize, Deserialize)]`
- 前端使用 `serde_json::Value` 处理动态类型
- 枚举使用 `#[serde(rename_all = "camelCase")]` 保持前端命名一致

## 节流

- 高频 IPC（如 `update_overlay_size`）必须 16ms 节流
- 使用 Rust 端的 `AtomicU64`/`AtomicI32` 缓存避免重复计算
- 前端使用 `requestAnimationFrame` 或 throttle hook

## 新增 IPC 流程

1. 后端：`commands.rs` 定义命令函数，`#[tauri::command]` 标注
2. 后端：`lib.rs` 的 `generate_handler![...]` 中注册
3. 前端：在 `hooks/` 中创建对应 hook 封装 `invoke()` 调用
4. 同步更新 `architecture.md` 相关章节
