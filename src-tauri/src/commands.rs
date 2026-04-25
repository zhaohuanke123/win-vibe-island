use crate::overlay::{self, OverlayConfig};
use crate::events::{self, SessionStart, StateChange, SessionEnd};
use crate::mock::{self, DemoConfig};
use crate::pipe_server;
use crate::process_watcher;
use crate::window_focus::{self, FocusResult};
use tauri::AppHandle;
use serde::Serialize;

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

#[tauri::command]
pub fn toggle_demo_mode(app: AppHandle, start: bool) -> Result<(), String> {
    if start {
        mock::start_demo_mode(app)
    } else {
        mock::stop_demo_mode()
    }
}

#[tauri::command]
pub fn set_demo_config(config: DemoConfig) -> Result<(), String> {
    mock::set_demo_config(config)
}

#[derive(Debug, Clone, Serialize)]
pub struct DemoStatus {
    pub running: bool,
    pub config: DemoConfig,
}

#[tauri::command]
pub fn get_demo_config_status() -> DemoStatus {
    DemoStatus {
        running: mock::is_demo_running(),
        config: mock::get_demo_config(),
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
/// The response is emitted as an event that can be listened to by the agent process.
#[tauri::command]
pub fn submit_approval_response(
    app: AppHandle,
    session_id: String,
    approved: bool,
) -> Result<(), String> {
    events::emit_approval_response(&app, events::ApprovalResponse {
        session_id,
        approved,
    })
}