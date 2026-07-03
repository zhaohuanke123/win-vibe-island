## Why

前端存在两类违反 `.claude/rules/ErrorHandlingConvention.md` 的错误处理：

1. **`console.warn` 替代 logger**（REACT-001）：`frontend/src/hooks/useAgentEvents.ts` L169 在检测到非 Tauri 环境时用 `console.warn("Tauri API not found...")`，违反「禁止 console.log/console.warn 记录生产错误」。
2. **静默吞错**（REACT-002）：多处 `catch(() => {})` / 空 catch 完全吞掉错误，违反「禁止 catch 后吞掉错误不处理」：
   - `frontend/src/components/Overlay.tsx`：L200、L203-209、L216、L439、L460、L476、L479-483
   - `frontend/src/client/logger.ts`：L56
   - `frontend/src/hooks/useSessionPersistence.ts`：L102

两者根因相同：都是前端结构化错误处理未强制执行。合并为一个 change。「前端必须用结构化 logger、禁止静默 catch」两条不变量已由全量抽取的 `error-handling` 主规格承载；本 change 借修复之机向该规格补一条 Logger Self-Catch Console Fallback 例外（见 delta），后续违反错误处理规则的代码可在 review 时直接引用。

## What Changes

- 代码：`useAgentEvents.ts` L169 的 `console.warn` → `logger.warn(ERROR_CODE, ...)`；Overlay.tsx / useSessionPersistence.ts 的空 catch → `logger.warn`
- 例外：`logger.ts` L56 是 logger 自身兜底，保留 `console.warn` + 注释（避免递归）
- 规格：向已有 `error-handling` 主规格补 Logger Self-Catch Console Fallback 例外（delta）；「结构化 logger + 禁止静默 catch」由全量抽取的 error-handling 主规格承载

## Non-Goals

- 不改控制流（catch 后继续，不打断用户）
- 不把非关键失败提升为 user-visible 错误
- 不重构 logger 实现

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `error-handling`：补 Logger Self-Catch Console Fallback 例外（`logger.ts` 自身 catch 允许 console 兜底以避免递归）

## Impact

- 受影响文件：`frontend/src/hooks/useAgentEvents.ts`、`frontend/src/components/Overlay.tsx`、`frontend/src/hooks/useSessionPersistence.ts`、`frontend/src/client/logger.ts`（仅注释）
- spec delta：向 `openspec/specs/error-handling/spec.md` 补 Logger Self-Catch Console Fallback 例外
- 行为不变：仅增加日志，不改变控制流
- 风险：低，需确认 `logger` import 在各文件存在
