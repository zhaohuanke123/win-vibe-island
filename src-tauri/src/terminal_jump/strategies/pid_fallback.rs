//! PID Fallback 策略
//!
//! 通用最后手段：PID → EnumWindows → SetForegroundWindow。
//! 适用于 WezTerm / Alacritty / Tabby 等没有专用 CLI 跳转的终端。

use super::{FocusStrategy, JumpResult};
use crate::agent_event::JumpTarget;

pub struct PidFallbackStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for PidFallbackStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<JumpResult> {
        let pid = target.pid?;
        match crate::window_focus::find_window_by_pid(pid) {
            Some(hwnd) => Some(crate::window_focus::focus_window(hwnd).into()),
            None => Some(JumpResult::NotFound),
        }
    }
}
