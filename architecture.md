# Project Architecture

> 本文档描述当前代码实现和必须遵守的架构约束。若文档与代码冲突，本次同步以当前代码实现为准。

---

## Overview

Vibe Island (氛围岛) 是一个 Windows 桌面悬浮 Overlay 应用，用于监控 AI 编程助手会话（Claude Code、Codex、自定义 agent）并显示状态、工具调用和审批请求。项目基于 Tauri 2.0（Rust backend + React frontend）构建。

当前主集成路径是 Claude Code HTTP Hooks；Named Pipe SDK 保留为 Codex CLI 和自定义 agent 的可选 fallback。Overlay 由透明、无边框、置顶的 Tauri WebView 窗口承载，Rust 侧提供 Win32 窗口样式、DPI、聚焦和进程监控能力。

---

## Tech Stack

| Layer | Technology | Current Use |
|-------|------------|-------------|
| Frontend | React 19 + TypeScript + Zustand + Vite | Overlay UI、事件订阅、状态管理、测试 |
| Animation | Framer Motion | StatusDot 状态动画和 Overlay 动画基础 |
| Backend | Rust + Tauri 2.0 | 桌面应用、IPC commands、系统托盘 |
| Native Windows | `windows` crate | Win32 窗口样式、DPI、进程枚举、窗口聚焦 |
| HTTP Server | axum + tower-http | Claude Code Hooks，监听 `127.0.0.1:7878` |
| Async Runtime | tokio | Hook server、Named Pipe server、后台轮询 |
| State | parking_lot + Tauri events | 后端运行状态和前后端异步事件 |
| Testing | Vitest + Rust tests | 前端 store/hook/component 测试、后端 hook 测试 |

---

## Directory Structure

```
/
├── AGENTS.md              # 项目配置和导航入口
├── WORKFLOW.md            # 工作流程和 Documentation Gate
├── architecture.md        # 本文件 - 架构约束
├── DESIGN.md              # 实现设计说明
├── task.json              # 任务定义和文档引用
├── progress.txt           # 开发历史、文档更新、测试证据
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri 入口
│   │   ├── lib.rs               # Tauri builder、tray、server startup、commands 注册
│   │   ├── commands.rs          # IPC commands
│   │   ├── events.rs            # 基础 Tauri event helper
│   │   ├── hook_server.rs       # Claude Code HTTP Hook server
│   │   ├── hook_config.rs       # Claude Code settings.json 自动配置/清理
│   │   ├── pipe_server.rs       # Named Pipe server (`\\.\pipe\VibeIsland`)
│   │   ├── process_watcher.rs   # Agent 进程枚举和生命周期事件
│   │   ├── overlay.rs           # Win32 Overlay、DPI、点击穿透
│   │   └── window_focus.rs      # 按 PID 聚焦终端/编辑器窗口
│   ├── tests/
│   │   └── hook_server_integration.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Overlay.tsx
│   │   │   ├── StatusDot.tsx
│   │   │   ├── ApprovalPanel.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── HookStatus.tsx
│   │   │   ├── HookConfigStatus.tsx
│   │   │   └── ErrorLog.tsx
│   │   ├── hooks/useAgentEvents.ts
│   │   ├── store/sessions.ts
│   │   ├── config/animation.ts
│   │   └── __tests__/
│   └── package.json
├── agent-sdk/
│   ├── node/
│   └── python/
└── docs/
    ├── hooks-setup.md
    ├── claude-settings.example.json
    ├── testing-strategy.md
    └── animation-design.md
```

`HookConfigStatus.tsx` 和 `ErrorLog.tsx` 已存在，但当前 `App.tsx` 只挂载 `Overlay`，`Overlay` 内当前只直接使用 `HookStatus`、`ApprovalPanel`、`StatusDot` 和 session 列表。

---

## Runtime Architecture

1. `lib.rs` 启动时启用 Windows DPI awareness，并把主窗口定位到屏幕顶部居中。
2. Windows 下启动 Named Pipe server；所有平台启动 HTTP Hook server。
3. `hook_config::auto_configure_hooks()` 根据配置模式自动写入 Claude Code hooks。
4. 后端收到 HTTP Hook / Named Pipe / 进程监控事件后，通过 Tauri events 推送到前端。
5. `frontend/src/hooks/useAgentEvents.ts` 订阅事件并更新 Zustand store。
6. `Overlay.tsx` 渲染当前 active session、session 列表、hook health 状态和审批面板。
7. 用户在审批面板 Approve/Reject 后调用 `submit_approval_response`，后端将结果返回给正在等待的 `PermissionRequest` hook。

---

## Data Model

### Session

前端 store 中的实际字段：

| Field | Description |
|-------|-------------|
| `id` | 会话 ID，优先使用 Claude Code `session_id` |
| `label` | 展示名，通常取 `cwd` 最后一段 |
| `cwd` | 会话工作目录 |
| `state` | `idle` / `thinking` / `running` / `streaming` / `approval` / `error` / `done` |
| `pid` | 可选进程 ID，用于窗口聚焦 |
| `createdAt` / `lastActivity` | 前端时间戳 |
| `currentTool` | 当前工具名、输入、开始时间 |
| `toolName` / `filePath` | UI 展示用工具信息 |
| `toolHistory` | 最近 20 条工具执行记录 |
| `lastError` | 最近错误信息 |
| `model` / `source` | 可选 Claude Code hook 元信息 |

### ToolExecution

| Field | Description |
|-------|-------------|
| `id` | 前端生成的执行 ID |
| `toolName` | 工具名 |
| `input` | 工具输入 |
| `output` / `outputSummary` | 可选输出信息 |
| `duration` | 执行耗时 |
| `error` | 失败信息 |
| `timestamp` | 记录时间 |
| `status` | `pending` / `running` / `success` / `failed` |

### ApprovalRequest

| Field | Description |
|-------|-------------|
| `toolUseId` | 与后端 pending approval 关联的 ID |
| `sessionId` / `sessionLabel` | 所属 session |
| `toolName` | 请求审批的工具 |
| `action` | 后端格式化的人类可读动作描述 |
| `riskLevel` | `low` / `medium` / `high` |
| `diff` | Write/Edit 时可选 diff 预览 |

---

## Session States

| State | Color | Behavior |
|-------|-------|----------|
| `idle` | gray | 会话存在但未活动 |
| `thinking` | purple | PreToolUse 后，scale pulse |
| `running` | blue | UserPromptSubmit 或审批通过后，opacity pulse |
| `streaming` | cyan | PostToolUse 后，快速 opacity pulse |
| `approval` | amber | PermissionRequest 或 permission notification，快速 scale pulse |
| `error` | red | PostToolUseFailure 或错误状态 |
| `done` | green | Stop hook 后 |

---

## IPC Commands

### Overlay / Window

| Command | Description |
|---------|-------------|
| `create_overlay` | 创建原生 overlay HWND，返回序列化 HWND 字符串 |
| `set_overlay_interactive` | 切换原生 overlay HWND 的点击穿透 |
| `update_overlay` | 更新原生 overlay HWND 位置和尺寸 |
| `destroy_overlay` | 销毁原生 overlay HWND |
| `set_window_size` | 设置主 Tauri WebView 窗口尺寸，并默认顶部居中 |
| `set_window_interactive` | 切换主 Tauri WebView 窗口点击穿透 |
| `update_overlay_size` | 动画同步用轻量 resize，约 16ms 节流，不重居中 |

### DPI

| Command | Description |
|---------|-------------|
| `get_dpi_scale` | 获取指定 HWND 的 DPI scale |
| `get_dpi_scale_at_position` | 获取指定屏幕点所在显示器 DPI scale |
| `update_overlay_with_dpi` | 带显式 DPI scale 更新 overlay |
| `enable_dpi_awareness` | 启用 Per-Monitor DPI Awareness V2 |

### Hook Server

| Command | Description |
|---------|-------------|
| `get_hook_server_status` | 返回 hook server 是否运行和端口 |
| `start_hook_server` / `stop_hook_server` | 启停 HTTP hook server |
| `get_hook_health` | 返回连接状态、uptime、请求数、错误数、pending approvals |
| `get_hook_errors` | 读取后端 hook 错误日志 |
| `clear_hook_errors` | 清空 hook 错误日志 |
| `submit_approval_response` | 通过 `tool_use_id` 提交审批结果 |

### Hook Configuration

| Command | Description |
|---------|-------------|
| `check_hook_config` | 检查 Claude Code settings 是否包含必需 hooks |
| `install_hooks` | 合并写入 Vibe Island hooks，并创建备份 |
| `uninstall_hooks` | 移除 Vibe Island hooks，存在备份时恢复备份 |
| `get_hook_config_status` | 读取当前 hook 配置状态 |
| `set_hook_config_mode` / `get_hook_config_mode` | 持久化读取自动配置模式 |

### Named Pipe / Process / Focus

| Command | Description |
|---------|-------------|
| `get_pipe_server_status` | 返回 Named Pipe server 状态 |
| `start_pipe_server` / `stop_pipe_server` | 启停 Named Pipe server |
| `start_process_watcher` / `stop_process_watcher` | 启停进程轮询 |
| `get_process_watcher_status` | 返回进程监控状态 |
| `get_detected_processes` | 返回当前检测到的 agent 进程 |
| `set_process_watcher_config` | 设置轮询间隔和 node 进程检测开关 |
| `focus_session_window` | 按 PID 聚焦会话窗口 |
| `emit_test_event` | 开发/测试用事件注入命令 |

---

## Tauri Events

| Event | Producer | Description |
|-------|----------|-------------|
| `session_start` | Hook server / pipe server / test command | 创建或更新 session |
| `session_end` | Pipe server / test command | 移除 session |
| `state_change` | Hook server / pipe server / test command | 更新 session state |
| `tool_use` | `PreToolUse` hook | 设置当前工具和文件路径 |
| `tool_complete` | `PostToolUse` hook | 记录成功工具执行并清除当前工具 |
| `tool_error` | `PostToolUseFailure` hook | 记录失败工具执行和错误 |
| `notification` | `Notification` hook | 普通通知事件 |
| `permission_request` | `PermissionRequest` hook | 显示审批面板 |
| `approval_timeout` | `PermissionRequest` timeout | 清理前端审批面板 |
| `hook_heartbeat` | `/hooks/ping` | Hook server 心跳 |
| `process_detected` | Process watcher | 检测到 agent 进程 |
| `process_terminated` | Process watcher | agent 进程退出 |

---

## HTTP Hook Endpoints

Hook server 固定监听 `127.0.0.1:7878`。

| Method | Endpoint | Behavior |
|--------|----------|----------|
| POST | `/hooks/session-start` | 创建 session，并初始化为 `idle` |
| POST | `/hooks/pre-tool-use` | 确保 session 存在，切到 `thinking`，发出 `tool_use` |
| POST | `/hooks/post-tool-use` | 发出 `tool_complete`，切到 `streaming` |
| POST | `/hooks/post-tool-use-failure` | 发出 `tool_error`，切到 `error`，记录错误日志 |
| POST | `/hooks/notification` | `permission_prompt` -> `approval`，`idle_prompt` -> `idle`，其他发 `notification` |
| POST | `/hooks/stop` | 切到 `done` |
| POST | `/hooks/user-prompt-submit` | 切到 `running` |
| POST | `/hooks/permission-request` | 阻塞等待前端审批，返回 Claude Code PermissionRequest 响应 |
| POST | `/hooks/ping` | 更新 heartbeat 并发 `hook_heartbeat` |
| GET | `/hooks/health` | 返回 hook server health JSON |

自动配置当前写入的必需 Claude Code hook 事件为：`SessionStart`、`PreToolUse`、`PostToolUse`、`Notification`、`Stop`、`UserPromptSubmit`、`PermissionRequest`。`PostToolUseFailure` 和 `/hooks/ping` 路由已实现，但不在当前自动写入的 required hooks 列表中。

---

## Hook Configuration Modes

| Mode | Serialized Value | Behavior |
|------|------------------|----------|
| Auto | `auto` | 启动时自动配置 hooks，退出时保留 |
| AutoCleanup | `autoCleanup` | 启动时自动配置 hooks，通过 tray Quit 退出时移除 |
| Manual | `manual` | 不自动配置，由用户手动管理 |

配置文件存储在系统配置目录下的 `vibe-island/config.json`。Claude Code settings 优先使用已有的用户级 `~/.claude/settings.json`，其次使用当前目录 `.claude/settings.json`；若都不存在则创建用户级 settings。

`install_hooks` 会在写入前创建备份：`settings.json.vibe-island-backup`。合并策略是非破坏性的：缺失的 hook 会新增，已指向 Vibe Island 的 hook 会更新，用户已有且不指向 Vibe Island 的同名 hook 会保留不覆盖。

---

## Key Constraints

### 必须遵守

1. **HWND 序列化**：Tauri IPC 不能传递原始指针，HWND 必须格式化为字符串后跨 IPC 传递。
2. **条件编译**：所有 Win32 专用代码必须在 `#[cfg(target_os = "windows")]` 下，并为非 Windows 提供 stub。
3. **Overlay 样式**：原生 overlay 创建时必须保留 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE`。
4. **主窗口透明**：Tauri 主窗口保持 `transparent: true`、`decorations: false`、`alwaysOnTop: true`。
5. **Hook 配置非破坏性**：自动配置不得覆盖用户已有的非 Vibe Island hook。
6. **审批关联**：审批响应必须通过 `tool_use_id` 匹配 pending approval，不能只按 session 匹配。

### 禁止事项

1. 禁止直接通过 IPC 传递 raw HWND。
2. 禁止删除 Win32 代码的 target OS 条件编译。
3. 禁止移除 overlay 关键扩展窗口样式。
4. 禁止把 Mock/demo 作为真实集成路径；当前真实路径是 HTTP Hooks 和 Named Pipe SDK。
