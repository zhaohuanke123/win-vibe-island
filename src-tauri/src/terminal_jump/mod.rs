//! Terminal Jump V2 — Resolver / Service 分离架构
//!
//! 对齐 Open Island 的 TerminalJumpService + TerminalJumpTargetResolver 架构，
//! 为 win-vibe-island 提供 Windows 平台的精准终端跳转方案。
//!
//! ## 模块结构
//!
//! - [`registry`]    — 已知终端注册表（KNOWN_TERMINALS）
//! - [`snapshot`]    — 终端快照结构体（WtTabSnapshot / WorkspaceSnapshot / TerminalSnapshot）
//! - [`strategies`]  — 聚焦策略 trait 及各终端实现
//! - [`resolver`]    — TerminalJumpTargetResolver（探测活跃终端，产出精确 JumpTarget）
//! - [`service`]     — TerminalJumpService（接收 JumpTarget，执行聚焦）
//!
//! ## 数据流
//!
//! ```text
//! 进程树探测 → 注册表匹配 → Resolver 探测 → 多轮匹配 → JumpTarget
//!                                                              ↓
//!                                             用户点击跳转 → Service 聚焦
//! ```

pub mod registry;
pub mod snapshot;
pub mod strategies;
pub mod resolver;
pub mod service;

// 向后兼容：从 window_focus.rs 重导出公共 API
// 这些将在后续版本中标记 #[deprecated]
pub use strategies::JumpResult;
pub use service::{jump_to, jump_to_session};
