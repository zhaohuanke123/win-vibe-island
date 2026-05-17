//! Window focus management for bringing agent terminal/editor windows to foreground.
//!
//! Implements a per-terminal strategy registry for precise jump-back:
//! - Windows Terminal: `wt -w 0 focus-tab --target <tab-id>`
//! - VS Code: `code -r <workspace-path>`
//! - Cursor: `cursor -r <workspace-path>`
//! - Fallback: PID → SetForegroundWindow + FlashWindowEx

use crate::agent_event::JumpTarget;
use serde::Serialize;
use std::time::Duration;

/// Result of a focus operation
#[derive(Debug, Clone, Serialize)]
pub enum FocusResult {
    Success,
    FlashOnly,
    NotFound,
    Restored,
    CommandFailed(String),
}

const STRATEGY_TIMEOUT: Duration = Duration::from_secs(5);

// ─── Strategy trait ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
trait FocusStrategy: Send + Sync {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult>;
}

// ─── Windows Terminal strategy ───────────────────────────────────────────────

#[cfg(target_os = "windows")]
struct WindowsTerminalStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for WindowsTerminalStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult> {
        if target.terminal_type.as_deref() != Some("windowsTerminal") {
            return None;
        }

        let tab_id = target.extra.as_ref()
            .and_then(|e| e.get("tabId"))
            .and_then(|v| v.as_str());

        let args = if let Some(id) = tab_id {
            format!("-w 0 focus-tab --target {}", id)
        } else {
            "-w 0 focus-tab".to_string()
        };

        match run_command_with_timeout("wt", &args, STRATEGY_TIMEOUT) {
            Ok(true) => Some(FocusResult::Success),
            Ok(false) => Some(FocusResult::CommandFailed("wt exited non-zero".into())),
            Err(e) => {
                log::warn!("Windows Terminal strategy failed: {}", e);
                Some(FocusResult::CommandFailed(e))
            }
        }
    }
}

// ─── VS Code strategy ────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
struct VsCodeStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for VsCodeStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult> {
        if target.terminal_type.as_deref() != Some("vscode") {
            return None;
        }

        let workspace = match target.workspace_path.as_deref() {
            Some(p) => p,
            None => return None,
        };

        match run_command_with_timeout("code", &format!("-r \"{}\"", workspace), STRATEGY_TIMEOUT) {
            Ok(true) => Some(FocusResult::Success),
            Ok(false) => Some(FocusResult::CommandFailed("code exited non-zero".into())),
            Err(e) => {
                log::warn!("VS Code strategy failed: {}", e);
                Some(FocusResult::CommandFailed(e))
            }
        }
    }
}

// ─── Cursor strategy ─────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
struct CursorStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for CursorStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult> {
        if target.terminal_type.as_deref() != Some("cursor") {
            return None;
        }

        let workspace = match target.workspace_path.as_deref() {
            Some(p) => p,
            None => return None,
        };

        match run_command_with_timeout("cursor", &format!("-r \"{}\"", workspace), STRATEGY_TIMEOUT) {
            Ok(true) => Some(FocusResult::Success),
            Ok(false) => Some(FocusResult::CommandFailed("cursor exited non-zero".into())),
            Err(e) => {
                log::warn!("Cursor strategy failed: {}", e);
                Some(FocusResult::CommandFailed(e))
            }
        }
    }
}

// ─── PID fallback strategy ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
struct PidFallbackStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for PidFallbackStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult> {
        let pid = target.pid?;
        match find_window_by_pid(pid) {
            Some(hwnd) => Some(focus_window(hwnd)),
            None => Some(FocusResult::NotFound),
        }
    }
}

// ─── Strategy registry ───────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn strategies() -> Vec<Box<dyn FocusStrategy>> {
    vec![
        Box::new(WindowsTerminalStrategy),
        Box::new(VsCodeStrategy),
        Box::new(CursorStrategy),
        Box::new(PidFallbackStrategy),
    ]
}

/// Focus using the best strategy for the given jump target.
#[cfg(target_os = "windows")]
pub fn focus_with_jump_target(target: &JumpTarget) -> FocusResult {
    for strategy in strategies() {
        if let Some(result) = strategy.try_focus(target) {
            return result;
        }
    }
    FocusResult::NotFound
}

// ─── Command execution helper ────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn run_command_with_timeout(program: &str, args: &str, _timeout: Duration) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let child = Command::new(program)
        .args(args.split_whitespace())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to spawn '{}': {}", program, e))?;

    match child.wait_with_output() {
        Ok(output) => Ok(output.status.success()),
        Err(e) => Err(format!("{} wait failed: {}", program, e)),
    }
}

// ─── Win32 helpers (existing) ────────────────────────────────────────────────

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;

#[cfg(target_os = "windows")]
pub fn find_window_by_pid(pid: u32) -> Option<HWND> {
    struct EnumData {
        target_pid: u32,
        found_hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        if data.found_hwnd.is_some() {
            return BOOL(0);
        }

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        if window_pid == data.target_pid {
            let is_visible = IsWindowVisible(hwnd).as_bool();
            let title_len = GetWindowTextLengthW(hwnd);
            if is_visible && title_len > 0 {
                data.found_hwnd = Some(hwnd);
                return BOOL(0);
            }
        }

        BOOL(1)
    }

    let mut data = EnumData {
        target_pid: pid,
        found_hwnd: None,
    };

    unsafe {
        let _ = EnumWindows(Some(enum_callback), LPARAM(&mut data as *mut _ as isize));
    }

    data.found_hwnd
}

#[cfg(target_os = "windows")]
pub fn focus_window(hwnd: HWND) -> FocusResult {
    unsafe {
        let is_minimized = IsIconic(hwnd).as_bool();

        if is_minimized {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            if try_focus_with_attach(hwnd) {
                return FocusResult::Restored;
            }
            flash_window(hwnd);
            return FocusResult::FlashOnly;
        }

        if SetForegroundWindow(hwnd).as_bool() {
            return FocusResult::Success;
        }

        if try_focus_with_attach(hwnd) {
            return FocusResult::Success;
        }

        flash_window(hwnd);
        FocusResult::FlashOnly
    }
}

#[cfg(target_os = "windows")]
unsafe fn try_focus_with_attach(hwnd: HWND) -> bool {
    let foreground_hwnd = GetForegroundWindow();
    if foreground_hwnd.0.is_null() {
        return SetForegroundWindow(hwnd).as_bool();
    }

    let foreground_thread = GetWindowThreadProcessId(foreground_hwnd, None);
    let current_thread = GetCurrentThreadId();

    if foreground_thread != current_thread {
        let _ = AttachThreadInput(current_thread, foreground_thread, true);
        let result = SetForegroundWindow(hwnd);
        let _ = AttachThreadInput(current_thread, foreground_thread, false);
        result.as_bool()
    } else {
        SetForegroundWindow(hwnd).as_bool()
    }
}

#[cfg(target_os = "windows")]
unsafe fn flash_window(hwnd: HWND) {
    use std::mem;

    let mut flash_info = FLASHWINFO {
        cbSize: mem::size_of::<FLASHWINFO>() as u32,
        hwnd,
        dwFlags: FLASHW_ALL | FLASHW_TIMERNOFG,
        uCount: 0,
        dwTimeout: 0,
    };
    let _ = FlashWindowEx(&mut flash_info);
}

#[cfg(target_os = "windows")]
pub fn focus_window_by_pid(pid: u32) -> FocusResult {
    match find_window_by_pid(pid) {
        Some(hwnd) => focus_window(hwnd),
        None => FocusResult::NotFound,
    }
}

// ─── Detect terminal type from process parent chain ──────────────────────────

/// Detect the terminal type by examining the parent process chain.
/// Returns a terminal type string and optional extra metadata.
#[cfg(target_os = "windows")]
pub fn detect_terminal_type(pid: u32) -> (Option<String>, Option<serde_json::Value>) {
    let parent_pid = get_parent_pid(pid);

    // Walk up the process tree looking for known terminals
    let mut current_pid = parent_pid;
    for _ in 0..10 {
        if current_pid == 0 {
            break;
        }

        if let Some(name) = get_process_name(current_pid) {
            let name_lower = name.to_lowercase();

            if name_lower == "windowsterminal.exe" || name_lower == "wt.exe" {
                return (Some("windowsTerminal".into()), None);
            }
            if name_lower == "code.exe" {
                return (Some("vscode".into()), None);
            }
            if name_lower == "cursor.exe" {
                return (Some("cursor".into()), None);
            }
        }

        current_pid = get_parent_pid(current_pid);
    }

    (None, None)
}

#[cfg(target_os = "windows")]
fn get_parent_pid(pid: u32) -> u32 {
    use windows::Win32::System::Diagnostics::ToolHelp::*;

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(s) => s,
            Err(_) => return 0,
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == pid {
                    return entry.th32ParentProcessID;
                }
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        0
    }
}

#[cfg(target_os = "windows")]
fn get_process_name(pid: u32) -> Option<String> {
    use windows::Win32::System::Diagnostics::ToolHelp::*;

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == pid {
                    let name = String::from_utf16_lossy(
                        &entry.szExeFile.iter()
                            .take_while(|&&c| c != 0)
                            .copied()
                            .collect::<Vec<u16>>()
                    );
                    return Some(name);
                }
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        None
    }
}

// ─── Non-Windows stubs ───────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
pub fn find_window_by_pid(_pid: u32) -> Option<()> {
    None
}

#[cfg(not(target_os = "windows"))]
#[derive(Debug, Clone, serde::Serialize)]
pub enum FocusResult {
    Success,
    FlashOnly,
    NotFound,
    Restored,
    CommandFailed(String),
}

#[cfg(not(target_os = "windows"))]
pub fn focus_window(_hwnd: ()) -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn focus_window_by_pid(_pid: u32) -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn focus_with_jump_target(_target: &JumpTarget) -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn detect_terminal_type(_pid: u32) -> (Option<String>, Option<serde_json::Value>) {
    (None, None)
}
