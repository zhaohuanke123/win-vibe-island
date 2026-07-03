## ADDED Requirements

### Requirement: Structured Logger Usage

前端代码 MUST (MUST) 使用结构化 `logger`（`frontend/src/client/logger.ts`）记录日志，禁止 (MUST NOT) 使用 `console.log` / `console.warn` / `console.error` 记录生产错误或诊断信息。
例外：`logger.ts` 自身的兜底 catch MAY 使用 `console.*` 作为 last-resort（避免递归），但 MUST 加注释说明原因。

#### Scenario: 非 Tauri 环境检测

- **WHEN** 前端在非 Tauri（浏览器）环境检测到 API 不可用
- **THEN** MUST 通过 `logger.warn(ERROR_CODE, message, context)` 记录，不得使用裸 `console.warn`；error code MUST 取自 `frontend/src/shared/error-dictionary.ts`

### Requirement: No Silent Catch

`catch` 块 MUST NOT (MUST NOT) 完全静默吞掉错误（`catch(() => {})` 或空 catch 体）。
对于不打断用户的非关键失败，MUST (MUST) 至少使用 `logger.warn(ERROR_CODE, context, { error: String(e) })` 记录，保留排障线索。

#### Scenario: 非关键 IPC 失败

- **WHEN** flash_taskbar、requestNotification、拖拽位置同步等非关键 IPC 调用失败并被 catch
- **THEN** catch MUST 以 `logger.warn` 记录错误上下文，不得静默；控制流可继续不打断用户
