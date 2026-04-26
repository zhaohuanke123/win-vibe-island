# Changelog

All notable changes to Vibe Island will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-26

### Added
- Initial release
- Floating overlay window at top of screen (Dynamic Island style)
- Claude Code HTTP hooks integration on port 7878
- Multi-session tracking with session ID support
- Real-time state display (idle, running, approval, done)
- Tool execution approval flow with approve/reject buttons
- Click-through mode toggle for overlay interaction
- System tray icon with context menu
- Session labels derived from project working directory
- Focus session terminal window on click
- Win32 overlay window management with transparency
- DPI awareness for high-DPI displays
- NSIS installer with multi-language support
- MSI installer for enterprise deployment

### Hook Events Supported
- SessionStart - Creates new session entry
- PreToolUse - Shows running state with tool info
- PostToolUse - Clears tool info after completion
- Notification - Handles approval requests
- Stop - Marks session as done
- UserPromptSubmit - Marks session as running
- PermissionRequest - Interactive approval flow

### Technical Details
- Built with Tauri 2.0 (Rust backend + React frontend)
- Win32 API for overlay window management
- Axum HTTP server for hooks
- Zustand for state management
- TypeScript for frontend

---

## Release Notes Template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Deprecated
- Features to be removed

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security improvements
```
