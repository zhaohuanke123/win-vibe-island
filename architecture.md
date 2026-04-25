# Architecture - Vibe Island (氛围岛)

## Tech Stack
- **Runtime:** Tauri 2.0 (Rust backend + React frontend)
- **Frontend:** React 19 + TypeScript + Zustand + Vite
- **Backend:** Rust with `windows` crate for Win32 API
- **IPC:** Tauri commands (sync) + Tauri events (async, backend→frontend)

## Process Architecture

```
┌─────────────────────────────────────────────┐
│                 Vibe Island                  │
│                                             │
│  ┌─────────────┐    Tauri Events    ┌─────┐ │
│  │  Rust Backend │ ────────────────→ │ React│ │
│  │              │                   │  UI  │ │
│  │ - Overlay    │    Tauri Invoke   │     │ │
│  │ - Pipe Server│ ←──────────────── │     │ │
│  │ - ProcWatch  │                   └─────┘ │
│  │ - WinFocus   │                           │
│  └──────┬───────┘                           │
│         │ Named Pipe                        │
└─────────┼───────────────────────────────────┘
          │
   ┌──────┴──────┐
   │  Agent SDK  │
   │ Node/Python │
   └─────────────┘
```

## Module Map (Rust Backend)

| Module | File | Purpose |
|--------|------|---------|
| Entry | `main.rs` | Delegates to `app_lib::run()` |
| App Builder | `lib.rs` | Tauri builder, plugin setup, IPC handler registration |
| Overlay | `overlay.rs` | Win32 overlay window (create, interactive, move, destroy) |
| Commands | `commands.rs` | Tauri IPC commands bridging frontend ↔ backend |
| Events | `events.rs` *(planned)* | Tauri event emission to frontend |
| Pipe Server | `pipe_server.rs` *(planned)* | Named Pipe listener for agent SDK |
| Process Watcher | `process_watcher.rs` *(planned)* | Enumerate and poll agent processes |
| Window Focus | `window_focus.rs` *(planned)* | Cross-app window focus management |
| Mock | `mock.rs` *(planned)* | Demo event generator for testing |
| DPI | `dpi.rs` *(planned)* | Per-monitor DPI and multi-display support |

## Frontend Component Map

| Component | File | Purpose |
|-----------|------|---------|
| App | `App.tsx` | Root component, renders Overlay |
| Overlay | `Overlay.tsx` | Main floating overlay with expand/collapse bar |
| StatusDot | `StatusDot.tsx` | Colored state indicator with animations |
| ApprovalPanel | `ApprovalPanel.tsx` *(planned)* | Agent approval request display |
| Store | `store/sessions.ts` | Zustand store for session state |
| Hook | `hooks/useAgentEvents.ts` *(planned)* | Subscribes to Tauri events |

## State Machine

Agent session states: `idle → running → approval → done → idle`

```
idle (gray)     - Agent session exists but inactive
running (blue)  - Agent is actively working (pulsing animation)
approval (amber)- Agent needs user approval (fast pulse)
done (green)    - Task completed
```

## Key Design Decisions

1. **HWND as strings:** Tauri IPC can't pass raw pointers, so HWND handles are formatted as `"HWND(0x1234)"` strings and parsed back with `parse_hwnd`.
2. **Conditional compilation:** All Win32 code gated behind `#[cfg(target_os = "windows")]` with stubs for other platforms.
3. **Overlay styles:** `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE` for floating overlay. Click-through toggled dynamically via `WS_EX_TRANSPARENT`.
4. **Three-layer state detection:** Named Pipe (primary) > PTY Hook (secondary) > Process Polling (fallback).
5. **WebView2 transparent background:** Frontend `body` has `background: transparent` and `overflow: hidden` for overlay rendering.

## IPC Flow

```
Frontend                              Backend
────────                              ───────
invoke("create_overlay", config)  →   commands::create_overlay()
                                   ←   Ok("HWND(0x1234)")
invoke("set_overlay_interactive") →   commands::set_overlay_interactive()
emit("focus_session", pid)        →   commands::focus_session_window()
                                   ←   Tauri events (session_start, state_change, session_end)
listen("agent-event")             ←   pipe_server / process_watcher / mock
```
