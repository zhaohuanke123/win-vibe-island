# Vibe Island

A Windows desktop overlay app that monitors AI coding agent sessions (Claude Code, Codex, etc.) and displays their state as a floating overlay - inspired by Apple's Dynamic Island.

<!-- Screenshot placeholder - add docs/screenshot.png -->
<!-- ![Vibe Island Screenshot](docs/screenshot.png) -->

## Features

- **Floating Overlay**: Always-visible status bar at the top of your screen
- **Real-time State Tracking**: Shows agent state (idle, running, awaiting approval, done)
- **Claude Code Integration**: Native HTTP hooks support - no SDK installation required
- **Multi-session Support**: Track multiple agent sessions simultaneously
- **Click-through Toggle**: Overlay can be interactive or click-through
- **Approval Flow**: Approve or reject tool executions directly from the overlay

## Installation

### Download

Download the latest release from the [Releases](https://github.com/vibeisland/vibe-island/releases) page.

Two installer formats are available:
- **NSIS Installer** (`Vibe Island_X.X.X_x64-setup.exe`) - Recommended, smaller size
- **MSI Installer** (`Vibe Island_X.X.X_x64_en-US.msi`) - For enterprise deployment

### System Requirements

- Windows 10 version 1809 or later
- Windows 11 (recommended)
- No additional runtime dependencies required

### Install Steps

1. Download and run the installer
2. Follow the installation wizard
3. Launch Vibe Island from the Start Menu or Desktop shortcut

## Quick Start

### Step 1: Install Vibe Island

Run the downloaded installer and follow the prompts.

### Step 2: Configure Claude Code Hooks

Add the following to your Claude Code settings file:

**Location**: `~/.claude/settings.json` (global) or `.claude/settings.json` in your project

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

For the full configuration with all supported hooks, see [docs/hooks-setup.md](docs/hooks-setup.md).

### Step 3: Start Using

1. Launch Vibe Island - it appears as a small bar at the top of your screen
2. Start a Claude Code session - Vibe Island automatically shows the session state
3. Click the overlay to expand and see all active sessions

## Usage Guide

### Overlay States

| State | Description |
|-------|-------------|
| **Idle** | No active agent sessions |
| **Running** | Agent is executing a tool |
| **Approval** | Agent is waiting for your approval |
| **Done** | Agent has finished a response |

### Interacting with the Overlay

- **Click the bar**: Expand to see all sessions
- **Click a session**: Focus the corresponding terminal window
- **Click outside**: Collapse the overlay
- **Right-click tray icon**: Access menu (Show/Hide, Quit)

### Approval Flow

When Claude Code needs permission to execute a tool (e.g., Bash commands):

1. The overlay expands automatically
2. A panel shows the tool name and details
3. Click **Approve** or **Reject**
4. The decision is sent back to Claude Code

### System Tray

Vibe Island runs in the system tray when minimized:
- **Left-click**: Show the overlay
- **Right-click**: Open menu
  - Show/Hide Overlay
  - Quit

## Hook Events

| Event | When Triggered | Overlay State |
|-------|----------------|---------------|
| `PreToolUse` | Claude executes a tool (Write, Edit, Bash, etc.) | `running` |
| `Notification` | Claude needs user attention (approval, error) | `approval` or current |
| `Stop` | Claude finishes a response | `done` |
| `SessionStart` | New Claude session begins | Shows session label |
| `PermissionRequest` | Claude needs permission | Blocks until response |

See [docs/hooks-setup.md](docs/hooks-setup.md) for the complete hook configuration.

## Troubleshooting

### Sessions not appearing

1. Ensure Vibe Island is running (check system tray icon)
2. Verify the hooks configuration in `.claude/settings.json`
3. Check that port 7878 is not blocked by firewall
4. Restart Claude Code after updating settings

### Overlay not visible

1. Check if the overlay is hidden (right-click tray icon > Show Overlay)
2. Try moving your mouse to the top of the screen
3. Check if another always-on-top app is conflicting

### Port 7878 already in use

1. Check what's using the port: `netstat -ano | findstr :7878`
2. Close the conflicting application
3. Or modify the port in `hook_server.rs` and rebuild

## Development

### Prerequisites

- Rust 1.77+
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
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── hook_server.rs  # HTTP server for Claude Code hooks
│   │   ├── pipe_server.rs  # Named pipe for SDK fallback
│   │   ├── process_watcher.rs  # Process detection
│   │   ├── overlay.rs      # Win32 overlay window management
│   │   └── lib.rs          # Tauri app setup
│   └── tauri.conf.json     # Tauri configuration
├── frontend/               # React frontend
│   └── src/
│       ├── components/     # Overlay UI components
│       ├── hooks/          # Event listeners
│       └── store/          # Zustand state management
└── docs/                   # Documentation
```

## Version History

### v0.1.0 (Current)

- Initial release
- Claude Code HTTP hooks integration
- Multi-session support
- Approval flow for tool execution
- Click-through toggle
- System tray support

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

- **Issues**: [GitHub Issues](https://github.com/vibeisland/vibe-island/issues)
- **Discussions**: [GitHub Discussions](https://github.com/vibeisland/vibe-island/discussions)
