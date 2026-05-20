---
name: testing
description: |
  测试策略和工具。包含三层测试方式、Test Bridge API、data-testid 速查和测试命令。
  触发条件：
  - 用户要写测试或运行测试
  - "怎么测试"、"test bridge"、"data-testid"
  - 需要添加新的测试用例
  - 测试失败需要调试
  - "npm test"、"cargo test"
  不要触发：与测试无关的纯功能开发
---

# 测试

**参考文档**：`docs/testing/testing.md`

## 测试技术栈

| 层 | 工具 |
|----|------|
| 前端单元 | Vitest + @testing-library/react + jsdom |
| 前端 E2E | Playwright |
| 后端单元 | Rust built-in test + tokio-test |
| 后端集成 | tempfile + HTTP 集成测试 |

## 三层测试方式

### Layer 1：浏览器模式

```bash
cd frontend && npm run dev
```

无需 Tauri，浏览器中测试 UI。通过 Test Bridge API 模拟后端事件。

### Layer 2：Tauri Hook 测试（测试 Hook 端到端）

完整链路：curl → hook_server.rs → app.emit → 前端 → 窗口尺寸变化。

```bash
# 1. 启动 Tauri dev（debug 构建，包含测试命令）
cd src-tauri && cargo tauri dev
# 等待控制台输出 "Hook server started on port 7878"
```

然后用 curl 发送真实 hook payload：

```bash
# 测试会话开始
curl -X POST http://localhost:7878/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","cwd":"D:\\project","source":"test"}'

# 测试状态变更（模拟 Agent 开始思考）
curl -X POST http://localhost:7878/hooks/pre-tool-use \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","tool_name":"Read","tool_input":{"file_path":"test.ts"}}'

# 测试审批请求（会阻塞等待 approve/reject，120s 超时）
curl --max-time 10 -X POST http://localhost:7878/hooks/permission-request \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","tool_use_id":"tool-1","tool_name":"Bash","tool_input":{"command":"npm test"}}'

# 测试会话结束
curl -X POST http://localhost:7878/hooks/stop \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","reason":"end"}'
```

验证点：
- Overlay 窗口显示对应状态（idle→running→thinking→streaming→done）
- Approval panel 展开显示审批请求
- 窗口尺寸正确变化（compact 52px → approval 720px）

也可运行自动化回归脚本：

```powershell
powershell -ExecutionPolicy Bypass -File tests/scripts/hook/run-overlay-height-regression.ps1
```

### Layer 3：Rust Test Commands（Tauri WebView 内调用）

Debug 构建中提供的 IPC 测试命令，在 WebView 控制台中调用：

```javascript
await invoke("simulate_session_start", { sessionId: "test-1", label: "Test" });
await invoke("simulate_state_change", { sessionId: "test-1", state: "running" });
await invoke("simulate_permission_request", { sessionId: "test-1", toolUseId: "t1", toolName: "Bash" });
await invoke("simulate_session_end", { sessionId: "test-1" });
await invoke("test_reset_sessions");  // 清空所有测试状态
await invoke("get_window_geometry");  // 查看窗口尺寸
```

## Test Bridge API

浏览器模式下通过 `window.__VIBE_TEST_BRIDGE__` 模拟后端：

```typescript
window.__VIBE_TEST_BRIDGE__.emitSessionStart({ sessionId: "test-1", label: "Test" });
window.__VIBE_TEST_BRIDGE__.emitStateChange({ sessionId: "test-1", state: "running" });
window.__VIBE_TEST_BRIDGE__.emitPermissionRequest({ ... });
```

## 运行测试

```bash
# 前端单元测试
cd frontend && npm test

# 前端 lint
cd frontend && npm run lint

# 后端测试
cd src-tauri && cargo test

# 后端编译检查
cd src-tauri && cargo check
```

## data-testid 速查

| testid | 组件 | 用途 |
|--------|------|------|
| `status-dot` | StatusDot | 状态指示点 |
| `session-label` | SessionItem | 会话标签 |
| `elapsed-time` | SessionItem | 运行时长 |
| `approve-btn` | ApprovalPanel | 批准按钮 |
| `reject-btn` | ApprovalPanel | 拒绝按钮 |
| `tool-name` | ToolHistory | 工具名称 |
| `tool-input` | ToolHistory | 工具输入 |

更多 testid 见 `docs/testing/testing.md`。

## 测试文件结构

```
frontend/src/__tests__/
├── setup.ts
├── components/    # 组件测试
├── hooks/         # Hook 测试
└── store/         # Store 测试

src-tauri/
├── src/*.rs       # 内联单元测试
└── tests/         # 集成测试
```

## 检查清单

- [ ] 新功能有对应测试
- [ ] 状态转换覆盖了合法/非法路径
- [ ] `npm test` 和 `cargo test` 都通过
- [ ] data-testid 不与现有冲突
