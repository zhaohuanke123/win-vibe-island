//! Workspace 标题匹配策略
//!
//! 用于 VS Code / Cursor / Windsurf 类终端：
//! 枚举窗口，匹配包含 workspace_name 的标题 + 对应 exe。

use super::{FocusStrategy, JumpResult};
use crate::agent_event::JumpTarget;
use crate::window_focus;

pub struct WorkspaceMatchStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for WorkspaceMatchStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<JumpResult> {
        let app = target.terminal_app.as_deref()?;
        let desc = crate::terminal_jump::registry::find_by_id_or_alias(app)?;

        // 只处理 WorkspaceMatch 策略类型的终端
        if desc.focus_strategy != crate::terminal_jump::registry::FocusStrategyType::WorkspaceMatch {
            return None;
        }

        // 优先使用 working_directory
        if let Some(ref cwd) = target.working_directory {
            let exe = desc.exe_names.first()?;
            return Some(window_focus::focus_by_workspace_with_exe(cwd, exe).into());
        }

        // 回退到 workspace_name 标题匹配
        if let Some(ref ws_name) = target.workspace_name {
            let exe = desc.exe_names.first()?;
            return Some(window_focus::focus_by_workspace_with_exe(ws_name, exe).into());
        }

        Some(JumpResult::NotFound)
    }
}
