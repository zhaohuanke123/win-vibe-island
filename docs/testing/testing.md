# Vibe Island 测试文档

> 合并自原 `testing-strategy.md`（策略层）和本文件（API 层）。

---

## Part 1: 测试策略

### 测试技术栈

#### Frontend

| Tool | Current Status |
|------|----------------|
| Vitest | 已安装，`npm test` 运行 |
| @testing-library/react | 已安装 |
| @testing-library/jest-dom | 已安装 |
| jsdom | 已安装 |

#### Backend

| Tool | Current Status |
|------|----------------|
| Rust built-in test | 已使用 |
| tokio-test | 已安装 |
| tempfile | 已安装，用于 hook_config 测试 |

当前 `Cargo.toml` 未安装 `mockall`。

---

### Current Test Files

#### Frontend

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

#### Backend

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

### 运行测试

#### Frontend

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

#### Backend

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

#### Build Checks

```bash
cd frontend && npm run build
cd src-tauri && cargo check
```

---

### Test Boundaries

#### Covered

- Frontend state management and event handling.
- ApprovalPanel IPC invocation behavior.
- StatusDot state rendering.
- Hook server helper logic.
- Hook config generation, merge, uninstall behavior.
- Basic hook endpoint integration expectations.

#### Not Yet Covered

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

### Recommended Next Tests

1. Add `HookStatus.test.tsx` with mocked `fetch` and `invoke`.
2. Add `DiffViewer.test.tsx` for added/deleted/unchanged line rendering.
3. Add `Overlay.test.tsx` for approval auto-expand and `set_window_size` calls.
4. Add `process_watcher.rs` tests for known agent name matching.
5. Add a Windows-only Named Pipe integration test behind `#[cfg(target_os = "windows")]`.

---

### Mock Strategy

Frontend tests mock Tauri APIs in `frontend/src/__tests__/setup.ts`:

- `@tauri-apps/api/event`
- `@tauri-apps/api/core`

Backend tests currently avoid heavy mocking and focus on pure helper functions plus integration-style endpoint tests.

---

### Coverage Targets

| Module | Target |
|--------|--------|
| `frontend/src/store/sessions.ts` | 90% |
| `frontend/src/hooks/useAgentEvents.ts` | 85% |
| Core components | 80% |
| `src-tauri/src/hook_server.rs` | 85% |
| `src-tauri/src/hook_config.rs` | 85% |

---

## Part 2: 测试 API

### 概述

应用提供三层测试能力，覆盖从 UI 逻辑到真实窗口行为的全链路。

| 层级 | 方式 | 用途 |
|------|------|------|
| 浏览器模式 | Test Bridge `simulateEvent()` | 快速验证 UI 逻辑、DOM 渲染、data-testid |
| Tauri 真实 hook | curl → hook server:7878 | 验证真实业务入口、Rust 处理、前端状态更新 |
| Native 窗口 | PowerShell Win32 探测 | 验证真实窗口尺寸（compact=52px, approval=720px） |

#### 调用链路

```
# 浏览器模式（无需 Tauri 运行时）
simulateEvent("session_start", {...})
    ↓
Zustand store 更新
    ↓
React DOM 更新
    ↓
Playwright getByTestId() 断言

# Tauri 真实 hook 模式
curl POST /hooks/session-start
    ↓
hook_server.rs 处理
    ↓
app.emit("session_start", ...)
    ↓
useAgentEvents.ts 监听器
    ↓
Zustand → DOM → 窗口尺寸变化

# Tauri invoke 模式（需要 Tauri WebView 上下文）
invoke("simulate_session_start", {...})
    ↓
Rust command
    ↓
app.emit("session_start", ...)
    ↓
useAgentEvents.ts → Zustand → DOM
```

---

### 前置条件

```bash
# 安装 Playwright
npm install -D @playwright/test
npx playwright install chromium
```

---

### 方式 1：浏览器模式测试

启动前端 dev server（无需 Tauri）：

```bash
cd frontend && npm run dev
```

#### Test Bridge API

应用运行后，前端暴露 `window.__VIBE_TEST_BRIDGE__`：

```javascript
// 检查运行环境
bridge.isTauriRuntime()  // boolean: true=Tauri WebView, false=普通浏览器

// 读取 Zustand store（只读）
bridge.getSessions()           // Session[]
bridge.getActiveSessionId()    // string | null
bridge.getApprovalRequest()    // ApprovalRequest | null
bridge.getHookServerStatus()   // HookServerStatus

// 模拟事件（浏览器模式下直接更新 Zustand）
bridge.simulateEvent("session_start", { session_id, label, cwd })
bridge.simulateEvent("permission_request", { session_id, tool_use_id, tool_name, ... })
bridge.simulateEvent("state_change", { session_id, state })
bridge.simulateEvent("session_end", { session_id })

// 重置状态
bridge.resetAll()  // 清空 sessions + approvalRequest

// 调用 Tauri command（仅 Tauri 模式可用）
bridge.invoke("simulate_session_start", { session_id, label, cwd })
bridge.invoke("get_window_geometry")  // → { width, height, x, y, isVisible }
```

#### Playwright 测试

```bash
# 运行 E2E 测试
npx playwright test tests/e2e
```

测试文件结构：
```
tests/e2e/
  playwright.config.ts
  setup/
    test-helpers.ts          # VibeTestClient 封装
  specs/
    overlay.spec.ts          # Overlay 行为测试
```

`VibeTestClient` 封装了所有 `page.evaluate()` 调用，Agent 可以直接使用：

```typescript
import { VibeTestClient } from "../setup/test-helpers";

test("approval flow", async ({ page }) => {
  const client = new VibeTestClient(page);
  await client.resetAll();

  await client.simulateSessionStart("s1", "Test");
  await client.simulatePermissionRequest({
    sessionId: "s1", toolUseId: "t1", toolName: "Bash",
    action: "npm test", riskLevel: "medium"
  });

  // Zustand 断言
  const approval = await client.getApprovalRequest();
  expect(approval).not.toBeNull();

  // DOM 断言
  await expect(page.getByTestId("approval-panel")).toBeVisible();
  await expect(page.getByTestId("risk-level")).toContainText("MEDIUM");
});
```

---

### 方式 2：Hook Server 回归测试

测试真实 Rust → emit → 前端链路 + native 窗口尺寸。

#### 前提

```bash
cd src-tauri && cargo tauri dev
# 等待 hook server 就绪
```

#### 运行回归脚本

```powershell
powershell -ExecutionPolicy Bypass -File tests/scripts/hook/run-overlay-height-regression.ps1
```

脚本执行：
1. 等待 hook server:7878 就绪
2. Win32 探测窗口尺寸，断言 compact ≈ 52px
3. curl 发送 6 个 session_start
4. 探测自适应高度
5. curl 发送 permission_request
6. 探测 approval 展开高度 ≈ 720px
7. 等待 approval 超时/完成
8. 探测收缩后回到 compact
9. 输出 PASS/FAIL 汇总

#### 手动 curl 测试

```bash
# Session start
curl -X POST http://localhost:7878/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","cwd":"D:\\project","source":"test"}'

# State change
curl -X POST http://localhost:7878/hooks/pre-tool-use \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","tool_name":"Read","tool_input":{"file_path":"test.ts"}}'

# Permission request (阻塞等待 approval 响应，120s 超时)
curl --max-time 10 -X POST http://localhost:7878/hooks/permission-request \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","tool_use_id":"tool-1","tool_name":"Bash","tool_input":{"command":"npm test"}}'

# Session end
curl -X POST http://localhost:7878/hooks/stop \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","reason":"end"}'
```

---

### 方式 3：Rust Test Commands（需要 Tauri WebView 上下文）

这些命令只在 debug build 中可用，release build 返回错误。

| Command | 用途 |
|---------|------|
| `simulate_session_start` | 模拟 session 开始 |
| `simulate_permission_request` | 模拟 approval 请求 |
| `simulate_state_change` | 模拟状态变更 |
| `simulate_session_end` | 模拟 session 结束 |
| `test_reset_sessions` | 重置所有测试状态 |
| `get_window_geometry` | 获取窗口几何信息 |

调用方式（在 Tauri WebView 内）：

```javascript
await invoke("simulate_session_start", { session_id, label, cwd })
await invoke("simulate_permission_request", {
  session_id, tool_use_id, tool_name, tool_input, action, risk_level, approval_type
})
await invoke("get_window_geometry")  // → { width, height, x, y, scaleFactor, isVisible, isFocused }
```

注意：这些命令只能在 Tauri WebView 上下文中调用，普通浏览器无法使用。

---

### data-testid 速查

| testid | 组件 | 何时可见 |
|--------|------|----------|
| `overlay` | AnimatedOverlay root | 始终 |
| `status-bar` | 状态栏 | 始终 |
| `status-dot` | 状态指示灯 | 有 active session 时 |
| `session-label` | Session 名称 | 有 active session 时 |
| `session-state` | Session 状态文字 | 有 active session 时 |
| `empty-state` | 空状态文字 | 无 session 时 |
| `hook-status` | Hook 连接状态 | 始终 |
| `sessions-header` | "Sessions (N)" 标题 | 展开且有 sessions 时 |
| `sessions-list` | Session 列表容器 | 展开时 |
| `session-item` | Session 条目 | 有 sessions 时，配合 `data-session-id` |
| `sessions-empty` | 等待提示 | 展开且无 sessions 时 |
| `settings-btn` | 设置按钮 | 展开时 |
| `approval-panel` | Approval 面板 | 有 approval 请求时 |
| `approve-btn` | Approve 按钮 | Permission 类型 approval 时 |
| `reject-btn` | Reject 按钮 | Permission 类型 approval 时 |
| `risk-level` | 风险等级标签 | Permission 类型 approval 时 |
| `settings-panel` | 设置面板 | 点击 Settings 后 |

---

### 验证覆盖状态

| 链路 | 状态 | 说明 |
|------|------|------|
| `simulateEvent()` → Zustand → DOM | ✅ 已验证 | 浏览器模式快速验证 UI |
| curl → hook server:7878 → Rust → `app.emit()` → 前端 | ✅ 已验证 | 真实业务入口 |
| data-testid 可定位 | ✅ 已验证 | 14/14 全部通过 |
| Native 窗口几何 | ✅ 已验证 | compact=52px, approval=720px, collapse=52px |
| `invoke("simulate_*")` → Rust → emit → 前端 | ❌ 未覆盖 | 需要 Tauri WebView 上下文或 tauri-driver |

---

### 安全

- Test Bridge 只在 `DEV` 或 `VITE_ENABLE_TEST_BRIDGE=true` 时注册
- Rust test commands 在 release build 中返回错误
- `simulateEvent()` 直接操作 Zustand，不走真实事件链路，仅用于浏览器模式快速测试

---

## Part 3: Win App 自动化测试策略

> 针对 Tauri 原生窗口下 UI 行为的自动化测试方案。
>
> 背景：Vibe Island 是 `WS_EX_NOACTIVATE` 透明悬浮 Overlay，标准的 WebDriver / WinAppDriver 方案无法直接使用。

---

### 3.1 Tauri 应用的固有测试难点

| 难点 | 原因 | 影响 |
|------|------|------|
| `WS_EX_NOACTIVATE` | 窗口无法获得键盘/鼠标焦点 | 标准 WebDriver / tauri-driver 无法 sendKeys / click |
| 透明 Overlay | WebView 背景全透明 | 截图对比时背景信息不可靠 |
| WebView2 非 Chromium | 不是标准 Chrome DevTools Protocol | Playwright 的 `chromium.launch()` 无法直接 attach |
| DPI 缩放 | 125%/150% 下 CSS 像素与物理像素不一致 | 窗口尺寸断言需要计算 devicePixelRatio |
| IPC 异步链路 | Rust hook → app.emit → 前端 → DOM → Win32 resize | Bug 可能出现在任一环节，非纯 UI 测试能覆盖 |

---

### 3.2 测试分层策略

```
┌─────────────────────────────────────────────┐
│  Layer 1: Vitest 单元测试                    │
│  组件逻辑、状态管理、纯函数                   │
│  无需 Tauri / 浏览器                         │
│  ─── npm test                                │
├─────────────────────────────────────────────┤
│  Layer 2: Playwright 浏览器 E2E              │
│  UI 交互、DOM 渲染、Test Bridge 模拟         │
│  需要 dev server，无需 Tauri                 │
│  ─── npx playwright test                     │
├─────────────────────────────────────────────┤
│  Layer 3: Rust 集成测试                      │
│  hook_server、hook_config、command 逻辑      │
│  无需 GUI                                    │
│  ─── cargo test                              │
├─────────────────────────────────────────────┤
│  Layer 4: Tauri 回归脚本                     │
│  Native 窗口探测 + curl 模拟 hook            │
│  需要 Tauri dev 窗口                         │
│  ─── PowerShell 脚本                         │
└─────────────────────────────────────────────┘
```

#### 各层覆盖范围

| 测试层 | 覆盖 | 不覆盖 |
|--------|------|--------|
| Layer 1: Vitest | 组件渲染逻辑、状态转换、辅助函数 | WebView2 行为、Win32 窗口、IPC 实际通信 |
| Layer 2: Playwright | DOM 布局、滚动行为、组件可见性 | Tauri IPC、Native 窗口尺寸、实际 DPI |
| Layer 3: cargo test | Hook payload 解析、配置生成 | UI、WebView |
| Layer 4: 回归脚本 | Native 窗口尺寸、Tauri IPC 全链路 | 细粒度 UI 状态、组件内部行为 |

---

### 3.3 推荐方案：Playwright（浏览器模式）为主

#### 为什么选择浏览器模式

对于 DiffViewer 这种**不依赖 Tauri IPC 和 Win32 窗口**的组件，浏览器模式是最佳测试方式：

- DiffViewer 全是纯 UI：props → render，无 IPC 调用
- 展示行为（高度、滚动、行数）在浏览器和 WebView2 中一致
- 跑得飞快（毫秒级），不需要编译 Rust 或启动 Tauri
- Playwright 截图对比能精确验证布局

#### 对于必须验证 Tauri 窗口的行为

| 场景 | 方案 | 当前状态 |
|------|------|----------|
| 窗口尺寸（expand/collapse） | PowerShell 回归脚本 | ✅ 已有 |
| 全链路：curl → hook → emit → 前端 → resize | 人工 Tauri 验证 | ✅ 已有记录 |
| DiffViewer 冒烟（日志 + 窗口探测） | `tests/scripts/tauri-diffviewer-smoke.sh` | ✅ 新增 |
| 细粒度 UI 状态在 Tauri 环境 | 暂无可行的自动方案 | ❌ |

#### 浏览器模式的局限

浏览器模式下无法验证：
- Tauri `invoke()` 的实际调用
- Win32 窗口尺寸变化
- WebView2 渲染差异（字体、DPI 缩放）
- `devicePixelRatio` 与 Native 窗口的同步

对于这些，保留人工回归测试 + PowerShell 探测脚本。

---

### 3.4 DiffViewer 自适应变更的测试计划

在修改代码之前，必须验证：

#### Step 1: Vitest 单元测试

文件：`frontend/src/__tests__/components/DiffViewer.test.tsx`

| 测试用例 | 输入 | 断言 |
|----------|------|------|
| 空内容 → null | `oldContent='', newContent=''` | container 不存在或空 |
| 小 diff | 2 行 add + 10 行 context | 渲染 12 行，无 scrollbar |
| 大 diff | 50+ 行变更 | 所有行渲染，容器高度 > 200px |
| 文件名 | `fileName='test.ts'` | header 显示 📄test.ts |
| 无文件名 | `fileName=undefined` | 无 header 渲染 |
| 纯新增文件 | `oldContent=''` | 所有行标记 `add` |
| 纯删除文件 | `newContent=''` | 所有行标记 `remove` |

#### Step 2: Playwright 浏览器 E2E

文件：`tests/e2e/specs/diff-viewer.spec.ts`

| 测试用例 | 操作 |
|----------|------|
| 小 diff 无滚动 | simulatePermissionRequest → 验证 `.diff-viewer` 存在 → 验证 `scrollHeight <= clientHeight` |
| 大 diff 可滚动 | simulatePermissionRequest（大 diff 内容）→ 验证 body `scrollHeight > clientHeight` |
| 空 diff 不可见 | simulatePermissionRequest（无 diff）→ 验证 `.diff-viewer` 不存在 |

#### Step 3: 构建验证

```bash
cd frontend && npm run build        # 确保无 TS/CSS 编译错误
cd src-tauri && cargo check          # 确保 Rust 端无影响
```

#### Step 4: Tauri 回归验证（人工）

- 启动 `cargo tauri dev`
- curl 发送包含大 diff 的 permission request
- 观察 approval panel 展开后 diff viewer 高度自适应、无双重滚动条

---

### 3.5 未来可行方向（暂不实施）

| 方向 | 可行性 | 障碍 |
|------|--------|------|
| `tauri-driver`（WebDriver） | 中等 | `WS_EX_NOACTIVATE` 导致无法 forward 键盘/鼠标事件 |
| WinAppDriver / WinUI 3 测试 | 低 | 应用是 Tauri/WebView2，不是 UWP |
| 截图对比（CDP） | 中高 | 只适用于浏览器模式，无法确认 Tauri 环境 |
| 内嵌 Test Runner（Tauri 内运行） | 高 | 利用 Test Bridge 在 Tauri WebView 内执行测试脚本，但需额外构建一种 \"test mode\" 启动参数 |

最可行的未来方案是**内嵌 Test Runner**：
1. 编译时传入 `--features test-mode`，启动一个可聚焦、非透明的测试窗口
2. 在该窗口中执行 Playwright / Puppeteer 控制
3. 但这是一个独立项目，不混入本次 DiffViewer 变更
