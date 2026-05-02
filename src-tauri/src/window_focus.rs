//! Window focus management for bringing agent terminal/editor windows to foreground.
//!
//! Implements cross-application window focus with fallback strategies for Windows 10/11
//! focus stealing restrictions.

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;

/// Result of a focus operation
#[derive(Debug, Clone, serde::Serialize)]
pub enum FocusResult {
    /// Window was successfully focused
    Success,
    /// Window was found but could only be flashed (focus blocked by OS)
    FlashOnly,
    /// No window found for the given PID
    NotFound,
    /// Window was minimized and restored
    Restored,
}

/// Find a main window belonging to the process with the given PID.
///
/// Uses EnumWindows to iterate all top-level windows and matches by process ID.
/// Returns the first visible, enabled window found (typically the main window).
#[cfg(target_os = "windows")]
pub fn find_window_by_pid(pid: u32) -> Option<HWND> {
    // Callback data structure
    struct EnumData {
        target_pid: u32,
        found_hwnd: Option<HWND>,
    }

    // EnumWindows callback
    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        if data.found_hwnd.is_some() {
            return BOOL(0); // Already found, stop enumeration
        }

        // Get process ID of this window
        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        if window_pid == data.target_pid {
            // Check if this is a suitable main window:
            // - Visible
            // - Has a title (not a tool window)
            let is_visible = IsWindowVisible(hwnd).as_bool();

            // Get window title length
            let title_len = GetWindowTextLengthW(hwnd);
            let has_title = title_len > 0;

            if is_visible && has_title {
                data.found_hwnd = Some(hwnd);
                return BOOL(0); // Stop enumeration
            }
        }

        BOOL(1) // Continue enumeration
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

/// Focus a window, bringing it to the foreground.
///
/// Uses multiple fallback strategies to handle Windows 10/11 focus stealing restrictions:
/// 1. Try SetForegroundWindow directly
/// 2. Attach to the foreground thread and try again (steal focus)
/// 3. Flash the window if focus is blocked
/// 4. Restore from minimized state if needed
#[cfg(target_os = "windows")]
pub fn focus_window(hwnd: HWND) -> FocusResult {
    unsafe {
        // Check if window is minimized using IsIconic
        let is_minimized = IsIconic(hwnd).as_bool();

        if is_minimized {
            // Restore the window first
            let _ = ShowWindow(hwnd, SW_RESTORE);
            // After restore, try to focus
            if try_focus_with_attach(hwnd) {
                return FocusResult::Restored;
            }
            // Flash as fallback
            flash_window(hwnd);
            return FocusResult::FlashOnly;
        }

        // Strategy 1: Direct SetForegroundWindow
        if SetForegroundWindow(hwnd).as_bool() {
            return FocusResult::Success;
        }

        // Strategy 2: AttachThreadInput to steal focus
        if try_focus_with_attach(hwnd) {
            return FocusResult::Success;
        }

        // Strategy 3: Flash window as last resort
        flash_window(hwnd);
        FocusResult::FlashOnly
    }
}

/// Attempt to focus a window by attaching to the foreground thread.
///
/// This is a common workaround for Windows focus restrictions:
/// 1. Get the foreground window's thread
/// 2. Attach our thread to it
/// 3. Call SetForegroundWindow
/// 4. Detach
#[cfg(target_os = "windows")]
unsafe fn try_focus_with_attach(hwnd: HWND) -> bool {
    let foreground_hwnd = GetForegroundWindow();
    if foreground_hwnd.0.is_null() {
        // No foreground window, try direct focus
        return SetForegroundWindow(hwnd).as_bool();
    }

    let foreground_thread = GetWindowThreadProcessId(foreground_hwnd, None);
    let current_thread = GetCurrentThreadId();

    if foreground_thread != current_thread {
        // Attach threads to steal focus
        let _ = AttachThreadInput(current_thread, foreground_thread, true);
        let result = SetForegroundWindow(hwnd);
        let _ = AttachThreadInput(current_thread, foreground_thread, false);
        result.as_bool()
    } else {
        SetForegroundWindow(hwnd).as_bool()
    }
}

/// Flash the window in the taskbar to get user attention.
///
/// Used as a fallback when focus stealing is blocked by Windows.
#[cfg(target_os = "windows")]
unsafe fn flash_window(hwnd: HWND) {
    use std::mem;

    let mut flash_info = FLASHWINFO {
        cbSize: mem::size_of::<FLASHWINFO>() as u32,
        hwnd,
        dwFlags: FLASHW_ALL | FLASHW_TIMERNOFG,
        uCount: 0, // Flash until user clicks
        dwTimeout: 0,
    };
    let _ = FlashWindowEx(&mut flash_info);
}

/// Focus a window by PID - convenience function combining find and focus.
#[cfg(target_os = "windows")]
pub fn focus_window_by_pid(pid: u32) -> FocusResult {
    match find_window_by_pid(pid) {
        Some(hwnd) => focus_window(hwnd),
        None => FocusResult::NotFound,
    }
}

// Non-Windows stub implementations

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
}

#[cfg(not(target_os = "windows"))]
pub fn focus_window(_hwnd: ()) -> FocusResult {
    FocusResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn focus_window_by_pid(_pid: u32) -> FocusResult {
    FocusResult::NotFound
}
