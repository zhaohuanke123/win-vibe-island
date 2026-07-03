## 1. useAgentEvents.ts：console.warn → logger.warn

- [ ] 1.1 从 `frontend/src/shared/error-dictionary.ts` 选合适 error code（建议 `HOOK_LISTENER_ERROR` 或 `SESSION_EVENT_ERROR`，按现有命名选用）
- [ ] 1.2 `frontend/src/hooks/useAgentEvents.ts` L169：`console.warn("Tauri API not found. Running in browser mode. Event listeners disabled.")` → `logger.warn("<ERROR_CODE>", "Tauri API not found", { mode: "browser" })`
- [ ] 1.3 确认 `logger` 已在该文件顶部 import；若未 import 则补 import

## 2. Overlay.tsx：静默 catch → logger.warn

- [ ] 2.1 L200、L203-209、L216：拖拽相关 catch → `catch((e) => logger.warn("<ERROR_CODE>", "...", { error: String(e) }))`（error code 按 error-dictionary 选用，如 `UI_DRAG_ERROR`）
- [ ] 2.2 L439、L460：flash_taskbar / 通知相关 catch → `logger.warn`
- [ ] 2.3 L476、L479-483：其他非关键 catch → `logger.warn`
- [ ] 2.4 确认 `logger` 已在该文件 import；若未 import 则补 import

## 3. 其他文件

- [ ] 3.1 `frontend/src/hooks/useSessionPersistence.ts` L102 → `logger.warn`
- [ ] 3.2 `frontend/src/client/logger.ts` L56：logger 自身兜底 catch **保留 `console.warn`**，加注释说明 "logger 自身失败的 last-resort，不递归"

## 4. 验证

- [ ] 4.1 `npm --prefix frontend run lint` 通过
- [ ] 4.2 `npm --prefix frontend run build` 通过
- [ ] 4.3 grep 确认 `Overlay.tsx` / `useAgentEvents.ts` / `useSessionPersistence.ts` 不再有空的 `catch(() => {})` 或裸 `console.warn`
- [ ] 4.4 `openspec validate fix-frontend-error-logging --type change` 通过
