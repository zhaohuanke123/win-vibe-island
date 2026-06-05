//! Agent 事件适配器 — 将各 AI 编程助手的原始事件格式转换为统一的 AgentEvent 枚举。
//! 每个 agent（Claude Code、Codex 等）有自己的 adapter 实现。

pub mod claude_adapter;
pub mod codex_adapter;

use crate::agent_event::AgentEvent;

/// Hook 适配器分发 — 根据 agent 类型将 payload 路由到正确的 adapter。
///
/// 将 `if is_codex { CodexAdapter::xxx } else { ClaudeCodeAdapter::xxx }` 模式
/// 集中到一处，避免在 pipe_server 中重复分支判断。
/// 使用 enum 而非 trait：2 变体零开销、编译器强制穷举、扩展新 agent 时编译器会报错提示补全。
pub enum HookAdapter {
    ClaudeCode,
    Codex,
}

impl HookAdapter {
    /// 从检测到的 agent_type 字符串构造适配器
    pub fn from_agent_type(agent_type: &str) -> Self {
        match agent_type {
            "codex" => HookAdapter::Codex,
            _ => HookAdapter::ClaudeCode,
        }
    }

    /// SessionStart → SessionStarted
    pub fn to_session_started(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_session_started(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_session_started(payload)
            }
        }
    }

    /// PreToolUse → ToolUseStarted
    pub fn to_tool_use_started(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_tool_use_started(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_tool_use_started(payload)
            }
        }
    }

    /// Running/Thinking → ActivityUpdated(Running)
    pub fn to_thinking_updated(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_running_updated(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_thinking_updated(payload)
            }
        }
    }

    /// PostToolUse → ToolUseCompleted
    pub fn to_tool_use_completed(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_tool_use_completed(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_tool_use_completed(payload)
            }
        }
    }

    /// PermissionRequest → PermissionRequested
    pub fn to_permission_requested(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_permission_requested(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_permission_requested(payload)
            }
        }
    }

    /// Stop → SessionCompleted
    pub fn to_session_completed(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_session_completed(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_session_completed(payload)
            }
        }
    }

    /// UserPromptSubmit → ActivityUpdated(Running)
    pub fn to_user_prompt_submit(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_user_prompt_submit(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_user_prompt_submit(payload)
            }
        }
    }

    /// Notification → ActivityUpdated
    pub fn to_notification_updated(&self, payload: &serde_json::Value) -> AgentEvent {
        match self {
            HookAdapter::Codex => codex_adapter::CodexAdapter::to_notification_updated(payload),
            HookAdapter::ClaudeCode => {
                claude_adapter::ClaudeCodeAdapter::to_notification_updated(payload)
            }
        }
    }
}
