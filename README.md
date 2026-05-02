# Vibe Island

Windows desktop overlay for AI coding agent sessions. Vibe Island tracks Claude Code through HTTP Hooks, supports optional Named Pipe SDK clients for other agents, and shows session state, tool activity, hook health, and approval requests in a floating Dynamic Island-style window.

## Features

- Floating transparent overlay at the top of the screen
- Claude Code HTTP Hooks integration on `localhost:7878`
- Automatic Claude Code hook configuration with `auto`, `autoCleanup`, and `manual` modes
- Multi-session tracking by Claude Code `session_id`
- Tool activity states: `idle`, `thinking`, `running`, `streaming`, `approval`, `error`, `done`
- PermissionRequest approval flow with Approve/Reject from the overlay
- Diff preview for Write/Edit approval requests
- Hook server health indicator
- Optional Named Pipe SDK fallback at `\\.\pipe\VibeIsland`
- Windows process detection and click-to-focus by PID

## Installation

### Download

Download the latest release from the [Releases](https://github.com/vibeisland/vibe-island/releases) page.

Installer formats:

- NSIS installer: `Vibe Island_X.X.X_x64-setup.exe`
- MSI installer: `Vibe Island_X.X.X_x64_en-US.msi`

### System Requirements

- Windows 10 version 1809 or later
- Windows 11 recommended
- WebView2 runtime, installed by the Tauri bundle bootstrapper if needed

## Quick Start

1. Launch Vibe Island.
2. Keep the default hook mode as `auto`, or use the tray menu `Hooks -> Install Hooks`.
3. Restart Claude Code after hooks are installed.
4. Start or resume a Claude Code session.

The app checks Claude Code settings at startup. It prefers an existing user-level `~/.claude/settings.json`, then an existing project-level `.claude/settings.json`, and creates user-level settings if neither exists.

Manual hook configuration is documented in [docs/hooks-setup.md](docs/hooks-setup.md). The generated example is in [docs/claude-settings.example.json](docs/claude-settings.example.json).

## Overlay States

| State | Meaning |
|-------|---------|
| `idle` | Session exists but is waiting |
| `thinking` | Claude is about to use a tool (`PreToolUse`) |
| `running` | User submitted a prompt or approval was accepted |
| `streaming` | A tool completed and Claude is processing the result |
| `approval` | Permission request is waiting for user input |
| `error` | Tool failure was reported |
| `done` | Claude finished a response (`Stop`) |

## Hook Events

| Claude Hook | Endpoint | Overlay Behavior |
|-------------|----------|------------------|
| `SessionStart` | `/hooks/session-start` | Create/update session, set `idle` |
| `PreToolUse` | `/hooks/pre-tool-use` | Set `thinking`, show current tool |
| `PostToolUse` | `/hooks/post-tool-use` | Record completion, set `streaming` |
| `Notification` | `/hooks/notification` | Handle permission/idle notifications |
| `Stop` | `/hooks/stop` | Set `done` |
| `UserPromptSubmit` | `/hooks/user-prompt-submit` | Set `running` |
| `PermissionRequest` | `/hooks/permission-request` | Block for overlay approval/rejection |

The backend also implements `/hooks/post-tool-use-failure`, `/hooks/ping`, and `/hooks/health`. The current auto-generated Claude Code config writes the seven hooks listed above.

## Approval Flow

When Claude Code sends `PermissionRequest`:

1. The backend stores a pending approval by `tool_use_id`.
2. The overlay expands and shows tool name, action, risk level, and optional diff.
3. Approve/Reject calls `submit_approval_response`.
4. The hook response is returned to Claude Code as `hookSpecificOutput`.

The generated hook timeout is 60 seconds. The backend fallback timeout is 120 seconds.

## System Tray

Tray menu:

- `Show/Hide Overlay`
- `Hooks -> Hook Config Mode`
- `Hooks -> Install Hooks`
- `Hooks -> Remove Hooks`
- `Quit`

`autoCleanup` mode removes Vibe Island hooks when exiting through the tray `Quit` action.

## Optional SDK Integration

Non-Claude agents can send newline-delimited JSON to the Windows named pipe:

```json
{
  "session_id": "agent-session-1",
  "state": "running",
  "payload": {
    "event_type": "session_start",
    "label": "Custom Agent",
    "pid": 1234
  }
}
```

SDK packages live in:

- `agent-sdk/node`
- `agent-sdk/python`

## Development

Prerequisites:

- Rust 1.77+
- Node.js 18+
- Windows 10/11 for native overlay, named pipe, process watcher, and focus behavior

Commands:

```bash
# Start dev server (Tauri + Vite hot reload)
cd src-tauri && cargo tauri dev

# Build for production
cd src-tauri && cargo tauri build

# Frontend only
cd frontend && npm run dev

# Frontend lint/build/test
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm test

# Backend tests
cd src-tauri && cargo test
```

## Architecture

See [architecture.md](architecture.md) and [DESIGN.md](DESIGN.md) for current implementation details and constraints.

## Troubleshooting

### Sessions Not Appearing

- Confirm Vibe Island is running in the tray.
- Use `Hooks -> Install Hooks`, then restart Claude Code.
- Check `http://localhost:7878/hooks/health`.
- Confirm port 7878 is not blocked or already in use.

### Approval Panel Appears But Claude Does Not Continue

- Ensure `PermissionRequest` is configured with endpoint `http://localhost:7878/hooks/permission-request`.
- Ensure the hook timeout is high enough for user interaction.
- Use the latest docs response format in [docs/hooks-setup.md](docs/hooks-setup.md).

### Overlay Not Visible

- Use tray `Show/Hide Overlay`.
- Check for another always-on-top app covering the top-center screen area.

## License

MIT License.
