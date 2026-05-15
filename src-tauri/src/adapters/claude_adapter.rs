//! Claude Code Hook Adapter
//!
//! Converts Claude Code's HTTP hook JSON payloads into unified AgentEvent variants.
//! Accepts raw `serde_json::Value` to work with any payload format (hook_server's
//! HookPayload, pipe data, or test fixtures).

use crate::agent_event::*;
use std::time::{SystemTime, UNIX_EPOCH};

/// Adapter that converts Claude Code hook payloads to AgentEvent.
pub struct ClaudeCodeAdapter;

impl ClaudeCodeAdapter {
    fn now_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    fn get_str(payload: &serde_json::Value, key: &str) -> Option<String> {
        payload.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
    }

    /// Extract session_id from payload
    pub fn extract_session_id(payload: &serde_json::Value) -> String {
        if let Some(sid) = Self::get_str(payload, "session_id") {
            if !sid.is_empty() {
                return sid;
            }
        }
        if let Some(tp) = Self::get_str(payload, "transcript_path") {
            return std::path::Path::new(&tp)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
        }
        "unknown".to_string()
    }

    /// Extract a human-readable session label from cwd
    pub fn extract_label(payload: &serde_json::Value) -> String {
        if let Some(cwd) = Self::get_str(payload, "cwd") {
            std::path::Path::new(&cwd)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(cwd)
        } else {
            "unknown".to_string()
        }
    }

    /// Convert a SessionStart hook to AgentEvent
    pub fn to_session_started(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);
        let title = Self::extract_label(payload);

        AgentEvent::SessionStarted(SessionStartedPayload {
            session_id,
            title,
            agent: AgentTool::ClaudeCode,
            cwd: Self::get_str(payload, "cwd"),
            model: Self::get_str(payload, "model"),
            origin: Some(SessionOrigin::Hook),
            jump_target: None,
            timestamp: Self::now_ms(),
            is_remote: false,
        })
    }

    /// Convert a PreToolUse hook to ToolUseStarted
    pub fn to_tool_use_started(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);
        let tool_use_id = Self::get_str(payload, "tool_use_id")
            .unwrap_or_else(|| format!("{}-tool", session_id));
        let tool_name = Self::get_str(payload, "tool_name").unwrap_or_else(|| "unknown".into());
        let tool_input = payload.get("tool_input").cloned().unwrap_or(serde_json::Value::Null);

        AgentEvent::ToolUseStarted(ToolUseStartedPayload {
            session_id,
            tool_use_id,
            tool_name,
            tool_input,
            timestamp: Self::now_ms(),
        })
    }

    /// Convert a PreToolUse hook to ActivityUpdated (thinking phase)
    pub fn to_thinking_updated(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);
        let tool_name = Self::get_str(payload, "tool_name");

        AgentEvent::ActivityUpdated(ActivityUpdatedPayload {
            session_id,
            summary: format!("Running {}", tool_name.as_deref().unwrap_or("tool")),
            phase: SessionPhase::Thinking,
            tool_name,
            tool_input: payload.get("tool_input").cloned(),
            timestamp: Self::now_ms(),
        })
    }

    /// Convert a PostToolUse hook to ToolUseCompleted
    pub fn to_tool_use_completed(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);
        let success = payload.get("error").is_none();
        let tool_use_id = Self::get_str(payload, "tool_use_id")
            .unwrap_or_else(|| format!("{}-tool", session_id));

        AgentEvent::ToolUseCompleted(ToolUseCompletedPayload {
            session_id,
            tool_use_id,
            tool_name: Self::get_str(payload, "tool_name").unwrap_or_else(|| "unknown".into()),
            success,
            error: Self::get_str(payload, "error"),
            duration_ms: payload.get("duration_ms").and_then(|v| v.as_u64()),
            timestamp: Self::now_ms(),
        })
    }

    /// Convert a PermissionRequest hook to AgentEvent
    pub fn to_permission_requested(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);
        let suggestions = payload.get("permission_suggestions").and_then(|v| v.as_array());

        let (tool_use_id, tool_name, tool_input, description) = if let Some(suggestions) = suggestions {
            suggestions.first()
                .map(|s| {
                    (
                        Self::get_str(s, "tool_use_id").unwrap_or_default(),
                        Self::get_str(s, "tool_name").unwrap_or_else(|| "unknown".into()),
                        s.get("tool_input").cloned().unwrap_or(serde_json::Value::Null),
                        Self::get_str(s, "description"),
                    )
                })
                .unwrap_or_else(|| {
                    (
                        String::new(),
                        Self::get_str(payload, "tool_name").unwrap_or_else(|| "unknown".into()),
                        payload.get("tool_input").cloned().unwrap_or(serde_json::Value::Null),
                        Self::get_str(payload, "message"),
                    )
                })
        } else {
            (
                String::new(),
                Self::get_str(payload, "tool_name").unwrap_or_else(|| "unknown".into()),
                payload.get("tool_input").cloned().unwrap_or(serde_json::Value::Null),
                Self::get_str(payload, "message"),
            )
        };

        AgentEvent::PermissionRequested(PermissionRequestPayload {
            session_id,
            tool_use_id,
            tool_name,
            tool_input,
            description,
            risk: None,
            timestamp: Self::now_ms(),
        })
    }

    /// Convert a Stop hook to SessionCompleted
    pub fn to_session_completed(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);

        AgentEvent::SessionCompleted(SessionCompletedPayload {
            session_id,
            summary: Self::get_str(payload, "reason").unwrap_or_else(|| "completed".into()),
            timestamp: Self::now_ms(),
            is_session_end: false,
            is_interrupt: false,
        })
    }

    /// Convert a UserPromptSubmit hook to ActivityUpdated
    pub fn to_user_prompt_submit(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);

        AgentEvent::ActivityUpdated(ActivityUpdatedPayload {
            session_id,
            summary: Self::get_str(payload, "prompt").unwrap_or_else(|| "Prompt submitted".into()),
            phase: SessionPhase::Running,
            tool_name: None,
            tool_input: None,
            timestamp: Self::now_ms(),
        })
    }

    /// Convert a Notification hook to ActivityUpdated
    pub fn to_notification_updated(payload: &serde_json::Value) -> AgentEvent {
        let session_id = Self::extract_session_id(payload);

        AgentEvent::ActivityUpdated(ActivityUpdatedPayload {
            session_id,
            summary: Self::get_str(payload, "message").unwrap_or_else(|| "Needs attention".into()),
            phase: SessionPhase::RequiresAttention,
            tool_name: None,
            tool_input: None,
            timestamp: Self::now_ms(),
        })
    }
}
