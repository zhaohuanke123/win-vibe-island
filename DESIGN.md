# Vibe Island 氛围岛 - 当前实现设计

> 本文档以当前代码实现为准，说明运行时模块、事件流和已实现能力。

---

## 实现状态

| 功能 | 状态 | 当前实现 |
|------|------|----------|
| Tauri Overlay 主窗口 | 已完成 | `tauri.conf.json` 中主窗口 420x60、透明、无边框、置顶 |
| Win32 Overlay API | 已完成 | `overlay.rs` 支持原生 HWND 创建、点击穿透、DPI scale、SetWindowPos |
| 系统托盘 | 已完成 | `lib.rs` 创建 Show/Hide、Hook 模式、Install/Remove Hooks、Quit 菜单 |
| HTTP Hook Server | 已完成 | `hook_server.rs` 使用 axum 监听 `127.0.0.1:7878` |
| Claude Code 自动配置 | 已完成 | `hook_config.rs` 支持 auto / autoCleanup / manual |
| PermissionRequest 审批 | 已完成 | 后端 pending map + oneshot 等待，前端 ApprovalPanel 提交结果 |
| Hook 健康监控 | 已完成 | `/hooks/health` + `HookStatus.tsx` 5 秒轮询 |
| Named Pipe Server | 已完成 | Windows 下监听 `\\.\pipe\VibeIsland`，支持 SDK fallback |
| Node SDK | 已完成 | `agent-sdk/node` Named Pipe 客户端 |
| Python SDK | 已完成 | `agent-sdk/python` Named Pipe 客户端 |
| 进程监控 | 已完成 | `process_watcher.rs` 检测 claude/codex/aider/cursor/copilot-agent |
| 窗口聚焦 | 已完成 | `window_focus.rs` 按 PID 聚焦窗口，带 fallback |
| 状态动画 | 已完成 | `StatusDot.tsx` 使用 Framer Motion |
| Diff Viewer | 已完成 | Write/Edit 审批请求展示 old/new content diff |
| HookConfigStatus UI | 已存在未挂载 | 组件存在，当前 `App.tsx` 未渲染 |
| ErrorLog UI | 已存在未挂载 | 组件存在，当前 `App.tsx` 未渲染 |
| Mock 模式 | 已移除 | `mock.rs` 不存在，真实测试走 hooks / pipe / unit tests |
| Session 详情/分组/持久化 | 未实现 | 对应 task 34-38 仍 pending |
| Windows 11 DWM 圆角 | 未实现 | task 29 pending；当前圆角主要由前端 CSS clipping 表现 |

---

## 运行时启动流程

1. `src-tauri/src/main.rs` 调用 `app_lib::run()`。
2. `lib.rs` 在 Windows 下调用 `overlay::enable_dpi_awareness()`。
3. Tauri setup 阶段：
   - debug 模式启用 `tauri-plugin-log`；
   - 将主窗口定位到屏幕顶部居中；
   - Windows 下启动 Named Pipe server；
   - 启动 HTTP Hook server；
   - 执行 `hook_config::auto_configure_hooks()`；
   - 创建系统托盘菜单。
4. `App.tsx` 只渲染 `Overlay`，并调用 `useAgentEvents()` 注册 Tauri event listeners。
5. `Overlay.tsx` 初始化为紧凑胶囊尺寸，展开时测量内容高度并同步窗口尺寸，展开最大高度为 `600px`。

---

## 后端模块

### `lib.rs`

- 注册所有 Tauri commands。
- 启动 Hook server 和 Named Pipe server。
- 创建系统托盘：
  - `Show/Hide Overlay`
  - `Hooks -> Hook Config Mode`
  - `Hooks -> Install Hooks`
  - `Hooks -> Remove Hooks`
  - `Quit`
- `Quit` 会停止 Hook server / Pipe server；仅当模式为 `autoCleanup` 时执行 hook 清理。

### `hook_server.rs`

HTTP server 固定监听 `127.0.0.1:7878`，当前路由：

| Route | 状态映射 / 行为 |
|-------|------------------|
| `POST /hooks/session-start` | 创建 session，发 `session_start`，再发 `idle` |
| `POST /hooks/pre-tool-use` | 确保 session 存在，发 `thinking` 和 `tool_use` |
| `POST /hooks/post-tool-use` | 发 `tool_complete`，再发 `streaming` |
| `POST /hooks/post-tool-use-failure` | 发 `tool_error`，再发 `error`，写错误日志 |
| `POST /hooks/notification` | `permission_prompt` -> `approval`，`idle_prompt` -> `idle` |
| `POST /hooks/stop` | 发 `done` |
| `POST /hooks/user-prompt-submit` | 发 `running` |
| `POST /hooks/permission-request` | 存 pending approval，发前端审批事件，等待响应后返回 Claude Code |
| `POST /hooks/ping` | 更新 heartbeat，发 `hook_heartbeat` |
| `GET /hooks/health` | 返回 health JSON |

`PermissionRequest` 后端等待时间常量为 120 秒。当前自动生成的 Claude Code hook timeout 是 60 秒，因此手动配置时建议把 Claude Code hook timeout 设置为 60 秒或更高。

Claude Code PermissionRequest 响应格式按当前代码为：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

拒绝时 `behavior` 为 `deny`。

### `hook_config.rs`

自动配置写入的 required hooks：

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Notification`
- `Stop`
- `UserPromptSubmit`
- `PermissionRequest`

模式：

| Mode | Serialized | 行为 |
|------|------------|------|
| Auto | `auto` | 启动安装，退出保留 |
| AutoCleanup | `autoCleanup` | 启动安装，通过 tray Quit 退出时移除 |
| Manual | `manual` | 不自动安装 |

合并策略：

- 缺失 hook：新增；
- 已有 Vibe Island hook：更新；
- 用户已有非 Vibe Island 同名 hook：跳过，不覆盖；
- 写入前创建 `settings.json.vibe-island-backup`。

### `pipe_server.rs`

Windows 下监听 `\\.\pipe\VibeIsland`，接收 newline-delimited JSON：

```json
{
  "session_id": "agent-session-1",
  "state": "running",
  "payload": {
    "event_type": "session_start",
    "label": "Agent Session",
    "pid": 1234
  }
}
```

基础 `state_change` 总会发出；payload 中 `event_type=session_start` 或 `session_end` 时额外发对应事件。

### `process_watcher.rs`

检测进程名：

- `claude` / `claude.exe`
- `codex` / `codex.exe`
- `aider` / `aider.exe`
- `cursor` / `cursor.exe`
- `copilot-agent` / `copilot-agent.exe`

默认 5000ms 轮询。检测到新进程发 `process_detected`，进程消失发 `process_terminated`。

### `overlay.rs`

原生 Win32 overlay 使用：

```text
WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE
```

支持：

- `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`
- `GetDpiForWindow`
- `GetDpiForMonitor`
- `MonitorFromPoint`
- `SetWindowLongPtrW` 切换 `WS_EX_TRANSPARENT`
- `SetWindowPos(HWND_TOPMOST, ..., SWP_NOACTIVATE)`

### `window_focus.rs`

按 PID 枚举顶层窗口并尝试聚焦。前端点击 session 且 session 有 `pid` 时调用 `focus_session_window`。

---

## 前端模块

### `useAgentEvents.ts`

当前订阅事件：

- `session_start`
- `session_end`
- `state_change`
- `tool_use`
- `tool_complete`
- `tool_error`
- `notification`
- `permission_request`
- `process_detected`
- `process_terminated`
- `approval_timeout`

无效 state 会回退为 `idle`。

### `sessions.ts`

Zustand store 管理：

- sessions 列表；
- active session；
- 当前 approval request；
- hook server health 状态；
- error logs；
- tool execution history。

工具历史保留最近 20 条，错误日志保留最近 50 条。

### `Overlay.tsx`

当前 UI：

- compact height: `52`
- expanded height: content-adaptive, min `180`, max `600`
- width: `420`
- 点击顶部 bar 展开/收起；
- approval request 到达时自动展开；
- session 有 PID 时点击尝试聚焦窗口；
- 顶部右侧显示 `HookStatus`。

### `StatusDot.tsx`

状态颜色和动画：

| State | Color | Animation |
|-------|-------|-----------|
| `idle` | gray | static |
| `thinking` | purple | scale pulse |
| `running` | blue | opacity pulse |
| `streaming` | cyan | fast opacity pulse |
| `approval` | amber | fast scale pulse |
| `error` | red | static |
| `done` | green | static |

---

## Claude Code 集成

用户通常不需要手写配置：默认 `auto` 模式会在启动时尝试自动配置。完整手动配置见 `docs/hooks-setup.md` 和 `docs/claude-settings.example.json`。

当前核心数据来源是 Claude Code hook payload 的 `session_id`。如果缺失，后端回退到 `transcript_path`，最后才生成临时 ID。

Session label 优先从 `cwd` 最后一段提取；没有 `cwd` 时显示 `Claude Code`。

---

## 已知实现边界

1. `HookConfigStatusPanel` 和 `ErrorLog` 组件尚未挂载到当前 UI。
2. 自动 hook 配置未写入 `PostToolUseFailure`，但后端 route 和前端 `tool_error` 处理已实现。
3. `update_overlay_size` 有 16ms 节流，但当前 `Overlay.tsx` 主要使用固定高度的 `set_window_size`。
4. Named Pipe SDK 的状态类型仍是 `idle/running/approval/done` 四态；HTTP Hooks 路径支持七态。
5. 进程命令行读取当前是简化实现，主要依赖进程名匹配。
6. 当前没有持久化 session 历史，重启后 session store 为空。

---

## 关键约束

1. Win32 代码必须保留 `#[cfg(target_os = "windows")]` 和非 Windows stub。
2. HWND 通过 IPC 传递时必须序列化成字符串。
3. 不得删除 overlay 的关键扩展样式：`WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE`。
4. Hook 自动配置必须保持非破坏性，不覆盖用户已有的非 Vibe Island hook。
5. Approval response 必须按 `tool_use_id` 关联 pending request。
