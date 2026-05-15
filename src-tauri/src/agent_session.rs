//! Agent Session Model
//!
//! Represents a single AI agent session. Aligned with the frontend `Session`
//! type in `frontend/src/store/sessions.ts` plus Rust-side metadata (agent,
//! phase, origin, jump_target).

use crate::agent_event::{AgentTool, JumpTarget, SessionOrigin, SessionPhase};
use serde::{Deserialize, Serialize};

/// Maximum number of tool history entries to retain per session.
const MAX_TOOL_HISTORY: usize = 20;

// ─── AgentSession ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    // ── Identity ──
    pub id: String,
    pub label: String,
    pub title: Option<String>,
    pub cwd: Option<String>,

    // ── Agent metadata ──
    pub agent: AgentTool,
    pub phase: SessionPhase,
    pub origin: Option<SessionOrigin>,
    pub jump_target: Option<JumpTarget>,
    pub model: Option<String>,
    pub source: Option<String>,
    pub pid: Option<u32>,
    pub is_remote: bool,

    // ── Lifecycle ──
    pub created_at: i64,
    pub last_activity: i64,
    pub is_completed: bool,
    pub is_interrupted: bool,

    // ── Current tool ──
    pub current_tool: Option<CurrentTool>,

    // ── Tool history (ring buffer, most recent last) ──
    pub tool_history: Vec<ToolHistoryEntry>,

    // ── Error ──
    pub last_error: Option<String>,

    // ── UI display ──
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,

    // ── User-defined tag ──
    pub tag: Option<String>,
}

impl AgentSession {
    pub fn new(id: String, label: String, agent: AgentTool, timestamp: i64) -> Self {
        AgentSession {
            id,
            label,
            title: None,
            cwd: None,
            agent,
            phase: SessionPhase::Idle,
            origin: None,
            jump_target: None,
            model: None,
            source: None,
            pid: None,
            is_remote: false,
            created_at: timestamp,
            last_activity: timestamp,
            is_completed: false,
            is_interrupted: false,
            current_tool: None,
            tool_history: Vec::new(),
            last_error: None,
            tool_name: None,
            tool_input: None,
            tag: None,
        }
    }

    /// Push a tool history entry; evict oldest when over the cap.
    pub fn add_tool_to_history(&mut self, entry: ToolHistoryEntry) {
        self.tool_history.push(entry);
        while self.tool_history.len() > MAX_TOOL_HISTORY {
            self.tool_history.remove(0);
        }
    }
}

// ─── Nested types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentTool {
    pub name: String,
    pub input: serde_json::Value,
    pub tool_use_id: String,
    pub start_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolHistoryEntry {
    pub id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
    pub success: bool,
    pub error: Option<String>,
    pub duration_ms: Option<u64>,
    pub timestamp: i64,
}
