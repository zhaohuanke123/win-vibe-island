# Architecture - Vibe Island (氛围岛)

## Tech Stack
- **Runtime:** Tauri 2.0 (Rust backend + React frontend)
- **Frontend:** React 19 + TypeScript + Zustand + Vite
- **Backend:** Rust with `windows` crate for Win32 API
- **IPC:** Tauri commands (sync) + Tauri events (async, backend→frontend)
- **Integration:** Claude Code HTTP Hooks (primary) + Named Pipe SDK (fallback)

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vibe Island                               │
│                                                                 │
│  ┌───────────────────┐      Tauri Events      ┌─────────────┐  │
│  │   Rust Backend     │ ─────────────────────→│  React UI   │  │
│  │                    │                        │             │  │
│  │ ┌────────────────┐ │      Tauri Invoke      │ - Overlay   │  │
│  │ │ Hook Server    │ │ ←───────────────────── │ - Approval  │  │
│  │ │ (HTTP :7878)   │ │                        │ - DiffView  │  │
│  │ └────────────────┘ │                        └─────────────┘  │
│  │ ┌────────────────┐ │                                         │
│  │ │ Pipe Server    │ │      ┌──────────────┐                  │
│  │ │ (Named Pipe)   │ │      │ Process      │                  │
│  │ └────────────────┘ │      │ Watcher      │                  │
│  │ ┌────────────────┐ │      └──────────────┘                  │
│  │ │ Mock Generator │ │                                         │
│  │ └────────────────┘ │                                         │
│  │ ┌────────────────┐ │                                         │
│  │ │ Window Focus   │ │                                         │
│  │ └────────────────┘ │                                         │
│  └───────────────────┘                                         │
└─────────────────────────────────────────────────────────────────┘
           │                    │
           │ HTTP Hooks         │ Named Pipe
           ↓                    ↓
    ┌──────────────┐     ┌──────────────┐
    │ Claude Code  │     │  Agent SDK   │
    │ (native)     │     │ Node/Python  │
    └──────────────┘     └──────────────┘
```

## Module Map (Rust Backend)

| Module | File | Status | Purpose |
|--------|------|--------|---------|
| Entry | `main.rs` | ✅ | Delegates to `app_lib::run()` |
| App Builder | `lib.rs` | ✅ | Tauri builder, plugin setup, IPC handler registration |
| Overlay | `overlay.rs` | ✅ | Win32 overlay window (create, interactive, move, destroy) |
| Commands | `commands.rs` | ✅ | Tauri IPC commands bridging frontend ↔ backend |
| Events | `events.rs` | ✅ | Tauri event emission to frontend |
| Hook Server | `hook_server.rs` | ✅ | HTTP server for Claude Code hooks (port 7878) |
| Pipe Server | `pipe_server.rs` | ✅ | Named Pipe listener for agent SDK |
| Process Watcher | `process_watcher.rs` | ✅ | Enumerate and poll agent processes |
| Window Focus | `window_focus.rs` | ✅ | Cross-app window focus management |
| Mock | `mock.rs` | ✅ | Demo event generator for testing |

## Frontend Component Map

| Component | File | Status | Purpose |
|-----------|------|--------|---------|
| App | `App.tsx` | ✅ | Root component, renders Overlay |
| Overlay | `Overlay.tsx` | ✅ | Main floating overlay with expand/collapse bar |
| StatusDot | `StatusDot.tsx` | ✅ | Colored state indicator with animations |
| ApprovalPanel | `ApprovalPanel.tsx` | ✅ | Agent approval request display with actions |
| DiffViewer | `DiffViewer.tsx` | ✅ | Code diff preview for approval requests |
| Store | `store/sessions.ts` | ✅ | Zustand store for session state |
| Hook | `hooks/useAgentEvents.ts` | ✅ | Subscribes to Tauri events |

## Agent SDK

| SDK | Path | Status | Purpose |
|-----|------|--------|---------|
| Node.js | `agent-sdk/node/` | ✅ | For Claude Code / Node.js agents |
| Python | `agent-sdk/python/` | ✅ | For Codex CLI / Python agents |

## Documentation

| Doc | Path | Status | Purpose |
|-----|------|--------|---------|
| Hooks Setup | `docs/hooks-setup.md` | ✅ | Claude Code hooks configuration guide |
| Settings Example | `docs/claude-settings.example.json` | ✅ | Example .claude/settings.json |

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
4. **Dual integration path:**
   - **Primary:** HTTP Hooks (port 7878) - Claude Code native integration, zero SDK setup
   - **Fallback:** Named Pipe (`\\.\pipe\VibeIsland`) - For Codex CLI and custom agents
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
listen("agent-event")             ←   hook_server / pipe_server / process_watcher / mock
```

## Claude Code Integration (HTTP Hooks)

```
Claude Code                          Vibe Island
───────────                          ───────────
POST /hooks/pre-tool-use        →   hook_server::handle_pre_tool_use()
                                   ←   Approval response (allow/deny)
POST /hooks/notification        →   hook_server::handle_notification()
POST /hooks/stop                →   hook_server::handle_stop()
```

Hook configuration in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/pre-tool-use" }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/notification" }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/stop" }] }]
  }
}
```
