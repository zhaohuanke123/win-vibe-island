# Project Architecture

> 本文档定义项目的架构约束。所有代码变更必须符合这些约束。

---

## Overview

Vibe Island (氛围岛) 是一个 Windows 桌面悬浮 Overlay 应用，监控 AI 编程助手会话（Claude Code、Codex 等）并显示其状态。基于 Tauri 2.0（Rust backend + React frontend）构建。

The overlay floats above all windows using Win32 extended window styles and can toggle click-through behavior dynamically.

---

## Tech Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Frontend | React 19 + TypeScript + Zustand + Vite | 现代 React 生态，Zustand 轻焦简单状态管理 |
| Backend | Rust + Tauri 2.0 + `windows` crate | 高性能，原生 Win32 API 访问 |
| IPC | Tauri commands (sync) + Tauri events (async) | 类型安全的进程间通信 |
| Integration | HTTP Hooks (port 7878) + Named Pipe SDK | Claude Code 原生 hooks + 其他 agent SDK |

---

## Directory Structure

```
/
├── CLAUDE.md              # 项目配置和导航入口
├── WORKFLOW.md            # 工作流程和 Documentation Gate
├── executor.md            # Executor 子代理指令
├── verifier.md            # Verifier 子代理指令
├── architecture.md        # 本文件 - 架构约束
├── task.json              # 任务定义和文档引用
├── progress.txt           # 开发历史、文档更新、测试证据
├── DESIGN.md              # 设计文档
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── main.rs        # Entry point
│   │   ├── lib.rs         # Tauri builder, plugin setup
│   │   ├── overlay.rs     # Win32 overlay window
│   │   ├── commands.rs    # IPC commands
│   │   ├── events.rs      # Event emission
│   │   ├── hook_server.rs # HTTP Hook server (port 7878)
│   │   ├── pipe_server.rs # Named Pipe server
│   │   ├── process_watcher.rs # Process enumeration
│   │   ├── window_focus.rs # Cross-app window focus
│   │   └── mock.rs        # Demo event generator
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/              # React 前端
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── hooks/         # React Hooks
│   │   ├── store/         # Zustand 状态
│   │   └── config/        # 配置文件
│   ├── package.json
│   └── vite.config.ts
├── agent-sdk/             # Agent SDK
│   ├── node/              # Node.js SDK
│   └── python/            # Python SDK
└── docs/                  # 文档
    ├── hooks-setup.md     # Claude Code hooks 配置
    └── claude-settings.example.json
```

---

## Data Model

### 核心实体

| Entity | Fields | Relations |
|--------|--------|-----------|
| Session | id, label, state, cwd, pid, created_at, last_activity | Has many ToolExecutions |
| ToolExecution | id, tool_name, input, output, duration, status | Belongs to Session |
| ApprovalRequest | id, session_id, tool_use_id, description, risk_level | Belongs to Session |

### Session States

```
idle (gray)     - Agent session exists but inactive
running (blue)  - Agent is actively working (pulsing animation)
thinking (cyan) - Agent is thinking (scale pulse animation)
streaming (green) - Agent is streaming output
approval (amber)- Agent needs user approval (fast pulse)
done (green)    - Task completed
error (red)     - Error occurred
```

---

## API Design

### IPC Commands (Frontend → Backend)

| Command | Description |
|---------|-------------|
| `create_overlay` | Create overlay window |
| `set_overlay_interactive` | Toggle click-through |
| `focus_session_window` | Focus session's terminal |
| `submit_approval_response` | Submit approval/rejection |
| `get_hook_health` | Get hook server status |
| `update_overlay_size` | Update overlay dimensions |
| `check_hook_config` | Check if Claude Code hooks are configured |
| `install_hooks` | Install hook configuration to settings.json |
| `uninstall_hooks` | Remove Vibe Island hooks from settings.json |
| `get_hook_config_status` | Get current hook configuration status |

### Tauri Events (Backend → Frontend)

| Event | Description |
|-------|-------------|
| `session_start` | New agent session detected |
| `session_end` | Agent session terminated |
| `state_change` | Session state changed |
| `approval_request` | Agent needs approval |

### HTTP Hook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /hooks/pre-tool-use | Pre-tool-use hook |
| POST | /hooks/notification | Notification hook |
| POST | /hooks/stop | Stop hook |
| POST | /hooks/permission-request | Permission request hook |
| GET | /hooks/health | Health check |

---

## Key Constraints

### 必须遵守

1. **HWND 序列化**: Tauri IPC 不能传递原始指针，HWND 必须格式化为 `"HWND(0x1234)"` 字符串
2. **条件编译**: 所有 Win32 代码必须在 `#[cfg(target_os = "windows")]` 块中
3. **Overlay 样式**: 必须保留 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE`

### 禁止事项

1. **禁止直接传递 HWND**: 必须序列化为字符串
2. **禁止删除条件编译**: 非 Windows 平台需要 stub 实现
3. **禁止修改窗口样式常量**: 这些样式对 overlay 功能至关重要

---

## Environment Variables

```env
# Optional
VIBE_ISLAND_PORT=7878      # Hook server port
VIBE_ISLAND_DEBUG=false    # Debug mode
```

---

## Key Design Decisions

1. **Dual integration path**:
   - **Primary**: HTTP Hooks (port 7878) - Claude Code native integration, zero SDK setup
   - **Fallback**: Named Pipe (`\\.\pipe\VibeIsland`) - For Codex CLI and custom agents

2. **WebView2 transparent background**: Frontend `body` has `background: transparent` and `overflow: hidden` for overlay rendering.

3. **Click-through toggle**: `WS_EX_TRANSPARENT` style toggled dynamically for interaction mode switching.

4. **Animation system**: Framer Motion for frontend animations, throttled IPC for window size sync.
