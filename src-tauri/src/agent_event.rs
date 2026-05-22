//! Unified Agent Event Model
//!
//! All AI coding agents (Claude Code, Codex, Cursor, OpenCode, etc.) emit events
//! through this single enum. Each agent has an adapter that converts its native
//! hook/signal format into AgentEvent variants.
//!
//! Design inspired by Open Island's AgentEvent enum pattern.

use serde::{Deserialize, Serialize};

// ─── Event Type Tag ──────────────────────────────────────────────────────────

/// Discriminant for the tagged union JSON representation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentEventType {
    SessionStarted,
    ActivityUpdated,
    PermissionRequested,
    QuestionAsked,
    SessionCompleted,
    ToolUseStarted,
    ToolUseCompleted,
    JumpTargetUpdated,
    ErrorOccurred,
}

// ─── Payload Structs ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartedPayload {
    pub session_id: String,
    pub title: String,
    pub agent: AgentTool,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub origin: Option<SessionOrigin>,
    pub jump_target: Option<JumpTarget>,
    pub timestamp: i64,
    /// Whether the session is from a remote/SSH source
    #[serde(default)]
    pub is_remote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityUpdatedPayload {
    pub session_id: String,
    pub summary: String,
    pub phase: SessionPhase,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    /// User prompt text (set by UserPromptSubmit hook)
    pub prompt: Option<String>,
    /// Session title from transcript JSONL (custom-title / ai-title)
    pub title: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequestPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub description: Option<String>,
    /// Risk classification: "low", "medium", "high"
    pub risk: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAskedPayload {
    pub session_id: String,
    pub question_text: String,
    pub options: Option<Vec<QuestionOption>>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompletedPayload {
    pub session_id: String,
    pub summary: String,
    pub timestamp: i64,
    /// True if this is a full session end (vs. just a turn completion)
    #[serde(default)]
    pub is_session_end: bool,
    /// True if session was interrupted/errored
    #[serde(default)]
    pub is_interrupt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUseStartedPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUseCompletedPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    /// Whether the tool succeeded
    pub success: bool,
    /// Error message if failed
    pub error: Option<String>,
    /// Execution duration in milliseconds
    pub duration_ms: Option<u64>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpTargetPayload {
    pub session_id: String,
    pub jump_target: JumpTarget,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorOccurredPayload {
    pub session_id: String,
    pub error_type: String,
    pub message: String,
    pub timestamp: i64,
}

// ─── Supporting Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentTool {
    #[serde(rename = "claudeCode")]
    ClaudeCode,
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "openCode")]
    OpenCode,
    #[serde(rename = "cursor")]
    Cursor,
    #[serde(rename = "geminiCli")]
    GeminiCli,
    #[serde(rename = "kimiCli")]
    KimiCli,
    #[serde(rename = "qwenCode")]
    QwenCode,
    #[serde(rename = "codeBuddy")]
    CodeBuddy,
    #[serde(rename = "qoder")]
    Qoder,
    #[serde(rename = "factory")]
    Factory,
    /// Fallback for unknown agents
    #[serde(rename = "unknown")]
    Unknown,
}

impl AgentTool {
    pub fn display_name(&self) -> &str {
        match self {
            AgentTool::ClaudeCode => "Claude Code",
            AgentTool::Codex => "Codex",
            AgentTool::OpenCode => "OpenCode",
            AgentTool::Cursor => "Cursor",
            AgentTool::GeminiCli => "Gemini CLI",
            AgentTool::KimiCli => "Kimi CLI",
            AgentTool::QwenCode => "Qwen Code",
            AgentTool::CodeBuddy => "CodeBuddy",
            AgentTool::Qoder => "Qoder",
            AgentTool::Factory => "Factory",
            AgentTool::Unknown => "Unknown Agent",
        }
    }

    /// Detect the agent type from a process name or CLI binary name.
    pub fn from_process_name(name: &str) -> Self {
        let lower = name.to_lowercase().replace(".exe", "");
        match lower.as_str() {
            "claude" => AgentTool::ClaudeCode,
            "codex" => AgentTool::Codex,
            "opencode" => AgentTool::OpenCode,
            "cursor" => AgentTool::Cursor,
            "gemini" => AgentTool::GeminiCli,
            "kimi" => AgentTool::KimiCli,
            "qwen" => AgentTool::QwenCode,
            "codebuddy" => AgentTool::CodeBuddy,
            "qoder" => AgentTool::Qoder,
            "droid" => AgentTool::Factory,
            _ => {
                if lower.contains("claude") { AgentTool::ClaudeCode }
                else if lower.contains("codex") { AgentTool::Codex }
                else { AgentTool::Unknown }
            }
        }
    }
}

impl std::fmt::Display for AgentTool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionPhase {
    /// Agent is actively processing/running (maps old: thinking, running, streaming)
    Running,
    /// Agent needs permission approval from user
    WaitingForApproval,
    /// Agent is waiting for user answer to a question
    WaitingForAnswer,
    /// Session has completed (maps old: done, error — check is_error for distinction)
    Completed,
}

impl SessionPhase {
    pub fn requires_attention(&self) -> bool {
        matches!(self, SessionPhase::WaitingForApproval | SessionPhase::WaitingForAnswer)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionOrigin {
    Hook,
    Transcript,
    ProcessDetection,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpTarget {
    // ── 语义字段（对齐 Open Island）──
    /// 终端应用名，如 "WindowsTerminal", "VSCode", "Cursor"
    #[serde(alias = "terminalType")]
    pub terminal_app: Option<String>,
    /// 工作区文件夹名（从 CWD 提取）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
    /// pane/tab 标题（用于标题匹配）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pane_title: Option<String>,
    /// 完整 CWD 路径
    #[serde(alias = "workspacePath", default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<String>,
    /// 终端 session/tab ID（Windows Terminal tab index 等）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_session_id: Option<String>,

    // ── Windows 平台扩展 ──
    /// 进程 PID（Windows 特有，v1 保留）
    pub pid: Option<u32>,
    /// Windows Terminal tab index（wt.exe focus-tab 用）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_tab_index: Option<u32>,
    /// Windows Terminal tab ID（wt.exe --target 用，更稳定）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_tab_id: Option<String>,

    // ── 扩展字段（向前兼容）──
    /// 类型特定元数据
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

impl JumpTarget {
    /// 从 v1 风格字段构建 v2 JumpTarget
    ///
    /// 用于兼容旧代码仍然使用 `terminal_type` / `workspace_path` / `window_title` 的场景。
    pub fn from_v1(
        terminal_type: Option<String>,
        pid: Option<u32>,
        workspace_path: Option<String>,
        window_title: Option<String>,
        extra: Option<serde_json::Value>,
    ) -> Self {
        // 从 workspace_path 提取 workspace_name
        let workspace_name = workspace_path.as_ref().and_then(|p| {
            p.rsplit(|c: char| c == '/' || c == '\\')
                .find(|s| !s.is_empty())
                .map(String::from)
        });

        // 从 extra.tabId 提升为一级字段
        let terminal_tab_id = extra
            .as_ref()
            .and_then(|e| e.get("tabId"))
            .and_then(|v| v.as_str())
            .map(String::from);

        // 从 extra.terminalPid 合并到 pid
        let pid = pid.or_else(|| {
            extra
                .as_ref()
                .and_then(|e| e.get("terminalPid"))
                .and_then(|v| v.as_u64())
                .map(|v| v as u32)
        });

        // 规范化 terminal_app 名称
        let terminal_app = terminal_type.map(|t| match t.as_str() {
            "windowsTerminal" => "WindowsTerminal".into(),
            other => other.into(),
        });

        JumpTarget {
            terminal_app,
            workspace_name,
            pane_title: window_title,
            working_directory: workspace_path,
            terminal_session_id: None,
            pid,
            terminal_tab_index: None,
            terminal_tab_id,
            extra,
        }
    }
}

// ─── Main Enum ───────────────────────────────────────────────────────────────

/// The unified agent event.
///
/// Serialized as a tagged JSON object:
/// ```json
/// {"type": "sessionStarted", "sessionStarted": {...}}
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
    SessionStarted(SessionStartedPayload),
    ActivityUpdated(ActivityUpdatedPayload),
    PermissionRequested(PermissionRequestPayload),
    QuestionAsked(QuestionAskedPayload),
    SessionCompleted(SessionCompletedPayload),
    ToolUseStarted(ToolUseStartedPayload),
    ToolUseCompleted(ToolUseCompletedPayload),
    JumpTargetUpdated(JumpTargetPayload),
    ErrorOccurred(ErrorOccurredPayload),
}

impl AgentEvent {
    /// Get the session_id for this event (all variants have one)
    pub fn session_id(&self) -> &str {
        match self {
            AgentEvent::SessionStarted(p) => &p.session_id,
            AgentEvent::ActivityUpdated(p) => &p.session_id,
            AgentEvent::PermissionRequested(p) => &p.session_id,
            AgentEvent::QuestionAsked(p) => &p.session_id,
            AgentEvent::SessionCompleted(p) => &p.session_id,
            AgentEvent::ToolUseStarted(p) => &p.session_id,
            AgentEvent::ToolUseCompleted(p) => &p.session_id,
            AgentEvent::JumpTargetUpdated(p) => &p.session_id,
            AgentEvent::ErrorOccurred(p) => &p.session_id,
        }
    }

    /// Get the event type tag
    pub fn event_type(&self) -> AgentEventType {
        match self {
            AgentEvent::SessionStarted(_) => AgentEventType::SessionStarted,
            AgentEvent::ActivityUpdated(_) => AgentEventType::ActivityUpdated,
            AgentEvent::PermissionRequested(_) => AgentEventType::PermissionRequested,
            AgentEvent::QuestionAsked(_) => AgentEventType::QuestionAsked,
            AgentEvent::SessionCompleted(_) => AgentEventType::SessionCompleted,
            AgentEvent::ToolUseStarted(_) => AgentEventType::ToolUseStarted,
            AgentEvent::ToolUseCompleted(_) => AgentEventType::ToolUseCompleted,
            AgentEvent::JumpTargetUpdated(_) => AgentEventType::JumpTargetUpdated,
            AgentEvent::ErrorOccurred(_) => AgentEventType::ErrorOccurred,
        }
    }

    /// The Tauri event name to emit
    pub fn tauri_event_name(&self) -> &str {
        "agent_event"
    }
}

// ─── Conversions from legacy types ───────────────────────────────────────────

impl From<SessionStartedPayload> for AgentEvent {
    fn from(p: SessionStartedPayload) -> Self {
        AgentEvent::SessionStarted(p)
    }
}

impl From<ActivityUpdatedPayload> for AgentEvent {
    fn from(p: ActivityUpdatedPayload) -> Self {
        AgentEvent::ActivityUpdated(p)
    }
}

impl From<SessionCompletedPayload> for AgentEvent {
    fn from(p: SessionCompletedPayload) -> Self {
        AgentEvent::SessionCompleted(p)
    }
}
