---
name: tauri-command
description: |
  新增 Tauri IPC 命令的完整流程。从前端 invoke 到后端 command 定义，包括注册和 hook 封装。
  触发条件：
  - 用户要求添加新的前后端通信命令
  - "新增 IPC"、"添加 invoke"、"加个命令"、"添加一个 tauri command"
  - 用户需要后端提供数据给前端（非事件推送）
  不要触发：纯前端逻辑、纯后端逻辑（不涉及 IPC 通信）、事件推送（应使用 tauri-event）
---

# Tauri IPC 命令添加流程

## 前置检查

- 确认 Documentation Gate 已通过
- 读取 `architecture.md` 确认模块归属

## 步骤

### 1. 定义命令函数

在 `src-tauri/src/commands.rs` 添加：

```rust
#[tauri::command]
pub fn my_command(param: String) -> Result<ReturnType, String> {
    // 调用对应模块的实现
}
```

注意：
- 参数和返回值必须可序列化（实现 `Serialize`/`Deserialize`）
- 需要 AppHandle 时加参数 `app: AppHandle`
- 需要窗口时加参数 `window: WebviewWindow`
- Win32 相关代码加 `#[cfg(target_os = "windows")]` 条件编译

### 2. 注册命令

在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![...]` 中添加 `commands::my_command`。

### 3. 前端 hook 封装

在 `frontend/src/hooks/` 中创建或更新 hook：

```typescript
export async function myCommand(param: string): Promise<ReturnType> {
  return invoke<ReturnType>("my_command", { param });
}
```

### 4. 验证

- 运行 `cargo check` 确认编译通过
- 运行 `npm run build` 确认前端构建通过

## 参考文档

- `architecture.md` 的 IPC Commands 章节 — 完整命令分类表
- [[session-flow]] — 完整事件处理链路
- [[tauri-event]] — 对应的后端→前端事件流程

## 检查清单

- [ ] 命令函数有 `#[tauri::command]` 标注
- [ ] `lib.rs` 已在 `generate_handler![...]` 中注册
- [ ] 前端 hook 已封装 `invoke()` 调用
- [ ] Win32 代码有条件编译和 stub
- [ ] `cargo check` 通过
