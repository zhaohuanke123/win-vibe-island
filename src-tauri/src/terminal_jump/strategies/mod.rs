//! 聚焦策略模块
//!
//! 每个终端类型有对应的聚焦策略实现，通过 `FocusStrategy` trait 统一接口。
//! Service 遍历策略链尝试聚焦，逐级 fallback。

pub mod windows_terminal;
pub mod workspace_match;
pub mod cli_workspace;
pub mod pid_fallback;

use crate::agent_event::JumpTarget;
use serde::Serialize;

/// 聚焦操作结果
#[derive(Debug, Clone, Serialize)]
pub enum JumpResult {
    /// 精准定位成功 + 描述
    Success(String),
    /// 仅激活应用，未精准定位
    AppActivated(String),
    /// 找不到目标
    NotFound,
    /// 策略执行失败
    Failed(String),
}

/// 聚焦策略 trait
///
/// 每个策略检查 JumpTarget 是否适用自己，尝试聚焦后返回结果。
/// 返回 `None` 表示该策略不适用此目标（让下一个策略尝试）。
pub trait FocusStrategy: Send + Sync {
    /// 尝试聚焦，返回 `None` 表示不适用此目标
    fn try_focus(&self, target: &JumpTarget) -> Option<JumpResult>;
}
