# Claude Code Hooks Configuration

To integrate Vibe Island with Claude Code, add the following to your `.claude/settings.json`:

## Configuration

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

## Hook Events

### PreToolUse
Triggered before Claude executes any tool (Write, Edit, Bash, etc.).

**Use case**: Shows when Claude is actively working on a task.

### Notification
Triggered when Claude needs user attention (e.g., approval required, errors).

**Use case**: Displays approval requests in the overlay.

### Stop
Triggered when Claude finishes a response.

**Use case**: Marks the session as complete.

## How It Works

1. Vibe Island starts an HTTP server on port 7878
2. Claude Code sends hook events as POST requests
3. Vibe Island converts these to UI updates in the overlay

## No SDK Required

Unlike other integration approaches, this method requires no additional npm packages or Python modules. Just add the configuration and Vibe Island will automatically display your Claude Code sessions.
