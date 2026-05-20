---
name: run
description: |
  启动和运行 Vibe Island Tauri 桌面应用。包含开发模式、前端独立模式、生产构建、以及常见问题排查。
  触发条件：
  - 用户要求运行、启动、启动应用、打开 overlay
  - "启动 Tauri"、"cargo tauri dev"、"run the app"
  - 需要验证 UI 变更（动画、样式、组件）
  - 需要测试 hook 集成
  - 构建生产版本、"打包"、"release build"
  不要触发：纯后端逻辑测试（用 testing skill）、仅代码审查
---

# 运行 Vibe Island

Vibe Island 是 Tauri 2.0 桌面应用（Rust + React），运行方式分三种。

## 方式一：Tauri 完整开发模式

启动完整的 Tauri 应用（带 WebView2 窗口、Hook Server、Pipe Server）：

```bash
cd src-tauri && cargo tauri dev
```

这会：
1. 启动 Vite 前端开发服务器（localhost:5187）
2. 编译 Rust 后端（debug 模式，含测试命令）
3. 打开 Windows WebView2 悬浮窗口

退出：关闭窗口或 Ctrl+C 终端。

## 方式二：仅前端开发服务器

无需 Tauri/WebView2，纯浏览器中测试 UI。适合快速迭代 CSS、动画、组件：

```bash
cd frontend && npm run dev
# 或从项目根目录
npm --prefix frontend run dev
```

浏览器打开 `http://localhost:5187`。

**注意**：此模式下没有 Tauri IPC 层，`invoke()` 调用会静默失败。需要用 Test Bridge API (`window.__VIBE_TEST_BRIDGE__`) 模拟后端事件。详见 `testing` skill。

### Playwright 驱动前端测试

```bash
cd frontend && npm run dev &
npx playwright test
```

Playwright 配置在 `tests/e2e/` 下。

## 方式三：生产构建

```bash
cd src-tauri && cargo tauri build
```

产物在 `src-tauri/target/release/bundle/`：
- `.msi` 安装包
- `.exe` 便携执行文件

**注意**：Debug 构建包含 `simulate_*` 测试命令，Release 构建不包含。

## 触发 UI 交互测试

### Hook 测试（需要 Tauri dev 模式运行中）

```bash
# 会话开始
curl -X POST http://localhost:7878/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"s1","cwd":"D:\\project","source":"claude"}'

# 权限请求（会阻塞等待用户点击 approve/reject）
curl --max-time 10 -X POST http://localhost:7878/hooks/permission-request \
  -H "Content-Type: application/json" \
  -d '{"session_id":"s1","tool_use_id":"t1","tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'
```

### WebView 控制台测试命令（debug 构建）

在 Tauri WebView 的开发者工具控制台中：

```javascript
await invoke("simulate_session_start", { sessionId: "t1", label: "Test Project" });
await invoke("simulate_state_change", { sessionId: "t1", state: "running" });
await invoke("simulate_permission_request", { sessionId: "t1", toolUseId: "x1", toolName: "Bash" });
await invoke("test_reset_sessions");
await invoke("get_window_geometry");
```

## 常见问题排查

### Tauri 窗口不显示

1. 检查是否已有实例运行（系统托盘）
2. `cargo tauri dev` 输出中是否有编译错误
3. Windows 防病毒软件可能拦截 WebView2 窗口创建

### Hook Server 无响应

```bash
curl http://localhost:7878/hooks/health
# 应返回 {"status":"connected"}
```

如果无响应：检查 `tauri.conf.json` 中 CSP 是否允许 `connect-src http://localhost:7878`。

### WebView2 版本问题

Tauri 需要 WebView2 Runtime。Windows 11 已预装，Windows 10 可能需要安装：
```
https://developer.microsoft.com/microsoft-edge/webview2/
```

### 端口冲突

- Hook Server 默认端口 `7878`，在 `tauri.conf.json` 或 config 中修改
- Vite 默认端口 `5187`

### 动画/UI 不更新

1. 检查浏览器控制台是否有 JS 错误
2. 确认 `window.devicePixelRatio` 正确（WebView2 可能返回错误值）
3. 确认 Framer Motion 动画在 WebView2 中正确触发

### 构建前检查清单

- [ ] `npm --prefix frontend run build` 无错误
- [ ] `cargo check` 无错误
- [ ] `npm --prefix frontend run lint` 无警告
- [ ] 所有 testid 不与现有冲突
