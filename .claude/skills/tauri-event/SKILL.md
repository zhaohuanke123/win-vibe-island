---
name: tauri-event
description: |
  新增 Tauri 后端→前端事件推送的完整流程。包括 Rust 端事件定义和前端监听。
  触发条件：
  - 用户要求添加后端推送事件
  - "新增 emit"、"后端通知前端"、"添加事件监听"
  - 需要从 Rust 端主动推送数据到前端
  不要触发：前端→后端的命令调用（应使用 tauri-command）、纯前端事件
---

# Tauri 事件添加流程

## 前置检查

- 确认 Documentation Gate 已通过
- 确认事件名不与现有事件冲突（检查 `events.rs`）

## 步骤

### 1. 定义事件类型

在 `src-tauri/src/events.rs` 添加：

```rust
#[derive(Debug, Clone, Serialize)]
pub struct MyEvent {
    pub field: String,
}
```

### 2. 定义发射函数

在 `src-tauri/src/events.rs` 添加：

```rust
pub fn emit_my_event(app: &AppHandle, event: MyEvent) -> Result<(), String> {
    app.emit("my_event", &event)
        .map_err(|e| format!("Failed to emit my_event: {}", e))
}
```

### 3. 在业务模块中调用

在需要触发事件的地方（如 `pipe_server.rs`、`hook_server.rs`）：

```rust
events::emit_my_event(&app, MyEvent { field: value });
```

### 4. 前端监听

在 `frontend/src/hooks/useAgentEvents.ts` 或新建 hook 中：

```typescript
interface MyEventPayload {
  field: string;
}

const unlisten = await listen<MyEventPayload>("my_event", (event) => {
  // 处理事件，通常更新 Zustand store
});
```

### 5. 验证

- 运行 `cargo check` 确认编译通过
- 可使用 `simulate_*` 测试命令验证事件流

## 参考文档

- `architecture.md` 的 Tauri Events 章节 — 完整事件表
- [[session-flow]] — 完整事件处理链路
- [[state-machine]] — 状态变更事件的转换矩阵
- [[tauri-command]] — 对应的前端→后端命令流程

## 检查清单

- [ ] 事件类型有 `#[derive(Debug, Clone, Serialize)]`
- [ ] 事件名使用 `snake_case`
- [ ] 发射函数有错误处理
- [ ] 前端有对应的 `listen()` 调用和类型定义
- [ ] `cargo check` 通过
