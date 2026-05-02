# Claude Code Hooks Configuration

Vibe Island integrates with Claude Code through HTTP Hooks. The app starts a local server on `http://localhost:7878` and can automatically install the required hook configuration.

---

## Automatic Configuration

Default behavior is `auto` mode:

1. On startup, Vibe Island checks Claude Code settings.
2. If required hooks are missing, it merges Vibe Island hooks into `settings.json`.
3. Existing user hooks that do not point to Vibe Island are preserved.
4. A backup is created before writing: `settings.json.vibe-island-backup`.

Configuration modes:

| Mode | Serialized Value | Behavior |
|------|------------------|----------|
| Auto | `auto` | Install hooks on startup, keep them on exit |
| Auto-cleanup | `autoCleanup` | Install hooks on startup, remove them when quitting from tray |
| Manual | `manual` | Do not auto-install hooks |

Settings path resolution:

1. Existing user-level `~/.claude/settings.json`
2. Existing project-level `.claude/settings.json`
3. New user-level `~/.claude/settings.json`

Tray actions:

- `Hooks -> Hook Config Mode`
- `Hooks -> Install Hooks`
- `Hooks -> Remove Hooks`

---

## Manual Configuration

If you use `manual` mode, add this to Claude Code settings:

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

This matches the current generated config in `src-tauri/src/hook_config.rs` and [docs/claude-settings.example.json](claude-settings.example.json).

---

## Event Behavior

| Hook | Payload Fields Used | Vibe Island Behavior |
|------|---------------------|----------------------|
| `SessionStart` | `session_id`, `cwd`, `source`, `model`, `agent_type` | Creates/updates a session and sets it to `idle` |
| `PreToolUse` | `session_id`, `cwd`, `tool_name`, `tool_input` | Ensures session exists, sets `thinking`, emits `tool_use` |
| `PostToolUse` | `session_id`, `tool_name`, `tool_response`, `duration_ms` | Emits `tool_complete`, sets `streaming` |
| `Notification` | `session_id`, `notification_type`, `message` | `permission_prompt` sets `approval`, `idle_prompt` sets `idle` |
| `Stop` | `session_id`, `reason` | Sets `done` |
| `UserPromptSubmit` | `session_id`, `prompt` | Sets `running` |
| `PermissionRequest` | `session_id`, `tool_name`, `tool_input`, `tool_use_id`, `permission_suggestions` | Shows approval UI and waits for user decision |

The backend also has implemented routes for:

- `POST /hooks/post-tool-use-failure`
- `POST /hooks/ping`
- `GET /hooks/health`

These routes are available in the server, but `PostToolUseFailure` and `ping` are not part of the current auto-installed required hook list.

---

## PermissionRequest Response

The current implementation returns the Claude Code-specific wrapper format:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

For rejection:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny"
    }
  }
}
```

The backend waits up to 120 seconds for a frontend response, while the generated Claude Code hook timeout is 60 seconds. For manual configs, use a timeout that gives enough time for human approval.

---

## Session Tracking

Vibe Island tracks each Claude Code conversation by `session_id`.

Fallback order:

1. `session_id`
2. `transcript_path`
3. generated `unknown-<timestamp>`

Session labels are generated from the last segment of `cwd`; if `cwd` is missing, the UI shows `Claude Code`.

---

## Health Check

The overlay health indicator polls:

```text
GET http://localhost:7878/hooks/health
```

Response fields:

| Field | Meaning |
|-------|---------|
| `state` | `connected`, `disconnected`, or `error` |
| `port` | Hook server port |
| `lastHeartbeat` | Last `/hooks/ping` timestamp, if any |
| `uptimeSecs` | Server uptime |
| `totalRequests` | Total hook requests received |
| `errorCount` | Backend hook error count |
| `pendingApprovals` | Number of pending PermissionRequest approvals |

---

## Troubleshooting

### Sessions Not Appearing

- Confirm Vibe Island is running.
- Run `Hooks -> Install Hooks` from the tray menu.
- Restart Claude Code after changing settings.
- Open `http://localhost:7878/hooks/health` to confirm the server is reachable.
- Check that another process is not using port 7878.

### All Sessions Look Mixed Together

Use the current hook config with `SessionStart` and `UserPromptSubmit`. The implementation tracks sessions by `session_id`; old configs that only post tool hooks may not provide enough lifecycle data.

### Approval Does Not Continue Claude Code

- Confirm `PermissionRequest` is configured.
- Confirm the endpoint is `/hooks/permission-request`.
- Ensure hook timeout is high enough.
- The response must use `hookSpecificOutput`, not a bare `decision` object.

### User Hooks Were Not Replaced

This is intentional. If a hook event already has a non-Vibe Island configuration, `install_hooks` skips that hook instead of overwriting user settings.
