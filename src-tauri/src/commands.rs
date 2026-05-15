use crate::events::{self, SessionEnd, SessionStart, StateChange};
use crate::hook_config;
use crate::hook_server;
use crate::overlay::{self, DpiScale, OverlayConfig};
use crate::pipe_server;
use crate::process_watcher;
use crate::session_store;
use crate::window_focus::{self, FocusResult};
use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size, WebviewWindow};

#[cfg(target_os = "windows")]
fn apply_window_round_region(window: &WebviewWindow, radius: u32, phys_w: u32, phys_h: u32) -> Result<(), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};

    static LAST_REGION_KEY: AtomicU64 = AtomicU64::new(0);
    let key = ((phys_w as u64) << 32) | ((phys_h as u64) << 16) | (radius as u64);
    if key == LAST_REGION_KEY.load(Ordering::Relaxed) {
        return Ok(());
    }

    let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd = HWND(hwnd_raw.0 as *mut _);
    let scale = window.scale_factor().unwrap_or(1.0);
    let radius_px = ((radius as f64 * scale).round() as i32).max(1);

    unsafe {
        let region = CreateRoundRectRgn(
            0,
            0,
            phys_w as i32 + 1,
            phys_h as i32 + 1,
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

    LAST_REGION_KEY.store(key, Ordering::Relaxed);
    Ok(())
}

fn effective_window_scale_factor(window: &WebviewWindow) -> Result<f64, String> {
    let tauri_scale = window.scale_factor().unwrap_or(1.0);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;

        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(hwnd_raw.0 as *mut _);
        let hwnd_scale = overlay::get_dpi_scale_for_window(hwnd).unwrap_or(1.0);
        return Ok(hwnd_scale.max(tauri_scale).max(1.0));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(tauri_scale.max(1.0))
    }
}

fn resize_scale_factor(
    window: &WebviewWindow,
    webview_scale_factor: Option<f64>,
) -> Result<f64, String> {
    let backend_scale = effective_window_scale_factor(window)?;
    let frontend_scale = webview_scale_factor
        .filter(|scale| scale.is_finite() && *scale >= 1.0)
        .unwrap_or(1.0);

    Ok(backend_scale.max(frontend_scale).max(1.0))
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
/// When `interactive` is true, removes WS_EX_TRANSPARENT and brings the window to the foreground
/// so it receives WM_MOUSEWHEEL and other input messages.
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
            let ws_ex_transparent_bit = WS_EX_TRANSPARENT.0 as isize;
            let has_transparent = (ex_style & ws_ex_transparent_bit) != 0;
            log::info!(
                "[set_window_interactive] interactive={}, WS_EX_TRANSPARENT={} (ex_style=0x{:X})",
                interactive,
                has_transparent,
                ex_style
            );

            let new_style = if interactive {
                ex_style & !ws_ex_transparent_bit
            } else {
                ex_style | ws_ex_transparent_bit
            };
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);

            let verify_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let verify_transparent = (verify_style & ws_ex_transparent_bit) != 0;
            log::info!(
                "[set_window_interactive] after: WS_EX_TRANSPARENT={} (ex_style=0x{:X})",
                verify_transparent,
                verify_style
            );

            if interactive {
                let _ = SetForegroundWindow(hwnd);
                log::info!("[set_window_interactive] called SetForegroundWindow");
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, interactive);
        Ok(())
    }
}

/// Set the main window size and optionally re-center it horizontally at the top of the screen.
/// Uses physical pixel sizing with DPI-aware scaling to ensure the WebView viewport
/// matches the requested CSS pixel dimensions on high-DPI displays.
/// Returns the actual logical (CSS) size achieved after resizing.
#[tauri::command]
pub fn set_window_size(
    window: WebviewWindow,
    width: u32,
    height: u32,
    skip_center: Option<bool>,
) -> Result<(u32, u32), String> {
    let dpi_scale = effective_window_scale_factor(&window)?;

    let physical_width = ((width as f64) * dpi_scale).round() as u32;
    let physical_height = ((height as f64) * dpi_scale).round() as u32;

    // For borderless transparent windows, set size directly without decoration compensation.
    // The window has no decorations (decorations: false), so outer size should equal inner size.
    use tauri::PhysicalSize;
    window
        .set_size(Size::Physical(PhysicalSize {
            width: physical_width,
            height: physical_height,
        }))
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        let radius = if height <= 80 { height / 2 } else { 18 };
        let _ = apply_window_round_region(&window, radius, physical_width, physical_height);
    }

    // Re-center horizontally at top of screen
    if skip_center != Some(true) {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_width_physical = monitor.size().width as f64;
            let screen_center_x = screen_width_physical / 2.0;
            let x = (screen_center_x - physical_width as f64 / 2.0) as i32;
            use tauri::PhysicalPosition;
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
                x,
                y: (8.0 * dpi_scale).round() as i32,
            }));
        }
    }

    // Return actual logical (CSS pixel) size for frontend verification
    let actual = window.inner_size().map_err(|e| e.to_string())?;
    let actual_logical = LogicalSize {
        width: actual.width as f64 / dpi_scale,
        height: actual.height as f64 / dpi_scale,
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
///
/// The frontend sends CSS pixel dimensions. On high-DPI displays (144 DPI = 1.5x),
/// Tauri's `set_size(Size::Logical(...))` may not apply DPI scaling correctly with
/// `SetProcessDpiAwarenessContext(PMv2)`. We read the actual monitor DPI from the
/// window HWND and convert to physical pixels to ensure the WebView viewport
/// matches the requested CSS dimensions.
#[tauri::command]
pub fn update_overlay_size(
    window: WebviewWindow,
    width: u32,
    height: u32,
    webview_scale_factor: Option<f64>,
    border_radius: Option<u32>,
    anchor_center: Option<bool>,
) -> Result<(), String> {
    let dpi_scale = resize_scale_factor(&window, webview_scale_factor)?;

    let physical_width = ((width as f64) * dpi_scale).round() as u32;
    let physical_height = ((height as f64) * dpi_scale).round() as u32;

    log::trace!(
        "update_overlay_size: CSS({}x{}) DPI({}) -> Physical({}x{})",
        width,
        height,
        dpi_scale,
        physical_width,
        physical_height,
    );

    let target_x: Option<i32> = if anchor_center.unwrap_or(false) {
        use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};

        static CACHED_CENTER_X: AtomicI32 = AtomicI32::new(0);
        static CACHED_WIDTH: AtomicU32 = AtomicU32::new(0);

        let cached_w = CACHED_WIDTH.load(Ordering::Relaxed);
        let center_x_physical = if cached_w == physical_width {
            CACHED_CENTER_X.load(Ordering::Relaxed)
        } else {
            let position = window.outer_position().map_err(|e| e.to_string())?;
            let current_size = window.outer_size().map_err(|e| e.to_string())?;
            let cx = position.x + (current_size.width as i32 / 2);
            CACHED_CENTER_X.store(cx, Ordering::Relaxed);
            CACHED_WIDTH.store(physical_width, Ordering::Relaxed);
            cx
        };

        let new_x = center_x_physical - (physical_width as i32 / 2);
        Some(new_x)
    } else {
        None
    };

    use tauri::PhysicalSize;
    window
        .set_size(Size::Physical(PhysicalSize {
            width: physical_width,
            height: physical_height,
        }))
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        let radius = border_radius.unwrap_or(if height <= 80 { height / 2 } else { 18 });
        apply_window_round_region(&window, radius, physical_width, physical_height)?;
    }

    if let Some(x) = target_x {
        use tauri::PhysicalPosition;
        window
            .set_position(tauri::Position::Physical(PhysicalPosition {
                x,
                y: (8.0 * dpi_scale).round() as i32,
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
    pub inner_width: u32,
    pub inner_height: u32,
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
    let inner_size = window.inner_size().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    let focused = window.is_focused().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    Ok(WindowGeometry {
        width: size.width,
        height: size.height,
        inner_width: inner_size.width,
        inner_height: inner_size.height,
        x: pos.x,
        y: pos.y,
        scale_factor: scale,
        is_visible: visible,
        is_focused: focused,
    })
}

// Session store commands
/// Save sessions to persistent storage (JSON string from frontend)
#[tauri::command]
pub fn save_sessions(sessions_json: String) -> Result<(), String> {
    session_store::save_sessions(sessions_json)
}

/// Load sessions from persistent storage (returns JSON string)
#[tauri::command]
pub fn load_sessions() -> Result<String, String> {
    session_store::load_sessions()
}

/// Get the session store file path (for debugging)
#[tauri::command]
pub fn get_session_store_path() -> String {
    session_store::get_session_path_info()
}

#[tauri::command]
pub fn analyze_command(command: String) -> crate::command_analyzer::CommandAnalysis {
    crate::command_analyzer::analyze_command(&command)
}

#[tauri::command]
pub fn flash_taskbar(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}
