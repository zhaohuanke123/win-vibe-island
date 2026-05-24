//! Tauri 事件发射 — 后端→前端的类型化事件推送。
//! 定义 SessionStart、SessionEnd、StateChange 等事件 payload 结构体，提供 `emit_*` 辅助函数通过 `AppHandle::emit()` 推送到前端。

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct SessionStart {
    pub session_id: String,
    pub label: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionEnd {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StateChange {
    pub session_id: String,
    pub state: String,
}

pub fn emit_session_start(app: &AppHandle, event: SessionStart) -> Result<(), String> {
    app.emit("session_start", &event)
        .map_err(|e| format!("Failed to emit session_start: {}", e))
}

pub fn emit_session_end(app: &AppHandle, event: SessionEnd) -> Result<(), String> {
    app.emit("session_end", &event)
        .map_err(|e| format!("Failed to emit session_end: {}", e))
}

pub fn emit_state_change(app: &AppHandle, event: StateChange) -> Result<(), String> {
    app.emit("state_change", &event)
        .map_err(|e| format!("Failed to emit state_change: {}", e))
}
