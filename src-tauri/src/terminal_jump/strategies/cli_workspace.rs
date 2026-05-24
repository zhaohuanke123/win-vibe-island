//! CLI Workspace 跳转策略
//!
//! 通过 CLI 命令（`code -r`, `cursor -r`, `windsurf -r`）打开/聚焦 workspace。
//! `-r` 标志表示 reuse window（如果已有窗口则聚焦到它）。

use super::{FocusStrategy, JumpResult};
use crate::agent_event::JumpTarget;
use std::time::Duration;

const STRATEGY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct CliWorkspaceStrategy;

#[cfg(target_os = "windows")]
impl FocusStrategy for CliWorkspaceStrategy {
    fn try_focus(&self, target: &JumpTarget) -> Option<JumpResult> {
        let app = target.terminal_app.as_deref()?;
        let desc = crate::terminal_jump::registry::find_by_id_or_alias(app)?;

        // 只处理 CliOpenWorkspace 策略类型的终端
        if desc.focus_strategy != crate::terminal_jump::registry::FocusStrategyType::CliOpenWorkspace {
            return None;
        }

        let cli = desc.cli_command?;
        let workspace = target.working_directory.as_deref()?;

        // 使用 -r 标志（reuse window）
        let args = format!("-r \"{}\"", workspace);

        match run_command_with_timeout(cli, &args, STRATEGY_TIMEOUT) {
            Ok(true) => Some(JumpResult::Success(format!(
                "{} workspace focused via CLI: {}",
                desc.display_name, workspace
            ))),
            Ok(false) => Some(JumpResult::Failed(format!(
                "{} CLI exited non-zero for workspace: {}",
                desc.display_name, workspace
            ))),
            Err(e) => {
                log::warn!("[CliWorkspaceStrategy] {} command failed: {}", cli, e);
                Some(JumpResult::Failed(e))
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn run_command_with_timeout(program: &str, args: &str, _timeout: Duration) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // 通过 cmd /C 执行，让 cmd.exe 按 PATHEXT 找 .cmd/.bat（code.cmd、cursor.cmd 等）
    let cmdline = if args.is_empty() {
        program.to_string()
    } else {
        format!("{} {}", program, args)
    };
    let child = Command::new("cmd")
        .args(["/C", &cmdline])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to spawn '{}': {}", program, e))?;

    match child.wait_with_output() {
        Ok(output) => Ok(output.status.success()),
        Err(e) => Err(format!("{} wait failed: {}", program, e)),
    }
}
