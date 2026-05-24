//! Agent 事件适配器 — 将各 AI 编程助手的原始事件格式转换为统一的 AgentEvent 枚举。
//! 每个 agent（Claude Code、Codex 等）有自己的 adapter 实现。

//! Agent 事件适配器 — 将各 AI 编程助手的原始事件格式转换为统一的 AgentEvent 枚举。
//! 每个 agent（Claude Code、Codex 等）有自己的 adapter 实现。

pub mod claude_adapter;
