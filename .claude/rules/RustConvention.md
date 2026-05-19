# Rust 编码规范

本项目后端基于 Rust + Tauri 2.0，以下是必须遵循的编码约定。

## 命名

- 文件名：`snake_case`（如 `pipe_server.rs`、`command_analyzer.rs`）
- 类型/结构体/枚举：`PascalCase`（如 `SessionStart`、`PipeServerStatus`）
- 函数/方法/变量：`snake_case`（如 `emit_session_start`、`get_config`）
- 常量：`SCREAMING_SNAKE_CASE`（如 `LAST_REGION_KEY`）

## 条件编译

所有 Win32 平台特定代码必须使用条件编译，并提供非 Windows 平台的 stub 实现：

```rust
#[cfg(target_os = "windows")]
{
    // Windows 实现
}

#[cfg(not(target_os = "windows"))]
{
    // stub 或 no-op
}
```

## 错误处理

- 命令函数返回 `Result<T, String>`，使用 `map_err(|e| e.to_string())` 或 `format!("...: {}", e)`
- 复杂模块可使用 `thiserror` 定义错误类型
- 日志使用 `log` crate 的宏：`log::info!`、`log::warn!`、`log::error!`、`log::trace!`
- 遵循 `LOGGING_CONTRACT.md` 的错误处理规范

## 模块组织

- 每个模块一个文件（如 `pipe_server.rs`、`overlay.rs`）
- `lib.rs` 仅做 `mod` 声明和 `tauri::Builder` 配置
- 新增模块必须在 `lib.rs` 中添加 `mod <name>;`

## Tauri 命令

- 使用 `#[tauri::command]` 标注
- 需要窗口引用时参数类型为 `window: WebviewWindow`
- 需要 app 引用时参数类型为 `app: AppHandle`
- 新命令必须在 `lib.rs` 的 `tauri::generate_handler![...]` 中注册

## HWND 处理

- HWND 句柄必须序列化为字符串传递给前端（`format!("{:?}", hwnd)`）
- 前端传回时使用 `parse_hwnd()` 函数解析
- 禁止将原始指针直接传递给前端

## 日志

- 使用结构化日志格式：`"[function_name] key=value, key2=value2"`
- 关键操作（IPC 命令、窗口操作、服务器启停）必须有 info 级别日志
- 高频操作（如动画帧）使用 trace 级别
