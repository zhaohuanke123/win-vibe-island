# Error Handling Specification

## Purpose

定义 Vibe Island 跨层结构化错误处理契约：前端 `AppError` + `logger`、Rust `log::` 宏、IPC 错误返回、生产日志格式。
这是 `.claude/rules/ErrorHandlingConvention.md` 与 `LOGGING_CONTRACT.md` 的行为真相源。

实现参考：`frontend/src/shared/app-error.ts`、`frontend/src/shared/error-dictionary.ts`、`frontend/src/client/logger.ts`、`frontend/src/client/error-boundary.tsx`、`src-tauri/src/logger.rs`。

## Requirements

### Requirement: Structured Frontend Errors

前端 MUST (MUST) 用 `AppError` 抛结构化错误（带 error code + context），禁止 (MUST NOT) 用裸 `throw new Error("...")`。

#### Scenario: IPC 调用失败

- **WHEN** 前端 invoke 调用返回 Err
- **THEN** MUST 抛 `new AppError("TAURI_IPC_ERROR", { action, ... })`，不得抛裸 Error

### Requirement: Error Code Naming

Error code MUST (MUST) 用 `MODULE_SUB_SPECIFIC` 格式（全大写下划线分隔），前缀取自 `frontend/src/shared/error-dictionary.ts`（如 `TAURI_`、`SESSION_`、`STORE_`、`UI_`、`COMPONENT_`）。

#### Scenario: 新增 error code

- **WHEN** 为会话事件解析错误定义新 code
- **THEN** MUST 命名如 `SESSION_EVENT_ERROR`，并在 `error-dictionary.ts` 注册

### Requirement: Structured Frontend Logging

前端 MUST (MUST) 用 `logger`（`frontend/src/client/logger.ts`）记录日志；禁止 (MUST NOT) 用 `console.log` / `console.warn` / `console.error` 记录生产错误或诊断信息。组件内 MUST (MUST) 用 `useLogger` hook。

#### Scenario: 非 Tauri 环境检测

- **WHEN** 前端在浏览器（非 Tauri）环境检测到 API 不可用
- **THEN** MUST `logger.warn(ERROR_CODE, message, context)`，不得 `console.warn`

### Requirement: No Silent Catch

前端 `catch` 块 MUST NOT (MUST NOT) 完全静默吞错（`catch(() => {})` 或空 catch）。对于不打断用户的非关键失败，MUST (MUST) 至少 `logger.warn(ERROR_CODE, context, { error: String(e) })` 记录。

#### Scenario: 非关键 IPC 失败

- **WHEN** flash_taskbar、requestNotification、拖拽同步等非关键调用失败
- **THEN** catch MUST `logger.warn` 记录上下文，不得静默；控制流可继续不打断用户

### Requirement: Rust Structured Logging

Rust 端 MUST (MUST) 用 `log` crate 宏（`log::info!` / `log::warn!` / `log::error!` / `log::trace!`）；结构化格式 MUST (MUST) 为 `[function_name] key=value, key2=value2`；高频操作（动画帧）用 `trace`，关键操作（IPC、窗口操作、服务器启停）用 `info`。

#### Scenario: IPC 命令日志

- **WHEN** 后端收到一个 IPC 命令调用
- **THEN** MUST `log::info!("[cmd_name] arg=value, ...")`，不得用 `println!`

### Requirement: IPC Command Error Return

`#[tauri::command]` 函数 MUST (MUST) 返回 `Result<T, String>`，错误用 `map_err(|e| e.to_string())` 或 `format!("...: {}", e)` 转字符串。

#### Scenario: 后端命令失败

- **WHEN** IPC 命令内部出错
- **THEN** MUST 返回 `Err(string)`，不得 panic；前端收到字符串错误

### Requirement: Production Log Rotation

生产日志 MUST (MUST) 写入 `%APPDATA%/com.vibe-island.app/logs/`，文件名 `YYYY-MM-DD.jsonl`（按天轮转），每行一个 JSON 对象。

#### Scenario: 跨天

- **WHEN** 运行跨过午夜
- **THEN** 新日志 MUST 写入次日文件，旧文件保留
