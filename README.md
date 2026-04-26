# Vibe Island (氛围岛)

A Windows desktop overlay app that monitors AI coding agent sessions (Claude Code, Codex, etc.) and displays their state as a floating overlay - inspired by Apple's Dynamic Island.

![Vibe Island Screenshot](docs/screenshot.png)

## Features

- **Floating Overlay**: Always-visible status bar at the top of your screen
- **Real-time State Tracking**: Shows agent state (idle, running, awaiting approval, done)
- **Claude Code Integration**: Native HTTP hooks support - no SDK installation required
- **Multi-session Support**: Track multiple agent sessions simultaneously
- **Click-through Toggle**: Overlay can be interactive or click-through

## Quick Start

### 1. Install Vibe Island

Download the latest release from GitHub and run the installer.

### 2. Configure Claude Code Hooks

Add the following to your `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/pre-tool-use",
            "timeout": 30
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/notification"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/stop"
          }
        ]
      }
    ]
  }
}
```

### 3. Start Using

- Launch Vibe Island - it appears as a small bar at the top of your screen
- Start a Claude Code session - Vibe Island automatically shows the session state
- Click the overlay to expand and see all active sessions

## Hook Events

| Event | When Triggered | Overlay State |
|-------|----------------|---------------|
| `PreToolUse` | Claude executes a tool (Write, Edit, Bash, etc.) | `running` |
| `Notification` | Claude needs user attention (approval, error) | `approval` or current |
| `Stop` | Claude finishes a response | `done` |

## Development

### Prerequisites

- Rust 1.70+
- Node.js 18+
- Windows 10/11

### Commands

```bash
# Start dev server (Tauri + Vite hot reload)
cd src-tauri && cargo tauri dev

# Build for production
cd src-tauri && cargo tauri build

# Frontend only (without Tauri)
cd frontend && npm run dev

# Lint frontend
cd frontend && npm run lint
```

### Architecture

```
Vibe Island
├── src-tauri/          # Rust backend
│   ├── hook_server.rs  # HTTP server for Claude Code hooks
│   ├── pipe_server.rs  # Named pipe for SDK fallback
│   ├── process_watcher.rs  # Process detection
│   └── overlay.rs      # Win32 overlay window management
└── frontend/           # React frontend
    └── src/
        ├── components/ # Overlay UI components
        ├── hooks/      # Event listeners
        └── store/      # Zustand state management
```

## License

MIT
