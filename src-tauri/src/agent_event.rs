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
pub struct QuestionAskedPayload {
    pub session_id: String,
    pub question_text: String,
    pub options: Option<Vec<String>>,
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
            AgentTool::Unknown => "Unknown Agent",
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
    /// Agent is actively processing/running
    Running,
    /// Agent is thinking (before tool execution)
    Thinking,
    /// Agent is idle/waiting for user input
    Idle,
    /// Agent needs user attention (permission or question)
    RequiresAttention,
    /// Session has completed
    Completed,
    /// Session encountered an error
    Error,
}

impl SessionPhase {
    pub fn requires_attention(&self) -> bool {
        matches!(self, SessionPhase::RequiresAttention)
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
    /// Type of terminal/IDE
    pub terminal_type: Option<String>,
    /// Process ID of the terminal
    pub pid: Option<u32>,
    /// Workspace path for IDE jump-back
    pub workspace_path: Option<String>,
    /// Window title for matching
    pub window_title: Option<String>,
    /// Additional type-specific info
    pub extra: Option<serde_json::Value>,
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
