# Codex CLI Hooks Configuration

Vibe Island integrates with Codex CLI through command hooks. Codex runs the
small `vibe-island-hooks.exe` helper, the helper forwards hook payloads to the
running Tauri app through `\\.\pipe\VibeIsland`, and the overlay renders Codex
sessions with the normal session reducer.

## Default Scope

The default Codex install tracks lifecycle plus lightweight tool activity:

| Hook | Matcher | Behavior |
|------|---------|----------|
| `SessionStart` | `startup\|resume\|clear\|compact` | Creates or refreshes a Codex session |
| `UserPromptSubmit` | none | Shows the current user prompt as the session title |
| `PreToolUse` | `*` | Marks the session running and shows the current tool |
| `PostToolUse` | `*` | Records the completed tool in the session history |
| `Stop` | none | Marks the session completed |

`PermissionRequest` is not installed by default, so Codex approval flow stays
under Codex's own control in this version.

## Automatic Configuration

Use the Control Center Hooks tab or tray hook actions to install Codex hooks.
The installer writes user-level Codex config:

```text
~/.codex/hooks.json
```

Before writing, Vibe Island creates a timestamped backup next to the file. The
merge strategy is non-destructive:

- Missing Vibe Island hook groups are added.
- Existing Vibe Island hook groups are refreshed.
- User hook groups that do not point to `vibe-island-hooks.exe` are preserved.
- Uninstall removes only Vibe Island hook groups.

## Manual Configuration

If you manage Codex hooks manually, add the same command hook groups to
`~/.codex/hooks.json`. Replace the command path with the deployed helper path
shown in Control Center:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/you/AppData/Roaming/vibe-island/bin/vibe-island-hooks.exe --source codex",
            "timeout": 3
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/you/AppData/Roaming/vibe-island/bin/vibe-island-hooks.exe --source codex",
            "timeout": 3
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/you/AppData/Roaming/vibe-island/bin/vibe-island-hooks.exe --source codex",
            "timeout": 3
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/you/AppData/Roaming/vibe-island/bin/vibe-island-hooks.exe --source codex",
            "timeout": 3
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/you/AppData/Roaming/vibe-island/bin/vibe-island-hooks.exe --source codex",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

Codex owns hook trust. After installing new command hooks, review and trust them
inside Codex with `/hooks`.

## Failure Behavior

The helper is fail-open. If Vibe Island is not running, the helper exits with a
valid JSON continuation payload and Codex continues normally.

## Troubleshooting

- Confirm Vibe Island is running so `\\.\pipe\VibeIsland` exists.
- Confirm `~/.codex/hooks.json` contains the five default hook events.
- Confirm each command includes `--source codex`; otherwise sessions may appear
  as Claude Code.
- In Codex, run `/hooks` and trust the Vibe Island command hooks.
