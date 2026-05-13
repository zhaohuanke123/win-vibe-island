# Logging Contract — Machine-Readable Error Architecture

## 概览

本项目的错误处理遵循 AI-Native 原则。所有错误必须结构化、上下文丰富、AI 可 grep。

## 关键约定

### 禁止
- `console.error("something went wrong")` — 无结构、无 error code
- `throw new Error("xxx")` — 不带 context、不带 error code
- catch 后吃掉错误不处理

### 必须

```typescript
// 1. 用 AppError 抛出结构化错误
throw new AppError("TAURI_IPC_ERROR", { userId, action: "fetchSessions" });

// 2. 用 logger 记录
logger.warn("SESSION_PARSE_ERROR", "Session data malformed", { sessionId });

// 3. 用 ErrorBoundary 兜底 UI
//    main.tsx 已全局包裹 ErrorBoundary，渲染错误自动捕获

// 4. 用 useLogger hook 在组件内记录
function MyComponent() {
  const { logInfo, logAndThrow } = useLogger();
  logInfo("Component mounted");
  logAndThrow("STORE_OPERATION_ERROR", "Store corrupted", { action: "init" });
}
```

## 核心文件

| 文件 | 作用 |
|------|------|
| `src/shared/app-error.ts` | AppError 类 + toAppError 兜底 |
| `src/shared/error-dictionary.ts` | 错误码注册表（AI 自动维护） |
| `src/client/logger.ts` | 浏览器端结构化日志器 |
| `src/client/error-boundary.tsx` | React Error Boundary 组件 |
| `src/client/use-logger.ts` | useLogger hook |
| `LOGGING_CONTRACT.md` | 本文件 — AI 说明书 |

## AI 维护规则

### Error Dictionary 更新流程

```
1. AI 修完一个 bug → 自动 diff 找出实际修改的文件
2. 在 error-dictionary.ts 中找到对应 ErrorRegistry 条目
3. 更新 aiHint:
   - checkFiles = 实际修改的文件路径（相对 src/）
   - possibleCause = 真实根因
   - resolutionGuide = 实际修复方案描述
4. 如果是新 error code:
   - 加入 ErrorCode 联合类型
   - 加入 ErrorRegistry
   - aiHint 可以为空
```

### Error Code 命名

`MODULE_SUB_SPECIFIC` — 全大写，下划线分隔
- 前缀: `TAURI_`, `SESSION_`, `STORE_`, `UI_`, `COMPONENT_`
- 举例: `TAURI_IPC_ERROR`, `SESSION_EVENT_ERROR`, `STORE_OPERATION_ERROR`

---

## 生产日志

生产 exe 的日志通过 Tauri IPC 写入文件：

| 项 | 值 |
|---|---|
| 目录 | `%APPDATA%/com.vibe-island.app/logs/` |
| 文件名 | `YYYY-MM-DD.jsonl`（按天轮转） |
| 格式 | 每行一个 JSON 对象 |
| 内容 | 所有前端 Logger 调用的结构化条目 |

可以告诉 AI："日志在 `%APPDATA%/com.vibe-island.app/logs/`，帮我 grep 最近的错误"。
