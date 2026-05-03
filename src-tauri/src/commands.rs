use crate::events::{self, SessionEnd, SessionStart, StateChange};
use crate::hook_config;
use crate::hook_server;
use crate::overlay::{self, DpiScale, OverlayConfig};
use crate::pipe_server;
use crate::process_watcher;
use crate::window_focus::{self, FocusResult};
use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalSize, Size, WebviewWindow};

#[cfg(target_os = "windows")]
fn apply_window_round_region(window: &WebviewWindow, radius: u32) -> Result<(), String> {
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};

    let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd = HWND(hwnd_raw.0 as *mut _);
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let radius_px = ((radius as f64 * scale).round() as i32).max(1);

    unsafe {
        let region = CreateRoundRectRgn(
            0,
            0,
            size.width as i32 + 1,
            size.height as i32 + 1,
            radius_px * 2,
            radius_px * 2,
        );
        if region.is_invalid() {
            return Err("Failed to create rounded window region".to_string());
        }

        let result = SetWindowRgn(hwnd, region, BOOL(1));
        if result == 0 {
            let _ = DeleteObject(region);
            return Err("Failed to apply rounded window region".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn create_overlay(config: OverlayConfig) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = overlay::create_overlay_window(&config)?;
        Ok(format!("{:?}", hwnd))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = config;
        overlay::create_overlay_window(&OverlayConfig::default())?;
        Ok("unsupported".into())
    }
}

#[tauri::command]
pub fn set_overlay_interactive(hwnd_str: String, interactive: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd: windows::Win32::Foundation::HWND = parse_hwnd(&hwnd_str)?;
        overlay::set_interactive(hwnd, interactive)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_str, interactive);
        overlay::set_interactive(false)
    }
}

#[tauri::command]
pub fn update_overlay(
    hwnd_str: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd: windows::Win32::Foundation::HWND = parse_hwnd(&hwnd_str)?;
        overlay::update_overlay_position(hwnd, x, y, width, height)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_str, x, y, width, height);
        overlay::update_overlay_position(0, 0, 0, 0)
    }
}

#[tauri::command]
pub fn destroy_overlay(hwnd_str: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd: windows::Win32::Foundation::HWND = parse_hwnd(&hwnd_str)?;
        overlay::destroy_overlay(hwnd)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = hwnd_str;
        overlay::destroy_overlay()
    }
}

#[cfg(target_os = "windows")]
fn parse_hwnd(s: &str) -> Result<windows::Win32::Foundation::HWND, String> {
    let addr = s
        .trim_start_matches("HWND(")
        .trim_end_matches(')')
        .parse::<isize>()
        .map_err(|e| e.to_string())?;
    Ok(windows::Win32::Foundation::HWND(addr as *mut _))
}

#[tauri::command]
pub fn emit_test_event(
    app: AppHandle,
    event_type: String,
    session_id: String,
) -> Result<(), String> {
    match event_type.as_str() {
        "session_start" => events::emit_session_start(
            &app,
            SessionStart {
                session_id,
                label: "Test Session".to_string(),
                pid: Some(12345),
            },
        ),
        "state_change" => events::emit_state_change(
            &app,
            StateChange {
                session_id,
                state: "running".to_string(),
            },
        ),
        "session_end" => events::emit_session_end(&app, SessionEnd { session_id }),
        _ => Err(format!("Unknown event type: {}", event_type)),
    }
}

// Pipe server commands
#[tauri::command]
pub fn get_pipe_server_status() -> pipe_server::PipeServerStatus {
    pipe_server::get_pipe_server_status()
}

#[tauri::command]
pub fn start_pipe_server(app: AppHandle) -> Result<(), String> {
    pipe_server::start_pipe_server(app)
}

#[tauri::command]
pub fn stop_pipe_server() -> Result<(), String> {
    pipe_server::stop_pipe_server()
}

// Window focus command
/// Focus the window belonging to the session with the given PID.
///
/// This brings the agent's terminal/editor window to the foreground.
/// Returns the result indicating success, flash-only (focus blocked), or not found.
#[tauri::command]
pub fn focus_session_window(session_pid: u32) -> FocusResult {
    window_focus::focus_window_by_pid(session_pid)
}

// Process watcher commands
#[tauri::command]
pub fn start_process_watcher(app: AppHandle) -> Result<(), String> {
    process_watcher::start_process_watcher(app)
}

#[tauri::command]
pub fn stop_process_watcher() -> Result<(), String> {
    process_watcher::stop_process_watcher()
}

#[tauri::command]
pub fn get_process_watcher_status() -> process_watcher::ProcessWatcherStatus {
    process_watcher::get_process_watcher_status()
}

#[tauri::command]
pub fn get_detected_processes() -> Vec<process_watcher::ProcessInfo> {
    process_watcher::get_detected_processes()
}

#[tauri::command]
pub fn set_process_watcher_config(
    config: process_watcher::ProcessWatcherConfig,
) -> Result<(), String> {
    process_watcher::set_process_watcher_config(config)
}

// Approval response command
/// Submit an approval response for a pending approval request.
///
/// This is called from the frontend when the user approves or rejects an action.
/// The response is sent to the waiting PermissionRequest handler.
///
/// For AskUserQuestion, pass answers as Some(json) containing the user's selections.
/// For regular approvals, pass None for answers.
#[tauri::command]
pub fn submit_approval_response(
    tool_use_id: String,
    approved: bool,
    answers: Option<serde_json::Value>,
) -> Result<(), String> {
    hook_server::submit_approval_response(&tool_use_id, approved, answers)
}

// DPI-related commands
/// Get the DPI scale factor for a window
#[tauri::command]
pub fn get_dpi_scale(hwnd_str: String) -> Result<DpiScale, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd: windows::Win32::Foundation::HWND = parse_hwnd(&hwnd_str)?;
        overlay::get_dpi_scale_for_window(hwnd)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = hwnd_str;
        overlay::get_dpi_scale_for_window()
    }
}

/// Get the DPI scale factor for the monitor at a specific point
#[tauri::command]
pub fn get_dpi_scale_at_position(x: i32, y: i32) -> DpiScale {
    overlay::get_dpi_scale_at_point(x, y)
}

/// Update overlay position with explicit DPI scale
#[tauri::command]
pub fn update_overlay_with_dpi(
    hwnd_str: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    dpi_scale: DpiScale,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd: windows::Win32::Foundation::HWND = parse_hwnd(&hwnd_str)?;
        overlay::update_overlay_position_with_dpi(hwnd, x, y, width, height, dpi_scale)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd_str, x, y, width, height, dpi_scale);
        overlay::update_overlay_position_with_dpi(0, 0, 0, 0, 1.0)
    }
}

/// Enable DPI awareness for the application (should be called at startup)
#[tauri::command]
pub fn enable_dpi_awareness() -> Result<(), String> {
    overlay::enable_dpi_awareness()
}

/// Set whether the main Tauri window is interactive (receives mouse clicks) or click-through.
/// When `interactive` is false, adds WS_EX_TRANSPARENT to allow clicks to pass through.
#[tauri::command]
pub fn set_window_interactive(window: WebviewWindow, interactive: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::*;

        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(hwnd_raw.0 as *mut _);

        unsafe {
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new_style = if interactive {
                ex_style & !(WS_EX_TRANSPARENT.0 as isize)
            } else {
                ex_style | (WS_EX_TRANSPARENT.0 as isize)
            };
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, interactive);
        Ok(())
    }
}

/// Set the main window size and optionally re-center it horizontally at the top of the screen
/// Set the window content area (inner size) to match the desired CSS pixel dimensions.
/// Returns the actual inner size achieved after resizing.
#[tauri::command]
pub fn set_window_size(
    window: WebviewWindow,
    width: u32,
    height: u32,
    skip_center: Option<bool>,
) -> Result<(u32, u32), String> {
    let target_logical = LogicalSize {
        width: width as f64,
        height: height as f64,
    };

    // For borderless transparent windows, set size directly without decoration compensation.
    // The window has no decorations (decorations: false), so outer size should equal inner size.
    // Previously we tried to compensate for dw/dh, but this caused width issues when sessions
    // started due to measurement noise or DPI scaling quirks.
    window
        .set_size(Size::Logical(target_logical))
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        let radius = if height <= 80 { height / 2 } else { 18 };
        let _ = apply_window_round_region(&window, radius);
    }

    // Re-center horizontally at top of screen
    if skip_center != Some(true) {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_width = monitor.size().width as f64 / monitor.scale_factor();
            let x = ((screen_width - width as f64) / 2.0) as i32;
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: x as f64,
                y: 8.0,
            }));
        }
    }

    // Return actual inner size for frontend verification
    let actual = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let actual_logical = LogicalSize {
        width: actual.width as f64 / scale,
        height: actual.height as f64 / scale,
    };
    Ok((actual_logical.width as u32, actual_logical.height as u32))
}

// Hook server commands
/// Get the status of the HTTP hook server
#[tauri::command]
pub fn get_hook_server_status() -> hook_server::HookServerStatus {
    hook_server::get_hook_server_status()
}

/// Start the HTTP hook server
#[tauri::command]
pub fn start_hook_server(app: AppHandle) -> Result<(), String> {
    hook_server::start_hook_server(app)
}

/// Stop the HTTP hook server
#[tauri::command]
pub fn stop_hook_server() -> Result<(), String> {
    hook_server::stop_hook_server()
}

/// Get hook server health status
#[tauri::command]
pub fn get_hook_health() -> hook_server::HookHealthStatus {
    hook_server::get_hook_health()
}

/// Get hook server error logs
#[tauri::command]
pub fn get_hook_errors(limit: Option<usize>) -> Vec<hook_server::HookErrorLog> {
    hook_server::get_hook_errors(limit.unwrap_or(50))
}

/// Clear hook server error logs
#[tauri::command]
pub fn clear_hook_errors() {
    hook_server::clear_hook_errors()
}

/// Lightweight resize for animation sync. Throttled to ~16ms intervals.
/// Unlike `set_window_size`, this does not recenter on the monitor unless
/// `anchor_center` is true, in which case it preserves the current center x.
#[tauri::command]
pub fn update_overlay_size(
    window: WebviewWindow,
    width: u32,
    height: u32,
    border_radius: Option<u32>,
    anchor_center: Option<bool>,
) -> Result<(), String> {
    use std::sync::atomic::{AtomicI64, Ordering};
    use std::time::SystemTime;

    static LAST_RESIZE_MS: AtomicI64 = AtomicI64::new(0);
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let last = LAST_RESIZE_MS.load(Ordering::Relaxed);
    if now_ms - last < 16 {
        return Ok(());
    }
    LAST_RESIZE_MS.store(now_ms, Ordering::Relaxed);

    let target_logical = LogicalSize {
        width: width as f64,
        height: height as f64,
    };

    let target_x = if anchor_center.unwrap_or(false) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let current_size = window.outer_size().map_err(|e| e.to_string())?;
        let current_width = current_size.width as f64 / scale;
        let current_x = position.x as f64 / scale;
        let center_x = current_x + current_width / 2.0;
        Some(center_x - target_logical.width / 2.0)
    } else {
        None
    };

    window
        .set_size(Size::Logical(target_logical))
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        let radius = border_radius.unwrap_or(if height <= 80 { height / 2 } else { 18 });
        apply_window_round_region(&window, radius)?;
    }

    if let Some(x) = target_x {
        window
            .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x,
                y: 8.0,
            }))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// Hook configuration commands
/// Check if Claude Code hooks are configured
#[tauri::command]
pub fn check_hook_config() -> hook_config::HookConfigStatus {
    hook_config::check_hook_config()
}

/// Install Vibe Island hooks to Claude Code settings.json
#[tauri::command]
pub fn install_hooks() -> Result<String, String> {
    hook_config::install_hooks()
}

/// Uninstall Vibe Island hooks from Claude Code settings.json
#[tauri::command]
pub fn uninstall_hooks() -> Result<(), String> {
    hook_config::uninstall_hooks()
}

/// Get current hook configuration status
#[tauri::command]
pub fn get_hook_config_status() -> hook_config::HookConfigStatus {
    hook_config::check_hook_config()
}

/// Set hook configuration mode (persisted to config file)
#[tauri::command]
pub fn set_hook_config_mode(mode: hook_config::HookConfigMode) -> Result<(), String> {
    hook_config::set_stored_mode(mode)
}

/// Get hook configuration mode from persistent storage
#[tauri::command]
pub fn get_hook_config_mode() -> hook_config::HookConfigMode {
    hook_config::get_stored_mode()
}

// Audio commands
/// Play a notification sound
#[tauri::command]
pub fn play_notification_sound(sound: crate::audio::NotificationSound) -> Result<(), String> {
    crate::audio::play_sound(sound)
}

/// Get list of available notification sounds
#[tauri::command]
pub fn get_notification_sounds() -> Vec<(crate::audio::NotificationSound, String)> {
    crate::audio::get_sound_list()
}

// Configuration commands
/// Get the current application configuration
#[tauri::command]
pub fn get_app_config() -> crate::config::AppConfig {
    crate::config::get_config()
}

/// Update application configuration with partial updates
#[tauri::command]
pub fn update_app_config(updates: serde_json::Value) -> Result<crate::config::AppConfig, String> {
    crate::config::update_config(updates)
}

/// Reset configuration to defaults (optionally just a section)
#[tauri::command]
pub fn reset_app_config(section: Option<String>) -> Result<crate::config::AppConfig, String> {
    crate::config::reset_config(section.as_deref())
}

/// Reload configuration from file
#[tauri::command]
pub fn reload_app_config() -> Result<crate::config::AppConfig, String> {
    crate::config::reload_config()
}

// =============================================================================
// Test API Commands — only functional in debug builds
// =============================================================================

/// Simulate a session_start event — uses the same emit format as hook_server.rs
#[tauri::command]
pub fn simulate_session_start(
    app: AppHandle,
    session_id: String,
    label: String,
    cwd: Option<String>,
) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    app.emit("session_start", serde_json::json!({
        "session_id": session_id,
        "label": label,
        "cwd": cwd,
        "source": "test",
    }))
    .map_err(|e| e.to_string())
}

/// Simulate a permission_request event — uses the same emit format as hook_server.rs
#[tauri::command]
pub fn simulate_permission_request(
    app: AppHandle,
    session_id: String,
    tool_use_id: String,
    tool_name: String,
    tool_input: Option<serde_json::Value>,
    action: Option<String>,
    risk_level: Option<String>,
    approval_type: Option<String>,
) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    let tool_input_val = tool_input.unwrap_or(serde_json::json!({}));
    let risk = risk_level.unwrap_or_else(|| "medium".into());
    let atype = approval_type.unwrap_or_else(|| "permission".into());

    app.emit("permission_request", serde_json::json!({
        "session_id": session_id,
        "tool_use_id": tool_use_id,
        "tool_name": tool_name,
        "tool_input": tool_input_val,
        "approval_type": atype,
        "action": action.unwrap_or_default(),
        "risk_level": risk,
    }))
    .map_err(|e| e.to_string())
}

/// Simulate a state_change event
#[tauri::command]
pub fn simulate_state_change(
    app: AppHandle,
    session_id: String,
    state: String,
    tool_name: Option<String>,
    tool_input: Option<serde_json::Value>,
) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    app.emit("state_change", serde_json::json!({
        "session_id": session_id,
        "state": state,
        "tool_name": tool_name,
        "tool_input": tool_input,
    }))
    .map_err(|e| e.to_string())
}

/// Simulate a session_end event
#[tauri::command]
pub fn simulate_session_end(
    app: AppHandle,
    session_id: String,
) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    app.emit("session_end", serde_json::json!({
        "session_id": session_id,
    }))
    .map_err(|e| e.to_string())
}

/// Reset all test state — emits test_reset event for frontend to clear Zustand,
/// and clears Rust-side pending approvals.
#[tauri::command]
pub fn test_reset_sessions(app: AppHandle) -> Result<(), String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    app.emit("test_reset", serde_json::json!({}))
        .map_err(|e| e.to_string())
}

/// Window geometry for testing
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_visible: bool,
    pub is_focused: bool,
}

/// Get window geometry for testing
#[tauri::command]
pub fn get_window_geometry(window: WebviewWindow) -> Result<WindowGeometry, String> {
    #[cfg(not(debug_assertions))]
    return Err("Test commands disabled in release build".into());

    let size = window.outer_size().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    let focused = window.is_focused().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    Ok(WindowGeometry {
        width: size.width,
        height: size.height,
        x: pos.x,
        y: pos.y,
        scale_factor: scale,
        is_visible: visible,
        is_focused: focused,
    })
}
