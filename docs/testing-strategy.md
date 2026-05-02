# Testing Strategy

> 自动化测试策略，覆盖前端和后端功能测试，无需 UI 截图。

---

## 测试原则

1. **功能测试优先** - 测试业务逻辑和功能正确性，而非视觉效果
2. **自动化可运行** - 所有测试可在 CI/CD 中自动执行
3. **隔离性** - 单元测试独立运行，不依赖外部服务
4. **集成测试** - 测试模块间的交互，使用 mock 边界

---

## 测试技术栈

### 前端测试

| 工具 | 用途 |
|------|------|
| Vitest | 测试运行器（已安装） |
| @testing-library/react | React 组件测试（已安装） |
| @testing-library/jest-dom | DOM 断言（已安装） |
| jsdom | DOM 模拟环境（已安装） |

### 后端测试

| 工具 | 用途 |
|------|------|
| Rust 内置测试 | `cargo test` |
| tokio::test | 异步测试 |
| mockall | Mock 框架（需添加） |

---

## 前端测试方案

### 1. Store 测试 (Zustand)

测试 `sessions.ts` store 的状态管理逻辑。

**测试文件**: `frontend/src/__tests__/store/sessions.test.ts`

```typescript
// 测试用例：
- addSession: 添加新 session，自动填充 createdAt/lastActivity
- removeSession: 删除 session，更新 activeSessionId
- updateSessionState: 更新状态和时间戳
- updateSessionInfo: 更新 session 信息
- setApprovalRequest: 设置审批请求
- clearApprovalRequest: 清除审批请求
- addToolExecution: 添加工具执行记录，限制历史数量
- updateToolExecution: 更新工具执行状态
- setHookServerStatus: 更新 Hook 服务器状态
- addErrorLog: 添加错误日志，限制数量
```

### 2. Hook 测试 (useAgentEvents)

测试事件处理逻辑，mock Tauri API。

**测试文件**: `frontend/src/__tests__/hooks/useAgentEvents.test.ts`

```typescript
// 测试用例：
- session_start 事件：创建新 session
- session_start 事件：已存在 session 时更新
- session_end 事件：删除 session
- state_change 事件：更新 session 状态
- state_change 事件：无效状态回退到 idle
- tool_use 事件：设置 thinking 状态和当前工具
- tool_complete 事件：记录工具执行历史
- tool_error 事件：记录错误信息
- permission_request 事件：设置审批请求
- process_detected 事件：添加 agent 进程
- process_terminated 事件：移除进程 session
```

### 3. 组件测试

**测试文件**: `frontend/src/__tests__/components/`

#### StatusDot.test.tsx
```typescript
// 测试用例：
- 渲染各状态颜色 (idle/running/thinking/streaming/approval/error/done)
- 动画属性正确设置
```

#### ApprovalPanel.test.tsx
```typescript
// 测试用例：
- 显示审批请求详情
- 点击 Approve 按钮调用 submit_approval_response
- 点击 Reject 按钮调用 submit_approval_response
- 键盘快捷键 (Enter/Escape)
- 加载状态显示
```

#### HookStatus.test.tsx
```typescript
// 测试用例：
- 显示连接状态 (connected/disconnected/error)
- 显示请求数量和运行时间
- 显示 pending approvals 数量
```

#### DiffViewer.test.tsx
```typescript
// 测试用例：
- 显示文件名
- 显示添加行（绿色）
- 显示删除行（红色）
- 空 diff 处理
```

### 4. 工具函数测试

**测试文件**: `frontend/src/__tests__/utils/`

```typescript
// extractProjectName.test.ts
- 从路径提取项目名
- 处理 Windows 路径
- 处理空路径

// useThrottledCallback.test.ts
- 节流调用正确性
- 取消节流
```

---

## 后端测试方案

### 1. Hook Server 测试

**测试文件**: `src-tauri/src/hook_server.rs` (内联测试)

```rust
#[cfg(test)]
mod tests {
    // 测试用例：
    - test_get_session_id_from_session_id()
    - test_get_session_id_from_transcript_path()
    - test_get_session_label_from_cwd()
    - test_determine_risk_level_high()
    - test_determine_risk_level_medium()
    - test_determine_risk_level_low()
    - test_format_tool_action_bash()
    - test_format_tool_action_read()
    - test_format_tool_action_write()
    - test_extract_diff_data_write()
    - test_extract_diff_data_edit()
}
```

### 2. HTTP 端点集成测试

**测试文件**: `src-tauri/tests/hook_server_integration.rs`

```rust
// 测试用例：
- test_session_start_endpoint()
- test_pre_tool_use_endpoint()
- test_post_tool_use_endpoint()
- test_post_tool_use_failure_endpoint()
- test_notification_endpoint()
- test_stop_endpoint()
- test_user_prompt_submit_endpoint()
- test_permission_request_endpoint()
- test_health_endpoint()
- test_ping_endpoint()
```

### 3. Process Watcher 测试

**测试文件**: `src-tauri/src/process_watcher.rs` (内联测试)

```rust
#[cfg(test)]
mod tests {
    // 测试用例：
    - test_is_known_agent()
    - test_extract_process_name()
}
```

### 4. Commands 测试

**测试文件**: `src-tauri/tests/commands_test.rs`

```rust
// 测试用例：
- test_get_hook_health()
- test_get_hook_errors()
- test_clear_hook_errors()
```

---

## 测试目录结构

```
frontend/
├── src/
│   ├── __tests__/
│   │   ├── setup.ts              # 测试环境设置
│   │   ├── store/
│   │   │   └── sessions.test.ts
│   │   ├── hooks/
│   │   │   └── useAgentEvents.test.ts
│   │   ├── components/
│   │   │   ├── StatusDot.test.tsx
│   │   │   ├── ApprovalPanel.test.tsx
│   │   │   ├── HookStatus.test.tsx
│   │   │   └── DiffViewer.test.tsx
│   │   └── utils/
│   │       ├── extractProjectName.test.ts
│   │       └── useThrottledCallback.test.ts
│   └── ...
└── vitest.config.ts              # Vitest 配置

src-tauri/
├── src/
│   ├── hook_server.rs            # 内联单元测试
│   ├── process_watcher.rs        # 内联单元测试
│   └── ...
└── tests/
    ├── hook_server_integration.rs
    └── commands_test.rs
```

---

## 测试配置

### Vitest 配置

**文件**: `frontend/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/'],
    },
  },
})
```

### 测试设置文件

**文件**: `frontend/src/__tests__/setup.ts`

```typescript
import '@testing-library/jest-dom'

// Mock Tauri API
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))
```

### Cargo.toml 测试依赖

```toml
[dev-dependencies]
mockall = "0.12"
tokio-test = "0.4"
```

---

## 运行测试

### 前端测试

```bash
cd frontend

# 运行所有测试
npm test

# 运行特定测试
npm test -- sessions.test.ts

# 带覆盖率
npm test -- --coverage

# 监听模式
npm test -- --watch
```

### 后端测试

```bash
cd src-tauri

# 运行所有测试
cargo test

# 运行特定测试
cargo test test_determine_risk

# 显示输出
cargo test -- --nocapture

# 运行集成测试
cargo test --test hook_server_integration
```

### 全部测试

```bash
# 根目录运行前后端测试
cd frontend && npm test && cd ../src-tauri && cargo test
```

---

## CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npm test

  backend-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions-rust-lang/setup-rust-toolchain@v1
      - run: cd src-tauri && cargo test
```

---

## 测试覆盖目标

| 模块 | 目标覆盖率 |
|------|-----------|
| Store (sessions.ts) | 90% |
| Hooks (useAgentEvents.ts) | 85% |
| Components | 80% |
| Hook Server | 85% |
| Process Watcher | 80% |

---

## Mock 策略

### 前端 Mock

1. **Tauri API** - 完全 mock，不依赖真实 Tauri 环境
2. **fetch/axios** - mock HTTP 请求
3. **定时器** - 使用 `vi.useFakeTimers()`

### 后端 Mock

1. **Tauri AppHandle** - 使用 mockall 生成 mock
2. **Win32 API** - 在非 Windows 平台使用 stub
3. **时间** - 使用可注入的时间函数

---

## 测试数据

### Session 测试数据

```typescript
const mockSession: Session = {
  id: 'test-session-1',
  label: 'Test Project',
  cwd: '/path/to/project',
  state: 'idle',
  createdAt: 1715000000000,
  lastActivity: 1715000000000,
  toolHistory: [],
}
```

### Hook Payload 测试数据

```rust
fn mock_hook_payload() -> HookPayload {
    HookPayload {
        session_id: Some("test-session".to_string()),
        cwd: Some("/path/to/project".to_string()),
        tool_name: Some("Read".to_string()),
        ..Default::default()
    }
}
```
