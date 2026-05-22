//! Windows Terminal 聚焦策略
//!
//! 优先级：
//! 1. `wt.exe -w 0 focus-tab --target {tab_id}` — GUID 精确跳转，最稳定
//! 2. `wt.exe -w 0 focus-tab --target {tab_index}` — 无 GUID 时用 index
//! 3. PID → find_window_by_pid → SetForegroundWindow

use super::{FocusStrategy, JumpResult};
use crate::agent_event::JumpTarget;
use std::time::Duration;

const STRATEGY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct WindowsTerminalStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for WindowsTerminalStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<JumpResult> {
        // 只处理 Windows Terminal
        let app = target.terminal_app.as_deref()?;
        if app != "WindowsTerminal" {
            return None;
        }

        // 优先使用 PID 聚焦（可靠性高）
        if let Some(pid) = target.pid {
            if let Some(hwnd) = crate::window_focus::find_window_by_pid(pid) {
                return Some(crate::window_focus::focus_window(hwnd).into());
            }
        }

        // wt.exe focus-tab 命令
        let args = if let Some(ref tab_id) = target.terminal_tab_id {
            format!("-w 0 focus-tab --target {}", tab_id)
        } else if let Some(tab_index) = target.terminal_tab_index {
            format!("-w 0 focus-tab --target {}", tab_index)
        } else {
            "-w 0 focus-tab".to_string()
        };

        match run_command_with_timeout("wt", &args, STRATEGY_TIMEOUT) {
            Ok(true) => Some(JumpResult::Success("Windows Terminal focused via wt.exe".into())),
            Ok(false) => Some(JumpResult::Failed("wt.exe exited non-zero".into())),
            Err(e) => {
                log::warn!("[WindowsTerminalStrategy] wt command failed: {}", e);
                Some(JumpResult::Failed(e))
            }
        }
    }
}

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

/// FocusResult → JumpResult 转换（用于 PID 聚焦路径）
impl From<crate::window_focus::FocusResult> for JumpResult {
    fn from(r: crate::window_focus::FocusResult) -> Self {
        match r {
            crate::window_focus::FocusResult::Success => {
                JumpResult::Success("Focused via SetForegroundWindow".into())
            }
            crate::window_focus::FocusResult::Restored => {
                JumpResult::Success("Window restored and focused".into())
            }
            crate::window_focus::FocusResult::FlashOnly => {
                JumpResult::AppActivated("Could not focus, flashed window".into())
            }
            crate::window_focus::FocusResult::NotFound => JumpResult::NotFound,
            crate::window_focus::FocusResult::CommandFailed(e) => JumpResult::Failed(e),
        }
    }
}
