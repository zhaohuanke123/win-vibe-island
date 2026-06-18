//! Codex CLI Hook 适配器
//!
//! Codex command hooks 通过 `vibe-island-hooks.exe --source codex` 转发到
//! Named Pipe server。这里使用 `serde_json::Value` 接收原始 payload，避免
//! Codex hook schema 轻微变化时直接破坏 Overlay。
//!
//! ## 透传设计
//! Codex 的 hook payload 字段（`session_id`、`cwd`、`tool_name`、`tool_input`）
//! 与 Claude Code 高度重合，因此大部分方法直接委托给 `ClaudeCodeAdapter`。
//! 仅 `to_session_started` 传入 `AgentTool::Codex` 以区分 agent 类型。
//!
//! ## 被忽略的 Codex 特有字段
//! - `turn_id`：Codex turn 粒度 ID，Overlay 按 session 粒度显示，不需要
//! - `stop_hook_active`：标记 Stop hook 是否已被继续过，Overlay 不干预 stop 行为
//! - `last_assistant_message`：Stop/SubagentStop 中的最后一条消息，Overlay 用自有 summary
//! - `permission_mode`：当前权限模式（default/acceptEdits/plan 等），Overlay 不做权限管理
//! - `subagent_id`/`agent_type`：SubagentStart/SubagentStop 专用，当前未处理子 agent
//! - `trigger`：PreCompact/PostCompact 触发原因（manual/auto），当前未处理 compact 事件

use crate::adapters::claude_adapter::ClaudeCodeAdapter;
use crate::agent_event::*;

pub struct CodexAdapter;

impl CodexAdapter {
    /// SessionStart → SessionStarted，唯一传入 `AgentTool::Codex` 的方法。
    /// 忽略 `turn_id`（Overlay 不跟踪 turn 粒度）。
    pub fn to_session_started(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_session_started_with_agent(payload, AgentTool::Codex)
    }

    /// PreToolUse → ToolUseStarted，透传到 ClaudeCodeAdapter。
    pub fn to_tool_use_started(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_tool_use_started(payload)
    }

    /// Running → ActivityUpdated(Running)，映射到 Claude 的 thinking_updated。
    /// Codex 没有 "thinking" 概念，running 状态语义等价。
    pub fn to_running_updated(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_thinking_updated(payload)
    }

    /// PostToolUse → ToolUseCompleted，透传到 ClaudeCodeAdapter。
    pub fn to_tool_use_completed(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_tool_use_completed(payload)
    }

    /// PermissionRequest → PermissionRequested，透传到 ClaudeCodeAdapter。
    pub fn to_permission_requested(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_permission_requested(payload)
    }

    /// Stop → SessionCompleted，透传到 ClaudeCodeAdapter。
    /// 忽略 `last_assistant_message`、`stop_hook_active`（Overlay 用自有 summary 逻辑）。
    pub fn to_session_completed(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_session_completed(payload)
    }

    /// UserPromptSubmit → ActivityUpdated(Running)，透传到 ClaudeCodeAdapter。
    pub fn to_user_prompt_submit(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_user_prompt_submit(payload)
    }

    /// Notification → ActivityUpdated，透传到 ClaudeCodeAdapter。
    pub fn to_notification_updated(payload: &serde_json::Value) -> AgentEvent {
        ClaudeCodeAdapter::to_notification_updated(payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codex_session_started_maps_agent() {
        let payload = serde_json::json!({
            "session_id": "codex-session",
            "cwd": "C:/work/win-vibe-island",
            "model": "gpt-5-codex",
            "agent_type": "codex"
        });

        let event = CodexAdapter::to_session_started(&payload);
        match event {
            AgentEvent::SessionStarted(p) => {
                assert_eq!(p.session_id, "codex-session");
                assert_eq!(p.title, "win-vibe-island");
                assert_eq!(p.agent, AgentTool::Codex);
                assert_eq!(p.cwd.as_deref(), Some("C:/work/win-vibe-island"));
                assert_eq!(p.model.as_deref(), Some("gpt-5-codex"));
            }
            _ => panic!("expected session started"),
        }
    }

    #[test]
    fn test_codex_user_prompt_maps_prompt() {
        let payload = serde_json::json!({
            "session_id": "codex-session",
            "prompt": "implement codex hook support"
        });

        let event = CodexAdapter::to_user_prompt_submit(&payload);
        match event {
            AgentEvent::ActivityUpdated(p) => {
                assert_eq!(p.session_id, "codex-session");
                assert_eq!(p.phase, SessionPhase::Running);
                assert_eq!(p.prompt.as_deref(), Some("implement codex hook support"));
            }
            _ => panic!("expected activity updated"),
        }
    }
}
