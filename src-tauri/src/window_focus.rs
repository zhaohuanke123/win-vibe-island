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
        if target.terminal_app.as_deref() != Some("WindowsTerminal") {
            return None;
        }

        // Prefer PID-based focus for reliability
        if let Some(pid) = target.pid {
            if let Some(hwnd) = find_window_by_pid(pid) {
                return Some(focus_window(hwnd));
            }
        }

        // Fallback: wt focus-tab command
        let tab_id = target.terminal_tab_id.as_deref();
        let tab_index = target.terminal_tab_index;

        let args = if let Some(id) = tab_id {
            format!("-w 0 focus-tab --target {}", id)
        } else if let Some(idx) = tab_index {
            format!("-w 0 focus-tab --target {}", idx)
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
        if target.terminal_app.as_deref() != Some("VSCode") {
            return None;
        }

        // Find any code.exe window whose title contains the workspace folder name.
        // VS Code spawns multiple processes (main, renderer, extension host);
        // the PID we detected may be a background process without a window.
        if let Some(ref workspace) = target.working_directory {
            return Some(focus_by_workspace_with_exe(workspace, "code.exe"));
        }

        Some(FocusResult::NotFound)
    }
}

// ─── Cursor strategy ─────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
struct CursorStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for CursorStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<FocusResult> {
        if target.terminal_app.as_deref() != Some("Cursor") {
            return None;
        }

        if let Some(ref workspace) = target.working_directory {
            return Some(focus_by_workspace_with_exe(workspace, "cursor.exe"));
        }

        Some(FocusResult::NotFound)
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
    log::info!("[focus_window_by_pid] pid={}", pid);
    match find_window_by_pid(pid) {
        Some(hwnd) => {
            log::info!("[focus_window_by_pid] found hwnd={:?} for pid={}", hwnd, pid);
            focus_window(hwnd)
        }
        None => {
            log::info!("[focus_window_by_pid] no visible window found for pid={}", pid);
            FocusResult::NotFound
        }
    }
}

/// Find a window belonging to the specified exe whose title contains the workspace folder name.
#[cfg(target_os = "windows")]
pub fn focus_by_workspace_with_exe(workspace: &str, exe_name: &str) -> FocusResult {
    use windows::Win32::Foundation::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    let folder_name = workspace
        .rsplit(|c| c == '/' || c == '\\')
        .find(|s| !s.is_empty())
        .unwrap_or("");

    if folder_name.is_empty() {
        return FocusResult::NotFound;
    }

    let exe_name_lower = exe_name.to_lowercase();
    let folder_name_lower = folder_name.to_lowercase();

    // Build PID→name map ONCE instead of per-window snapshot
    let pid_map = build_process_name_map();

    struct EnumData {
        folder_name_lower: String,
        exe_name_lower: String,
        pid_map: std::collections::HashMap<u32, String>,
        found_hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        if data.found_hwnd.is_some() {
            return BOOL(0);
        }

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        match data.pid_map.get(&window_pid) {
            Some(name) if name.to_lowercase() == data.exe_name_lower => {}
            _ => return BOOL(1),
        }

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1);
        }

        let mut buf = vec![0u16; (title_len + 1) as usize];
        GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..title_len as usize]);

        if title.to_lowercase().contains(&data.folder_name_lower) {
            data.found_hwnd = Some(hwnd);
            return BOOL(0);
        }

        BOOL(1)
    }

    let mut data = EnumData {
        folder_name_lower,
        exe_name_lower,
        pid_map,
        found_hwnd: None,
    };

    unsafe {
        let _ = EnumWindows(Some(enum_callback), LPARAM(&mut data as *mut _ as isize));
    }

    match data.found_hwnd {
        Some(hwnd) => focus_window(hwnd),
        None => FocusResult::NotFound,
    }
}

/// Focus a Windows Terminal window by PID, preferring the one whose title matches workspace.
///
/// WT 所有窗口共享同一 PID（v1.18 起），`find_window_by_pid` 只返回第一个可见窗口。
/// 此函数枚举该 PID 的所有可见窗口，依次尝试：
/// 1. 完整 workspace 路径匹配
/// 2. 最后一段文件夹名匹配
/// 3. 负向过滤（跳过系统窗口，如 "C:\Windows\system32\cmd.exe"）
/// 4. 回退到第一个候选
#[cfg(target_os = "windows")]
pub fn focus_wt_window_by_workspace(pid: u32, workspace: Option<&str>) -> FocusResult {
    use windows::Win32::Foundation::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    let folder_name = workspace
        .and_then(|w| w.rsplit(|c: char| c == '/' || c == '\\').find(|s| !s.is_empty()))
        .unwrap_or("");

    struct EnumData {
        target_pid: u32,
        candidates: Vec<(HWND, String)>,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        if window_pid != data.target_pid {
            return BOOL(1);
        }

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1);
        }

        let mut buf = vec![0u16; (title_len + 1) as usize];
        GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..title_len as usize]);

        data.candidates.push((hwnd, title));
        BOOL(1)
    }

    let mut data = EnumData {
        target_pid: pid,
        candidates: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(Some(enum_callback), LPARAM(&mut data as *mut _ as isize));
    }

    if data.candidates.is_empty() {
        return FocusResult::NotFound;
    }

    // 记录所有候选窗口
    for (i, (hwnd, title)) in data.candidates.iter().enumerate() {
        log::info!(
            "[focus_wt_window_by_workspace] candidate[{}]: hwnd={:?} title={:?}",
            i, hwnd, title
        );
    }

    // 匹配1: 完整 workspace 路径
    if let Some(ws) = workspace {
        if !ws.is_empty() {
            let ws_lower = ws.to_lowercase();
            for (hwnd, title) in &data.candidates {
                if title.to_lowercase().contains(&ws_lower) {
                    log::info!("[focus_wt_window_by_workspace] matched full path: {:?}", title);
                    return focus_window(*hwnd);
                }
            }
        }
    }

    // 匹配2: 最后一段文件夹名
    if !folder_name.is_empty() {
        let folder_lower = folder_name.to_lowercase();
        for (hwnd, title) in &data.candidates {
            if title.to_lowercase().contains(&folder_lower) {
                log::info!("[focus_wt_window_by_workspace] matched folder: {:?}", title);
                return focus_window(*hwnd);
            }
        }
    }

    // 负向过滤: 跳过系统窗口（标题含 \Windows\system32）
    if let Some((hwnd, title)) = data.candidates.iter().find(|(_, title)| {
        let lower = title.to_lowercase();
        !lower.starts_with("c:\\windows") && !lower.contains("\\windows\\system32")
    }) {
        log::info!(
            "[focus_wt_window_by_workspace] negative filter: hwnd={:?} title={:?}",
            hwnd, title
        );
        return focus_window(*hwnd);
    }

    // 最终回退
    let (hwnd, title) = &data.candidates[0];
    log::info!(
        "[focus_wt_window_by_workspace] final fallback: hwnd={:?} title={:?}",
        hwnd, title
    );
    focus_window(*hwnd)
}

/// Last-resort focus: try all known editors to find a matching window.
#[cfg(target_os = "windows")]
pub fn focus_by_workspace(workspace: &str) -> FocusResult {
    for exe in &["code.exe", "cursor.exe"] {
        let result = focus_by_workspace_with_exe(workspace, exe);
        if !matches!(result, FocusResult::NotFound) {
            return result;
        }
    }
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn focus_by_workspace(_workspace: &str) -> FocusResult {
    FocusResult::NotFound
}

// ─── Detect terminal type from process parent chain ──────────────────────────

/// Detect the terminal type by examining the parent process chain.
/// Returns a terminal type string and optional extra metadata (including the terminal process PID).
///
/// @deprecated 自 v2 起，请使用 terminal_jump::resolver::resolve_from_pid 替代。
///   旧函数仅做硬编码 if-else 匹配，新 resolver 为注册表驱动，支持 CLI 快照。
#[cfg(target_os = "windows")]
#[deprecated(since = "2.0.0", note = "请使用 terminal_jump::resolver::resolve_from_pid 替代")]
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
                return (Some("windowsTerminal".into()), Some(serde_json::json!({ "terminalPid": current_pid })));
            }
            if name_lower == "code.exe" {
                return (Some("vscode".into()), Some(serde_json::json!({ "terminalPid": current_pid })));
            }
            if name_lower == "cursor.exe" {
                return (Some("cursor".into()), Some(serde_json::json!({ "terminalPid": current_pid })));
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

/// Build a PID → process name map in a single snapshot. Avoids creating one
/// snapshot per window in EnumWindows callbacks.
#[cfg(target_os = "windows")]
fn build_process_name_map() -> std::collections::HashMap<u32, String> {
    use windows::Win32::System::Diagnostics::ToolHelp::*;
    use std::collections::HashMap;

    let mut map = HashMap::new();
    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(s) => s,
            Err(_) => return map,
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let name = String::from_utf16_lossy(
                    &entry.szExeFile.iter()
                        .take_while(|&&c| c != 0)
                        .copied()
                        .collect::<Vec<u16>>()
                );
                map.insert(entry.th32ProcessID, name);
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
    }
    map
}

// ─── Non-Windows stubs ───────────────────────────────────────────────────────

/// 聚焦任何可见的已知终端窗口（最终 fallback）
///
/// 只匹配真正的终端模拟器（WindowsTerminal、WezTerm、Alacritty、Tabby），
/// 排除 IDE（VSCode、Cursor、Windsurf），避免跳转到 IDE 窗口。
#[cfg(target_os = "windows")]
pub fn focus_any_terminal() -> FocusResult {
    use windows::Win32::UI::WindowsAndMessaging::*;

    let pid_map = build_process_name_map();

    // 只取真正的终端模拟器的 exe 名（排除 CliOpenWorkspace 和 WorkspaceMatch 策略的 IDE）
    let terminal_exes: Vec<String> = crate::terminal_jump::registry::KNOWN_TERMINALS
        .iter()
        .filter(|desc| {
            matches!(
                desc.focus_strategy,
                crate::terminal_jump::registry::FocusStrategyType::WindowsTerminal
                | crate::terminal_jump::registry::FocusStrategyType::PidFallback
            )
        })
        .flat_map(|desc| desc.exe_names.iter().map(|e| e.to_lowercase()))
        .collect();

    log::info!("[focus_any_terminal] looking for exes: {:?}", terminal_exes);

    struct EnumData {
        pid_map: std::collections::HashMap<u32, String>,
        terminal_exes: Vec<String>,
        found_hwnd: Option<HWND>,
        found_exe: Option<String>,
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        if data.found_hwnd.is_some() {
            return BOOL(0);
        }

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        if let Some(exe_name) = data.pid_map.get(&window_pid) {
            let exe_lower = exe_name.to_lowercase();
            if data.terminal_exes.iter().any(|k| *k == exe_lower) {
                let is_visible = IsWindowVisible(hwnd).as_bool();
                let title_len = GetWindowTextLengthW(hwnd);
                if is_visible && title_len > 0 {
                    data.found_hwnd = Some(hwnd);
                    data.found_exe = Some(exe_name.clone());
                    return BOOL(0);
                }
            }
        }

        BOOL(1)
    }

    let mut data = EnumData {
        pid_map,
        terminal_exes,
        found_hwnd: None,
        found_exe: None,
    };

    unsafe {
        let _ = EnumWindows(Some(enum_callback), LPARAM(&mut data as *mut _ as isize));
    }

    match data.found_hwnd {
        Some(hwnd) => {
            log::info!("[focus_any_terminal] found window: exe={:?}", data.found_exe);
            focus_window(hwnd)
        }
        None => {
            log::info!("[focus_any_terminal] no terminal window found");
            FocusResult::NotFound
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn focus_any_terminal() -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn find_window_by_pid(_pid: u32) -> Option<()> {
    None
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
pub fn focus_wt_window_by_workspace(_pid: u32, _workspace: Option<&str>) -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn detect_terminal_type(_pid: u32) -> (Option<String>, Option<serde_json::Value>) {
    (None, None)
}
