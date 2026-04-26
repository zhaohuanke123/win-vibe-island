# Claude Code Hooks Configuration

To integrate Vibe Island with Claude Code, add the following to your `.claude/settings.json`:

## Configuration

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/session-start"
          }
        ]
      }
    ],
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
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/post-tool-use"
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
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/user-prompt-submit"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:7878/hooks/permission-request",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Hook Events

### SessionStart
Triggered when a new Claude Code session begins or resumes.

**Payload includes**: `session_id`, `cwd`, `source` (startup/resume/clear/compact), `model`

**Use case**: Creates a new session entry in the overlay with the project name as label.

### PreToolUse
Triggered before Claude executes any tool (Write, Edit, Bash, etc.).

**Payload includes**: `session_id`, `tool_name`, `tool_input`

**Use case**: Shows when Claude is actively working, displays tool name and file path.

### PostToolUse
Triggered after a tool completes.

**Payload includes**: `session_id`, `tool_name`, `tool_response`, `duration_ms`

**Use case**: Clears tool info, tracks tool completion.

### Notification
Triggered when Claude needs user attention (e.g., permission prompt, idle).

**Payload includes**: `session_id`, `notification_type`, `message`

**Use case**: Displays approval requests, shows idle state.

### Stop
Triggered when Claude finishes a response.

**Payload includes**: `session_id`, `reason`

**Use case**: Marks the session as done/idle.

### UserPromptSubmit
Triggered when user submits a prompt.

**Payload includes**: `session_id`, `prompt`

**Use case**: Marks session as running when user interacts.

### PermissionRequest
Triggered when Claude needs permission to execute a tool (e.g., Bash commands, Write operations).

**Payload includes**: `session_id`, `tool_name`, `tool_input`, `tool_use_id`, `permission_suggestions`

**Response**: The hook handler blocks until the user approves or rejects the request from the overlay UI, then returns a decision:
```json
{
  "decision": {
    "behavior": "allow" | "deny",
    "message": "optional message",
    "updatedInput": { /* optional modified input */ }
  }
}
```

**Use case**: Provides real approval flow - the overlay displays the request with action details and risk level, and the user can approve or reject from the UI. The tool execution is blocked until the user responds or a 30-second timeout expires.

**Important**: Set a higher timeout (e.g., 60 seconds) for this hook since it waits for user interaction.

## Session Tracking

Each Claude Code terminal/window is tracked as a separate session using the `session_id` field provided by Claude Code hooks. This allows you to:

- See multiple Claude Code instances simultaneously
- Track which project each session is working on (from `cwd`)
- Click a session to focus its terminal window

## How It Works

1. Vibe Island starts an HTTP server on port 7878
2. Claude Code sends hook events as POST requests
3. Vibe Island extracts `session_id` to track each conversation separately
4. The overlay displays each session with its project name and current state

## No SDK Required

Unlike other integration approaches, this method requires no additional npm packages or Python modules. Just add the configuration and Vibe Island will automatically display your Claude Code sessions.

## Troubleshooting

### Sessions not appearing
- Ensure Vibe Island is running (check system tray)
- Verify port 7878 is not blocked by firewall
- Check Claude Code settings.json location: `~/.claude/settings.json` or `.claude/settings.json`

### All sessions mixed together
- This was a bug in earlier versions - ensure you have the latest version
- Each session should now be tracked by `session_id`

### Session labels not showing project name
- The label is extracted from `cwd` field in SessionStart hook
- Ensure SessionStart hook is configured