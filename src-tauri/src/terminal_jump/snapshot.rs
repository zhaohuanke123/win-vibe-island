//! 终端快照结构体
//!
//! 对齐 Open Island 的 GhosttyTerminalSnapshot / WeztermFamilySnapshot 等，
//! 用于 Resolver 探测终端后产出中间数据。

use serde::{Deserialize, Serialize};

/// Windows Terminal tab 快照
///
/// 由 `wt.exe list-tabs --format json` 输出解析而来。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WtTabSnapshot {
    /// Windows Terminal 内部 tab ID（GUID 字符串）
    pub tab_id: String,
    /// tab 索引（从 0 开始）
    pub tab_index: u32,
    /// tab 标题
    pub title: String,
    /// pane CWD
    pub working_directory: Option<String>,
}

/// Workspace 客户端快照（VS Code / Cursor / Windsurf）
///
/// 由窗口标题枚举或 CLI 探测得到。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    /// workspace 路径
    pub workspace_path: String,
    /// 窗口标题
    pub window_title: String,
}

/// 通用终端快照（用于 PID → 窗口信息）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSnapshot {
    /// 进程 PID
    pub pid: u32,
    /// 进程 exe 名
    pub exe_name: String,
    /// 窗口标题
    pub window_title: String,
    /// 工作目录（如可探测）
    pub working_directory: Option<String>,
}

/// WezTerm pane 快照
///
/// 由 `wezterm cli list --format json` 输出解析而来。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermPaneSnapshot {
    /// pane ID
    pub pane_id: u32,
    /// pane 标题
    pub title: String,
    /// pane CWD
    pub cwd: Option<String>,
    /// TTY 设备名
    pub tty: Option<String>,
}
