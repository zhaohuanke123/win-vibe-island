//! 终端注册表 — 已知终端应用的描述符
//!
//! 新增终端只需在 `KNOWN_TERMINALS` 中追加一项，无需修改 Resolver 或 Service 代码。

use serde::Serialize;

/// 终端应用描述符
#[derive(Debug, Clone)]
pub struct TerminalDescriptor {
    /// 显示名（如 "Windows Terminal", "VS Code"）
    pub display_name: &'static str,
    /// 规范化标识符（内部匹配用，如 "windows-terminal"）
    pub id: &'static str,
    /// 别名列表（用户可能使用的各种名称）
    pub aliases: &'static [&'static str],
    /// 进程名匹配（exe 文件名，小写）
    pub exe_names: &'static [&'static str],
    /// CLI 命令名（用于 workspace 跳转）
    pub cli_command: Option<&'static str>,
    /// 聚焦策略类型
    pub focus_strategy: FocusStrategyType,
}

/// 聚焦策略类型 — 决定 Service 如何聚焦到该终端
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum FocusStrategyType {
    /// wt.exe CLI 命令（Windows Terminal 专用）
    WindowsTerminal,
    /// workspace 标题匹配窗口（VS Code / Cursor / Windsurf）
    WorkspaceMatch,
    /// CLI 命令打开 workspace（code -r / cursor -r）
    CliOpenWorkspace,
    /// PID → EnumWindows → SetForegroundWindow（WezTerm / Alacritty / Tabby）
    PidFallback,
}

/// 已知终端注册表
///
/// 遍历此注册表动态分发，无需在 Resolver/Service 中硬编码终端类型。
pub static KNOWN_TERMINALS: &[TerminalDescriptor] = &[
    TerminalDescriptor {
        display_name: "Windows Terminal",
        id: "windows-terminal",
        aliases: &["wt", "windows-terminal", "windowsterminal", "terminal"],
        exe_names: &["windowsterminal.exe", "wt.exe"],
        cli_command: Some("wt"),
        focus_strategy: FocusStrategyType::WindowsTerminal,
    },
    TerminalDescriptor {
        display_name: "VS Code",
        id: "vscode",
        aliases: &["vscode", "code", "visual-studio-code"],
        exe_names: &["code.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "Cursor",
        id: "cursor",
        aliases: &["cursor"],
        exe_names: &["cursor.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "Windsurf",
        id: "windsurf",
        aliases: &["windsurf"],
        exe_names: &["windsurf.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "WezTerm",
        id: "wezterm",
        aliases: &["wezterm"],
        exe_names: &["wezterm.exe", "wezterm-gui.exe"],
        cli_command: Some("wezterm"),
        focus_strategy: FocusStrategyType::PidFallback,
    },
    TerminalDescriptor {
        display_name: "Alacritty",
        id: "alacritty",
        aliases: &["alacritty"],
        exe_names: &["alacritty.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::PidFallback,
    },
    TerminalDescriptor {
        display_name: "Tabby",
        id: "tabby",
        aliases: &["tabby", "tabby-terminal"],
        exe_names: &["tabby.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::PidFallback,
    },
];

/// 根据 exe 名查找终端描述符
///
/// 用于进程树探测后识别终端类型。
pub fn find_by_exe_name(exe_name: &str) -> Option<&'static TerminalDescriptor> {
    let lower = exe_name.to_lowercase();
    KNOWN_TERMINALS.iter().find(|desc| {
        desc.exe_names.iter().any(|name| name.to_lowercase() == lower)
    })
}

/// 根据 id 或 alias 查找终端描述符
///
/// 用于 JumpTarget 中的 `terminal_app` 字段匹配。
pub fn find_by_id_or_alias(name: &str) -> Option<&'static TerminalDescriptor> {
    let lower = name.to_lowercase();
    KNOWN_TERMINALS.iter().find(|desc| {
        desc.id == lower
        || desc.aliases.iter().any(|alias| *alias == lower)
        || desc.display_name.to_lowercase() == lower
    })
}
