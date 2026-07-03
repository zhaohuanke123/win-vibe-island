## ADDED Requirements

### Requirement: Logger Self-Catch Console Fallback

`frontend/src/client/logger.ts` 自身的兜底 catch（logger 内部记录失败时）MAY (MAY) 使用 `console.*` 作为 last-resort 以避免递归调用，但 MUST (MUST) 加注释说明「logger 自身失败的 last-resort，不递归」。这是 error-handling 规格 `Structured Frontend Logging` 规则（禁止 console）的唯一合法例外。

#### Scenario: logger 自身失败

- **WHEN** `logger.ts` 内部尝试记录或发送日志时自身抛错，被其 catch 块捕获
- **THEN** 该 catch MAY 用 `console.warn` 兜底输出，MUST 加注释说明不调用 logger（避免无限递归）；除 logger 自身外，其它前端代码仍禁止 console
