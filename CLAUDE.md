# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

- [architecture.md](architecture.md) — 技术架构详述，模块映射，IPC 流程
- [DESIGN.md](DESIGN.md) — 设计文档，Win32 API 用法，集成方式
- [docs/hooks-setup.md](docs/hooks-setup.md) — Claude Code Hooks 配置指南
- [task.json](task.json) — 任务定义和进度跟踪
- [progress.txt](progress.txt) — 开发进度记录

## Project Overview

Vibe Island (氛围岛) is a Windows desktop overlay app that monitors AI coding agent sessions (Claude Code, Codex, etc.) and displays their state as a floating overlay. Built with Tauri 2.0 (Rust backend + React frontend).

The overlay floats above all windows using Win32 extended window styles (`WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED`) and can toggle click-through behavior dynamically.

**Integration:** Claude Code HTTP Hooks (primary, port 7878) + Named Pipe SDK (fallback for other agents).

## Development Commands

```bash
# Start dev server (Tauri + Vite hot reload)
cd src-tauri && cargo tauri dev

# Build for production
cd src-tauri && cargo tauri build

# Frontend only (without Tauri)
cd frontend && npm run dev

# Lint frontend
cd frontend && npm run lint

# Build frontend only
cd frontend && npm run build
```

## Architecture

**Two-process Tauri app:** Rust backend manages Win32 overlay windows, React frontend renders inside WebView2.

### Rust Backend (`src-tauri/src/`)

| File | Purpose |
|------|---------|
| `main.rs` | Entry point, delegates to `app_lib::run()` |
| `lib.rs` | Tauri builder, plugin setup, IPC handler registration |
| `overlay.rs` | Win32 overlay window management (create, interactive, move, destroy) |
| `commands.rs` | Tauri IPC commands bridging frontend ↔ backend |
| `events.rs` | Tauri event emission to frontend |
| `hook_server.rs` | HTTP server for Claude Code hooks (port 7878) |
| `pipe_server.rs` | Named Pipe listener for Agent SDK |
| `process_watcher.rs` | Process enumeration and agent detection |
| `window_focus.rs` | Cross-app window focus management |
| `mock.rs` | Demo event generator for testing |

All Win32 calls gated behind `#[cfg(target_os = "windows")]` with stubs for other platforms.

### React Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root, renders `<Overlay />` |
| `components/Overlay.tsx` | Main overlay UI with expand/collapse bar and session list |
| `components/StatusDot.tsx` | Colored state indicator dot with animations |
| `components/ApprovalPanel.tsx` | Approval request display with Approve/Reject buttons |
| `components/DiffViewer.tsx` | Code diff preview for approval requests |
| `store/sessions.ts` | Zustand store for agent sessions |
| `hooks/useAgentEvents.ts` | Subscribes to Tauri events |

### Agent SDK (`agent-sdk/`)

| Path | Purpose |
|------|---------|
| `node/` | Node.js SDK for Claude Code / Node.js agents |
| `python/` | Python SDK for Codex CLI / Python agents |

### IPC Flow

Frontend calls Tauri commands (`invoke("create_overlay", ...)`) which map to Rust functions in `commands.rs`. HWND handles are serialized as strings and round-tripped between frontend and backend.

Backend emits events via `events.rs` which frontend subscribes to via `useAgentEvents` hook.

## Key Constraints

- Windows-only for overlay functionality; non-Windows builds return errors from overlay functions
- The `windows` crate is conditionally compiled (`[target.'cfg(target_os = "windows")'.dependencies]` in Cargo.toml)
- Frontend dist is at `frontend/dist`, served by Tauri in production
- Uses `tauri-plugin-log` in debug builds only

## Claude Code Integration

Configure hooks in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/pre-tool-use" }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/notification" }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/stop" }] }]
  }
}
```

See `docs/hooks-setup.md` for detailed setup instructions.
