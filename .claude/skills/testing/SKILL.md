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

### Layer 2：Tauri Hook 测试

```bash
cd src-tauri && cargo tauri dev
```

完整 Tauri 应用 + 真实 Hook Server。使用 Rust 测试命令模拟事件。

### Layer 3：Rust Test Commands

Debug 构建中提供的 IPC 测试命令：
- `simulate_session_start` — 模拟会话开始
- `simulate_state_change` — 模拟状态变更
- `simulate_permission_request` — 模拟审批请求
- `simulate_session_end` — 模拟会话结束
- `test_reset_sessions` — 重置所有会话
- `get_window_geometry` — 获取窗口几何信息

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
