# 错误处理规范

项目遵循 AI-Native 错误处理原则。完整规范见 `LOGGING_CONTRACT.md`。

## 禁止

- `console.error("something went wrong")` — 无结构、无 error code
- `throw new Error("xxx")` — 不带 context、不带 error code
- catch 后吞掉错误不处理
- `console.log` 记录生产错误

## 前端错误处理

```typescript
// 1. 用 AppError 抛出结构化错误
throw new AppError("TAURI_IPC_ERROR", { userId, action: "fetchSessions" });

// 2. 用 logger 记录
logger.warn("SESSION_PARSE_ERROR", "Session data malformed", { sessionId });

// 3. useLogger hook 在组件内使用
function MyComponent() {
  const { logInfo, logAndThrow } = useLogger();
  logAndThrow("STORE_ERROR", "Store corrupted", { action: "init" });
}
```

## 后端错误处理

- 使用 `log` crate 宏：`log::info!`、`log::warn!`、`log::error!`、`log::trace!`
- IPC 命令返回 `Result<T, String>`，用 `map_err(|e| e.to_string())`
- 结构化日志格式：`"[function_name] key=value, key2=value2"`

## Error Code 命名

`MODULE_SUB_SPECIFIC` — 全大写，下划线分隔
- 前缀：`TAURI_`、`SESSION_`、`STORE_`、`UI_`、`COMPONENT_`
- 举例：`TAURI_IPC_ERROR`、`SESSION_EVENT_ERROR`

## 核心文件

| 文件 | 作用 |
|------|------|
| `frontend/src/shared/app-error.ts` | AppError 类 |
| `frontend/src/shared/error-dictionary.ts` | 错误码注册表 |
| `frontend/src/client/logger.ts` | 浏览器端结构化日志 |
| `frontend/src/client/error-boundary.tsx` | React Error Boundary |
| `src-tauri/src/logger.rs` | Rust 端 JSONL 日志 |

## 生产日志

- 目录：`%APPDATA%/com.vibe-island.app/logs/`
- 文件名：`YYYY-MM-DD.jsonl`（按天轮转）
- 格式：每行一个 JSON 对象
