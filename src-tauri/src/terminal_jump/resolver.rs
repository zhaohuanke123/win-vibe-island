//! TerminalJumpTargetResolver — 终端探测与 JumpTarget 修正
//!
//! 职责：周期探测活跃终端 session，产出精确 JumpTarget。
//! 对齐 Open Island 的 TerminalJumpTargetResolver 架构。
//!
//! ## 多轮匹配算法
//!
//! ```text
//! Pass 1: terminal_session_id 精确匹配
//! Pass 2: working_directory 匹配
//! Pass 3: pane_title 子串匹配
//! ```

use crate::agent_event::JumpTarget;
use crate::terminal_jump::snapshot::{WtTabSnapshot, WezTermPaneSnapshot};
use std::time::Duration;

/// 探测结果
#[derive(Debug, Clone)]
pub struct ResolvedTarget {
    /// session ID
    pub session_id: String,
    /// 修正后的 JumpTarget
    pub jump_target: JumpTarget,
}

/// Windows Terminal 探测超时
const WT_SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(3);
/// WezTerm 探测超时
const WEZTERM_SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(3);

/// 从进程 PID 探测终端信息并产出 JumpTarget
///
/// 这是 v1 → v2 的桥梁方法。当只有 PID 信息时，通过进程树探测
/// 确定 terminal_app，然后尝试通过 CLI 获取更多精确信息。
#[cfg(target_os = "windows")]
pub fn resolve_from_pid(pid: u32, cwd: Option<&str>) -> JumpTarget {
    // 1. 使用进程树探测确定终端类型
    let (terminal_type, extra) = crate::window_focus::detect_terminal_type(pid);

    // 2. 查注册表获取 TerminalDescriptor
    let desc = terminal_type.as_ref().and_then(|t| {
        crate::terminal_jump::registry::find_by_id_or_alias(t)
    });

    // 3. 构建 JumpTarget
    let terminal_app = terminal_type.map(|t| match t.as_str() {
        "windowsTerminal" => "WindowsTerminal".into(),
        other => other.into(),
    });

    let workspace_name = cwd.and_then(|p| {
        p.rsplit(|c: char| c == '/' || c == '\\')
            .find(|s| !s.is_empty())
            .map(String::from)
    });

    // 4. 尝试获取更精确的信息（Windows Terminal tab / WezTerm pane）
    let (terminal_tab_id, terminal_tab_index, terminal_session_id) = if let Some(ref desc) = desc {
        match desc.focus_strategy {
            crate::terminal_jump::registry::FocusStrategyType::WindowsTerminal => {
                snapshot_windows_terminal()
                    .and_then(|tabs| find_matching_wt_tab(&tabs, cwd, None))
                    .map(|tab| (Some(tab.tab_id.clone()), Some(tab.tab_index), Some(tab.tab_id)))
                    .unwrap_or((None, None, None))
            }
            crate::terminal_jump::registry::FocusStrategyType::PidFallback => {
                // WezTerm: 尝试通过 CLI list 获取 pane 信息
                if desc.id == "wezterm" {
                    snapshot_wezterm()
                        .and_then(|panes| find_matching_wezterm_pane(&panes, cwd))
                        .map(|pane| (None, None, Some(pane.pane_id.to_string())))
                        .unwrap_or((None, None, None))
                } else {
                    (None, None, None)
                }
            }
            _ => (None, None, None),
        }
    } else {
        (None, None, None)
    };

    // 5. 从 extra 提取 PID（terminalPid）
    let pid = extra
        .as_ref()
        .and_then(|e| e.get("terminalPid"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(pid);

    JumpTarget {
        terminal_app,
        workspace_name,
        pane_title: None,
        working_directory: cwd.map(String::from),
        terminal_session_id,
        pid: Some(pid),
        terminal_tab_index,
        terminal_tab_id,
        extra,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn resolve_from_pid(_pid: u32, _cwd: Option<&str>) -> JumpTarget {
    JumpTarget {
        terminal_app: None,
        workspace_name: None,
        pane_title: None,
        working_directory: None,
        terminal_session_id: None,
        pid: Some(_pid),
        terminal_tab_index: None,
        terminal_tab_id: None,
        extra: None,
    }
}

/// 修正已有的 JumpTarget（多轮匹配）
///
/// 如果 JumpTarget 信息不全（如缺少 tab_id / session_id），
/// 通过 Resolver 探测补充信息。
#[cfg(target_os = "windows")]
pub fn enrich_jump_target(target: &JumpTarget) -> JumpTarget {
    let mut enriched = target.clone();
    let app = match target.terminal_app.as_deref() {
        Some(a) => a.to_string(),
        None => return enriched,
    };

    let desc = match crate::terminal_jump::registry::find_by_id_or_alias(&app) {
        Some(d) => d,
        None => return enriched,
    };

    match desc.focus_strategy {
        crate::terminal_jump::registry::FocusStrategyType::WindowsTerminal => {
            // 如果缺少 tab 信息，尝试探测
            if enriched.terminal_tab_id.is_none() && enriched.terminal_tab_index.is_none() {
                if let Some(tabs) = snapshot_windows_terminal() {
                    if let Some(tab) = find_matching_wt_tab(
                        &tabs,
                        enriched.working_directory.as_deref(),
                        enriched.pane_title.as_deref(),
                    ) {
                        enriched.terminal_tab_id = Some(tab.tab_id);
                        enriched.terminal_tab_index = Some(tab.tab_index);
                        if enriched.working_directory.is_none() {
                            enriched.working_directory = tab.working_directory;
                        }
                    }
                }
            }
        }
        crate::terminal_jump::registry::FocusStrategyType::PidFallback => {
            if desc.id == "wezterm" && enriched.terminal_session_id.is_none() {
                if let Some(panes) = snapshot_wezterm() {
                    if let Some(pane) = find_matching_wezterm_pane(
                        &panes,
                        enriched.working_directory.as_deref(),
                    ) {
                        enriched.terminal_session_id = Some(pane.pane_id.to_string());
                    }
                }
            }
        }
        _ => {}
    }

    enriched
}

#[cfg(not(target_os = "windows"))]
pub fn enrich_jump_target(target: &JumpTarget) -> JumpTarget {
    target.clone()
}

/// 探测 Windows Terminal 所有 tab
///
/// **当前禁用**：`wt.exe` 是 UWP GUI 应用，在非终端上下文中调用时
/// 会将子命令（如 `list-tabs`）当作要执行的程序，导致弹出错误标签页。
/// `CREATE_NO_WINDOW` 仅对 console 进程有效，对 `wt.exe` 无效。
/// Jump terminal 回退到 PID 方式聚焦（v1 行为）。
#[cfg(target_os = "windows")]
fn snapshot_windows_terminal() -> Option<Vec<WtTabSnapshot>> {
    None
}

#[cfg(not(target_os = "windows"))]
fn snapshot_windows_terminal() -> Option<Vec<WtTabSnapshot>> {
    None
}

/// 探测 WezTerm 所有 pane
#[cfg(target_os = "windows")]
fn snapshot_wezterm() -> Option<Vec<WezTermPaneSnapshot>> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let output = Command::new("wezterm")
        .args(["cli", "list", "--format", "json"])
        .creation_flags(0x08000000)
        .output()
        .ok()?;

    if !output.status.success() {
        log::debug!("[resolver] wezterm cli list failed");
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // wezterm cli list 输出每行一个 JSON 对象
    stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            serde_json::from_str::<serde_json::Value>(line).ok().and_then(|v| {
                Some(WezTermPaneSnapshot {
                    pane_id: v.get("pane_id")?.as_u64()? as u32,
                    title: v.get("title")?.as_str()?.to_string(),
                    cwd: v.get("cwd").and_then(|v| v.as_str()).map(String::from),
                    tty: v.get("tty").and_then(|v| v.as_str()).map(String::from),
                })
            })
        })
        .collect::<Vec<_>>()
        .into()
}

#[cfg(not(target_os = "windows"))]
fn snapshot_wezterm() -> Option<Vec<WezTermPaneSnapshot>> {
    None
}

/// 在 WtTabSnapshot 列表中查找匹配的 tab
///
/// 匹配优先级：
/// 1. working_directory 完全匹配
/// 2. pane_title 子串匹配
#[cfg(target_os = "windows")]
fn find_matching_wt_tab(
    tabs: &[WtTabSnapshot],
    cwd: Option<&str>,
    pane_title: Option<&str>,
) -> Option<WtTabSnapshot> {
    // Pass 1: CWD 匹配
    if let Some(cwd) = cwd {
        // 去掉末尾分隔符做标准化比较
        let cwd_normalized = cwd.trim_end_matches('/').trim_end_matches('\\');
        for tab in tabs {
            if let Some(ref tab_cwd) = tab.working_directory {
                let tab_cwd_normalized = tab_cwd.trim_end_matches('/').trim_end_matches('\\');
                if tab_cwd_normalized.eq_ignore_ascii_case(cwd_normalized) {
                    return Some(tab.clone());
                }
            }
        }
    }

    // Pass 2: pane_title 子串匹配
    if let Some(title) = pane_title {
        let title_lower = title.to_lowercase();
        for tab in tabs {
            if tab.title.to_lowercase().contains(&title_lower) {
                return Some(tab.clone());
            }
        }
    }

    None
}

/// 在 WezTermPaneSnapshot 列表中查找匹配的 pane
#[cfg(target_os = "windows")]
fn find_matching_wezterm_pane(
    panes: &[WezTermPaneSnapshot],
    cwd: Option<&str>,
) -> Option<WezTermPaneSnapshot> {
    if let Some(cwd) = cwd {
        let cwd_normalized = cwd.trim_end_matches('/').trim_end_matches('\\');
        for pane in panes {
            if let Some(ref pane_cwd) = pane.cwd {
                let pane_cwd_normalized = pane_cwd.trim_end_matches('/').trim_end_matches('\\');
                if pane_cwd_normalized.eq_ignore_ascii_case(cwd_normalized) {
                    return Some(pane.clone());
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn find_matching_wt_tab(
    _tabs: &[WtTabSnapshot],
    _cwd: Option<&str>,
    _pane_title: Option<&str>,
) -> Option<WtTabSnapshot> {
    None
}

#[cfg(not(target_os = "windows"))]
fn find_matching_wezterm_pane(
    _panes: &[WezTermPaneSnapshot],
    _cwd: Option<&str>,
) -> Option<WezTermPaneSnapshot> {
    None
}

/// 从 exe 名探测终端类型（v1 兼容层）
///
/// 用于进程树探测后的初始识别，返回 (terminal_app, terminal_pid)。
#[cfg(target_os = "windows")]
pub fn detect_terminal_app(pid: u32) -> (Option<String>, Option<u32>) {
    detect_terminal_app_inner(pid)
        .map(|(app, p)| (Some(app), Some(p)))
        .unwrap_or((None, None))
}

#[cfg(target_os = "windows")]
fn detect_terminal_app_inner(pid: u32) -> Option<(String, u32)> {
    use windows::Win32::System::Diagnostics::ToolHelp::*;

    let parent_pid = unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            let mut found = None;
            loop {
                if entry.th32ProcessID == pid {
                    found = Some(entry.th32ParentProcessID);
                    break;
                }
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
            found
        } else {
            None
        }
    };

    let mut current_pid = parent_pid?;
    for _ in 0..10 {
        if current_pid == 0 {
            break;
        }

        // 获取进程名
        let exe_name = unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                let mut found = None;
                loop {
                    if entry.th32ProcessID == current_pid {
                        found = Some(String::from_utf16_lossy(
                            &entry.szExeFile.iter()
                                .take_while(|&&c| c != 0)
                                .copied()
                                .collect::<Vec<u16>>()
                        ));
                        break;
                    }
                    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
                found
            } else {
                None
            }
        };

        if let Some(name) = exe_name {
            if let Some(desc) = crate::terminal_jump::registry::find_by_exe_name(&name) {
                let app = match desc.id {
                    "windows-terminal" => "WindowsTerminal".to_string(),
                    _ => desc.display_name.to_string(),
                };
                return Some((app, current_pid));
            }
        }

        // 继续向上走进程树
        current_pid = unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                let mut found = None;
                loop {
                    if entry.th32ProcessID == current_pid {
                        found = Some(entry.th32ParentProcessID);
                        break;
                    }
                    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
                found
            } else {
                None
            }
        }?;
    }

    None
}

#[cfg(not(target_os = "windows"))]
pub fn detect_terminal_app(_pid: u32) -> (Option<String>, Option<u32>) {
    (None, None)
}
