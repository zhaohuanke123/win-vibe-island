//! TerminalJumpService — 跳转执行服务
//!
//! 职责：接收 JumpTarget，按注册表匹配策略执行聚焦。
//! 对齐 Open Island 的 TerminalJumpService 架构。

use crate::agent_event::JumpTarget;
use crate::terminal_jump::strategies::{JumpResult, FocusStrategy};
use crate::terminal_jump::strategies::windows_terminal::WindowsTerminalStrategy;
use crate::terminal_jump::strategies::workspace_match::WorkspaceMatchStrategy;
use crate::terminal_jump::strategies::cli_workspace::CliWorkspaceStrategy;
use crate::terminal_jump::strategies::pid_fallback::PidFallbackStrategy;
use crate::terminal_jump::registry;

/// 终端跳转服务
pub struct TerminalJumpService {
    strategies: Vec<Box<dyn FocusStrategy>>,
}

impl TerminalJumpService {
    /// 创建新的跳转服务，注册所有策略
    #[cfg(target_os = "windows")]
    pub fn new() -> Self {
        Self {
            strategies: vec![
                Box::new(WindowsTerminalStrategy),
                Box::new(CliWorkspaceStrategy),
                Box::new(WorkspaceMatchStrategy),
                Box::new(PidFallbackStrategy),
            ],
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn new() -> Self {
        Self {
            strategies: vec![],
        }
    }

    /// 跳转到指定目标
    ///
    /// 按策略链顺序尝试，逐级 fallback。
    /// 策略链：WindowsTerminal → CliOpenWorkspace → WorkspaceMatch → PidFallback
    pub fn jump(&self, target: &JumpTarget) -> JumpResult {
        for strategy in &self.strategies {
            if let Some(result) = strategy.try_focus(target) {
                match &result {
                    JumpResult::Success(_) | JumpResult::AppActivated(_) => {
                        log::info!(
                            "[TerminalJumpService] strategy succeeded for app={:?}: {:?}",
                            target.terminal_app, result
                        );
                        return result;
                    }
                    JumpResult::Failed(msg) => {
                        log::info!(
                            "[TerminalJumpService] strategy failed for app={:?}: {}, trying next",
                            target.terminal_app, msg
                        );
                        continue;
                    }
                    JumpResult::NotFound => {
                        continue;
                    }
                }
            }
        }

        log::warn!(
            "[TerminalJumpService] no strategy matched for app={:?}, pid={:?}",
            target.terminal_app,
            target.pid
        );
        JumpResult::NotFound
    }
}

impl Default for TerminalJumpService {
    fn default() -> Self {
        Self::new()
    }
}

// ── 便捷 API ────────────────────────────────────────────────────────────────

/// 全局单例
static SERVICE: std::sync::OnceLock<TerminalJumpService> = std::sync::OnceLock::new();

fn get_service() -> &'static TerminalJumpService {
    SERVICE.get_or_init(TerminalJumpService::new)
}

/// 跳转到指定 JumpTarget
///
/// 公开 API — 前端和 commands.rs 使用此入口。
pub fn jump_to(target: &JumpTarget) -> JumpResult {
    get_service().jump(target)
}

/// 跳转到指定 session 的窗口（带 PID fallback）
///
/// 1. 优先使用 JumpTarget 跳转
/// 2. 回退到 PID 聚焦
/// 3. 最后尝试 workspace 聚焦
#[cfg(target_os = "windows")]
pub fn jump_to_session(
    session_pid: Option<u32>,
    jump_target: Option<&JumpTarget>,
    session_cwd: Option<&str>,
) -> JumpResult {
    log::info!(
        "[jump_to_session] enter: session_pid={:?}, jump_target.terminal_app={:?}, session_cwd={:?}",
        session_pid,
        jump_target.as_ref().and_then(|t| t.terminal_app.as_ref()),
        session_cwd,
    );

    // 1. 使用 JumpTarget
    if let Some(ref target) = jump_target {
        if target.terminal_app.is_some() {
            log::info!("[jump_to_session] path=1 (JumpTarget strategy chain), app={:?}", target.terminal_app);
            let result = jump_to(target);
            log::info!("[jump_to_session] JumpTarget result: {:?}", result);
            match &result {
                JumpResult::Success(_) | JumpResult::AppActivated(_) => return result,
                _ => log::info!("[jump_to_session] path=1 failed, falling through to PID fallback"),
            }
        } else {
            log::info!("[jump_to_session] path=1 skipped: JumpTarget present but terminal_app is None");
        }
    } else {
        log::info!("[jump_to_session] path=1 skipped: no JumpTarget");
    }

    // 2. PID fallback
    if let Some(pid) = session_pid {
        log::info!("[jump_to_session] path=2 (PID fallback), pid={}", pid);
        let result = crate::window_focus::focus_window_by_pid(pid).into();
        if !matches!(result, JumpResult::NotFound) {
            log::info!("[jump_to_session] PID fallback (direct) result: {:?}", result);
            return result;
        }
        log::info!("[jump_to_session] direct PID focus failed, trying registry-based tree walk");

        // Agent 进程本身无窗口 — 用注册表感知的探测向上走进程树找终端窗口
        let (terminal_app, terminal_pid) = crate::terminal_jump::resolver::detect_terminal_app(pid);
        log::info!(
            "[jump_to_session] detect_terminal_app → app={:?}, pid={:?}",
            terminal_app, terminal_pid
        );
        if let Some(tpid) = terminal_pid {
            // IDE（VSCode/Cursor 等）可能有多个窗口，用 CWD 匹配标题更精确
            let cwd = jump_target
                .as_ref()
                .and_then(|t| t.working_directory.as_deref())
                .or(session_cwd);
            let desc = terminal_app.as_ref().and_then(|app| {
                crate::terminal_jump::registry::find_by_id_or_alias(app)
            });
            let is_ide = desc.map_or(false, |d| {
                matches!(
                    d.focus_strategy,
                    crate::terminal_jump::registry::FocusStrategyType::CliOpenWorkspace
                    | crate::terminal_jump::registry::FocusStrategyType::WorkspaceMatch
                )
            });

            let result = if is_ide && cwd.is_some() {
                let exe = desc.and_then(|d| d.exe_names.first()).map(|e| *e);
                if let (Some(cwd), Some(exe)) = (cwd, exe) {
                    log::info!(
                        "[jump_to_session] IDE workspace match: exe={}, cwd={}",
                        exe, cwd
                    );
                    crate::window_focus::focus_by_workspace_with_exe(cwd, exe).into()
                } else {
                    crate::window_focus::focus_window_by_pid(tpid).into()
                }
            } else {
                crate::window_focus::focus_window_by_pid(tpid).into()
            };

            if !matches!(result, JumpResult::NotFound) {
                log::info!("[jump_to_session] terminal PID {} fallback result: {:?}", tpid, result);
                return result;
            }
            log::info!("[jump_to_session] terminal PID {} focus failed", tpid);
        }

        log::info!("[jump_to_session] PID fallback exhausted for pid={}", pid);
    } else {
        log::info!("[jump_to_session] path=2 skipped: no session_pid");
    }

    // 3. Workspace fallback（优先用 JumpTarget 的 cwd，否则用 session_cwd）
    let cwd = jump_target
        .as_ref()
        .and_then(|t| t.working_directory.as_deref())
        .or(session_cwd);
    if let Some(cwd) = cwd {
        log::info!("[jump_to_session] path=3 (workspace fallback), cwd={}", cwd);
        let result = crate::window_focus::focus_by_workspace(cwd).into();
        if !matches!(result, JumpResult::NotFound) {
            log::info!("[jump_to_session] workspace fallback result: {:?}", result);
            return result;
        }
        log::info!("[jump_to_session] workspace fallback: no matching window");
    }

    log::warn!("[jump_to_session] all paths exhausted — NotFound");
    JumpResult::NotFound
}

#[cfg(not(target_os = "windows"))]
pub fn jump_to_session(
    _session_pid: Option<u32>,
    _jump_target: Option<&JumpTarget>,
    _session_cwd: Option<&str>,
) -> JumpResult {
    JumpResult::NotFound
}

/// 检测终端类型（v1 兼容入口）
///
/// 返回 (terminal_app, JumpTarget)
#[cfg(target_os = "windows")]
pub fn detect_terminal(pid: u32) -> (Option<String>, JumpTarget) {
    let (terminal_app, terminal_pid) = registry::find_by_exe_name("")
        .map(|_| (None, None))
        .unwrap_or_else(|| {
            // 使用 resolver 的 detect_terminal_app
            let (app, tpid) = crate::terminal_jump::resolver::detect_terminal_app(pid);
            (app, tpid)
        });

    let target = JumpTarget {
        terminal_app: terminal_app.clone(),
        workspace_name: None,
        pane_title: None,
        working_directory: None,
        terminal_session_id: None,
        pid: terminal_pid,
        terminal_tab_index: None,
        terminal_tab_id: None,
        extra: None,
    };

    (terminal_app, target)
}

#[cfg(not(target_os = "windows"))]
pub fn detect_terminal(_pid: u32) -> (Option<String>, JumpTarget) {
    (None, JumpTarget {
        terminal_app: None,
        workspace_name: None,
        pane_title: None,
        working_directory: None,
        terminal_session_id: None,
        pid: None,
        terminal_tab_index: None,
        terminal_tab_id: None,
        extra: None,
    })
}
