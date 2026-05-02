use crate::overlay::{self, OverlayConfig, DpiScale};
use crate::events::{self, SessionStart, StateChange, SessionEnd};
use crate::pipe_server;
use crate::process_watcher;
use crate::window_focus::{self, FocusResult};
use crate::hook_server;
use tauri::{AppHandle, WebviewWindow, Size, LogicalSize};

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
pub fn update_overlay(hwnd_str: String, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
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
    let addr = s.trim_start_matches("HWND(").trim_end_matches(')').parse::<isize>().map_err(|e| e.to_string())?;
    Ok(windows::Win32::Foundation::HWND(addr as *mut _))
}

#[tauri::command]
pub fn emit_test_event(app: AppHandle, event_type: String, session_id: String) -> Result<(), String> {
    match event_type.as_str() {
        "session_start" => {
            events::emit_session_start(&app, SessionStart {
                session_id,
                label: "Test Session".to_string(),
                pid: Some(12345),
            })
        }
        "state_change" => {
            events::emit_state_change(&app, StateChange {
                session_id,
                state: "running".to_string(),
            })
        }
        "session_end" => {
            events::emit_session_end(&app, SessionEnd { session_id })
        }
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
#[tauri::command]
pub fn submit_approval_response(
    tool_use_id: String,
    approved: bool,
) -> Result<(), String> {
    hook_server::submit_approval_response(&tool_use_id, approved)
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
        use windows::Win32::UI::WindowsAndMessaging::*;
        use windows::Win32::Foundation::HWND;

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
pub fn set_window_size(window: WebviewWindow, width: u32, height: u32, skip_center: Option<bool>) -> Result<(u32, u32), String> {
    let target_logical = LogicalSize { width: width as f64, height: height as f64 };

    // Get current outer/inner size difference (decorations, DPI adjustments, etc.)
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let dw = outer.width as f64 - inner.width as f64;
    let dh = outer.height as f64 - inner.height as f64;
    let scale = window.scale_factor().unwrap_or(1.0);

    // Compensate: set outer size = desired inner size + delta
    let adjusted = LogicalSize {
        width: target_logical.width + dw / scale,
        height: target_logical.height + dh / scale,
    };
    window
        .set_size(Size::Logical(adjusted))
        .map_err(|e| e.to_string())?;

    // Re-center horizontally at top of screen
    if skip_center != Some(true) {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_width = monitor.size().width as f64 / monitor.scale_factor();
            let x = ((screen_width - width as f64) / 2.0) as i32;
            let _ = window.set_position(tauri::Position::Logical(
                tauri::LogicalPosition { x: x as f64, y: 8.0 }
            ));
        }
    }

    // Return actual inner size for frontend verification
    let actual = window.inner_size().map_err(|e| e.to_string())?;
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
/// Unlike `set_window_size`, this only changes size without re-centering.
#[tauri::command]
pub fn update_overlay_size(window: WebviewWindow, width: u32, height: u32) -> Result<(), String> {
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

    let target_logical = LogicalSize { width: width as f64, height: height as f64 };
    let scale = window.scale_factor().unwrap_or(1.0);

    // Compensate for window decorations
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let dw = outer.width as f64 - inner.width as f64;
    let dh = outer.height as f64 - inner.height as f64;

    let adjusted = LogicalSize {
        width: target_logical.width + dw / scale,
        height: target_logical.height + dh / scale,
    };
    window
        .set_size(Size::Logical(adjusted))
        .map_err(|e| e.to_string())?;

    Ok(())
}