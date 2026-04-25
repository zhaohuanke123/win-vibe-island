# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibe Island (氛围岛) is a Windows desktop overlay app that monitors AI coding agent sessions (Claude Code, Codex, etc.) and displays their state as a floating overlay. Built with Tauri 2.0 (Rust backend + React frontend).

The overlay floats above all windows using Win32 extended window styles (`WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED`) and can toggle click-through behavior dynamically.

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

- `lib.rs` — Tauri builder, registers IPC command handlers and debug-only log plugin
- `main.rs` — Entry point, delegates to `app_lib::run()`
- `overlay.rs` — Win32 overlay window management (create, set interactive, move, destroy). All Win32 calls gated behind `#[cfg(target_os = "windows")]` with stubs for other platforms.
- `commands.rs` — Tauri IPC commands bridging frontend to overlay functions. HWND handles are passed as strings (e.g. `"HWND(0x1234)"`) and parsed back with `parse_hwnd`.

### React Frontend (`frontend/src/`)

- `App.tsx` — Root, renders `<Overlay />`
- `store/sessions.ts` — Zustand store for agent sessions. `AgentState` type: `"idle" | "running" | "approval" | "done"`
- `components/Overlay.tsx` — Main overlay UI with expand/collapse bar and session list
- `components/StatusDot.tsx` — Colored state indicator dot

### IPC Flow

Frontend calls Tauri commands (`invoke("create_overlay", ...)`) which map to Rust functions in `commands.rs`. HWND handles are serialized as strings and round-tripped between frontend and backend.

## Key Constraints

- Windows-only for overlay functionality; non-Windows builds return errors from overlay functions
- The `windows` crate is conditionally compiled (`[target.'cfg(target_os = "windows")'.dependencies]` in Cargo.toml)
- Frontend dist is at `frontend/dist`, served by Tauri in production
- Uses `tauri-plugin-log` in debug builds only

## Planned Features (from DESIGN.md, not yet implemented)

- Named Pipe server for agent event streaming
- PTY hook for parsing agent CLI output
- Process polling as fallback state detection
- Cross-app window focus management
- Agent SDK (Node.js + Python) for injecting into Claude Code / Codex
