# Testing Strategy

> 当前测试策略以现有代码和已落地测试为准。测试目标是覆盖业务逻辑、事件映射和 hook 配置行为，不依赖 UI 截图。

---

## 测试技术栈

### Frontend

| Tool | Current Status |
|------|----------------|
| Vitest | 已安装，`npm test` 运行 |
| @testing-library/react | 已安装 |
| @testing-library/jest-dom | 已安装 |
| jsdom | 已安装 |

### Backend

| Tool | Current Status |
|------|----------------|
| Rust built-in test | 已使用 |
| tokio-test | 已安装 |
| tempfile | 已安装，用于 hook_config 测试 |

当前 `Cargo.toml` 未安装 `mockall`。

---

## Current Test Files

### Frontend

```
frontend/src/__tests__/
├── setup.ts
├── components/
│   ├── ApprovalPanel.test.tsx
│   └── StatusDot.test.tsx
├── hooks/
│   └── useAgentEvents.test.ts
└── store/
    └── sessions.test.ts
```

覆盖范围：

| File | Coverage Intent |
|------|-----------------|
| `sessions.test.ts` | Zustand store 的 session、approval、hook status、tool history、error log 行为 |
| `useAgentEvents.test.ts` | Tauri event 到 store 的映射，包括 session、tool、approval、process events |
| `StatusDot.test.tsx` | 各状态渲染和动画属性 |
| `ApprovalPanel.test.tsx` | 审批请求展示、Approve/Reject 调用、快捷键、loading 状态 |

### Backend

```
src-tauri/
├── src/
│   ├── hook_server.rs     # 内联单元测试
│   └── hook_config.rs     # 内联单元测试
└── tests/
    └── hook_server_integration.rs
```

覆盖范围：

| File | Coverage Intent |
|------|-----------------|
| `hook_server.rs` | session id/label 提取、风险等级、动作描述、diff 提取、hook payload helper |
| `hook_config.rs` | required hooks 生成、Vibe Island hook 识别、非破坏性 merge/remove、mode serialization |
| `hook_server_integration.rs` | hook endpoint payload schema 和核心 HTTP 行为 |

---

## Run Tests

### Frontend

```bash
cd frontend
npm test
```

Useful variants:

```bash
npm test -- sessions.test.ts
npm test -- --coverage
npm run test:watch
```

### Backend

```bash
cd src-tauri
cargo test
```

Useful variants:

```bash
cargo test hook_config
cargo test hook_server
cargo test --test hook_server_integration
cargo test -- --nocapture
```

### Build Checks

```bash
cd frontend && npm run build
cd src-tauri && cargo check
```

---

## Test Boundaries

### Covered

- Frontend state management and event handling.
- ApprovalPanel IPC invocation behavior.
- StatusDot state rendering.
- Hook server helper logic.
- Hook config generation, merge, uninstall behavior.
- Basic hook endpoint integration expectations.

### Not Yet Covered

- `HookStatus.tsx` health polling component.
- `DiffViewer.tsx` rendering.
- `HookConfigStatus.tsx` and `ErrorLog.tsx`.
- `Overlay.tsx` expand/collapse and window resize IPC behavior.
- `process_watcher.rs` unit tests.
- `window_focus.rs` behavior tests.
- `commands.rs` integration tests.
- Actual Windows named pipe end-to-end tests.
- Manual screenshot or visual regression tests.

---

## Recommended Next Tests

1. Add `HookStatus.test.tsx` with mocked `fetch` and `invoke`.
2. Add `DiffViewer.test.tsx` for added/deleted/unchanged line rendering.
3. Add `Overlay.test.tsx` for approval auto-expand and `set_window_size` calls.
4. Add `process_watcher.rs` tests for known agent name matching.
5. Add a Windows-only Named Pipe integration test behind `#[cfg(target_os = "windows")]`.

---

## Mock Strategy

Frontend tests mock Tauri APIs in `frontend/src/__tests__/setup.ts`:

- `@tauri-apps/api/event`
- `@tauri-apps/api/core`

Backend tests currently avoid heavy mocking and focus on pure helper functions plus integration-style endpoint tests.

---

## Coverage Targets

| Module | Target |
|--------|--------|
| `frontend/src/store/sessions.ts` | 90% |
| `frontend/src/hooks/useAgentEvents.ts` | 85% |
| Core components | 80% |
| `src-tauri/src/hook_server.rs` | 85% |
| `src-tauri/src/hook_config.rs` | 85% |
