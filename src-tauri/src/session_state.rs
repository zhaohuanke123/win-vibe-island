//! Session State — Pure Reducer
//!
//! Single source of truth for all agent sessions. Every state mutation flows
//! through `apply(event)`. After applying, a Tauri `agent_event` is emitted so
//! the frontend stays in sync.
//!
//! Design per `docs/open-island-alignment-prd.md §1.2`.

use crate::agent_event::*;
use crate::agent_session::*;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

// ─── SessionState ────────────────────────────────────────────────────────────

pub struct SessionState {
    sessions: HashMap<String, AgentSession>,
    app_handle: AppHandle,
}

impl SessionState {
    pub fn new(app_handle: AppHandle) -> Self {
        SessionState {
            sessions: HashMap::new(),
            app_handle,
        }
    }

    /// Immutable snapshot of all sessions.
    pub fn sessions(&self) -> &HashMap<String, AgentSession> {
        &self.sessions
    }

    /// Look up a session by id.
    pub fn get(&self, session_id: &str) -> Option<&AgentSession> {
        self.sessions.get(session_id)
    }

    // ── apply (main reducer) ─────────────────────────────────────────────

    /// Pure reducer: apply an `AgentEvent`, mutate internal state, then emit
    /// the event to the frontend so it can mirror the change.
    pub fn apply(&mut self, event: &AgentEvent) {
        match event {
            AgentEvent::SessionStarted(p) => self.on_session_started(p),
            AgentEvent::ActivityUpdated(p) => self.on_activity_updated(p),
            AgentEvent::PermissionRequested(p) => self.on_permission_requested(p),
            AgentEvent::QuestionAsked(p) => self.on_question_asked(p),
            AgentEvent::SessionCompleted(p) => self.on_session_completed(p),
            AgentEvent::ToolUseStarted(p) => self.on_tool_use_started(p),
            AgentEvent::ToolUseCompleted(p) => self.on_tool_use_completed(p),
            AgentEvent::JumpTargetUpdated(p) => self.on_jump_target_updated(p),
            AgentEvent::ErrorOccurred(p) => self.on_error_occurred(p),
        }

        // Notify frontend of the state change.
        let _ = self.app_handle.emit("agent_event", event);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    /// Get or lazily create a session so that events arriving before
    /// SessionStarted still produce visible state (defensive).
    fn get_or_create(&mut self, id: &str, ts: i64) -> &mut AgentSession {
        if !self.sessions.contains_key(id) {
            let label = path_label(id);
            let session = AgentSession::new(id.to_string(), label, AgentTool::Unknown, ts);
            self.sessions.insert(id.to_string(), session);
            log::debug!("SessionState: implicit session created id={}", id);
        }
        self.sessions.get_mut(id).unwrap()
    }

    // ── per-variant handlers ─────────────────────────────────────────────

    fn on_session_started(&mut self, p: &SessionStartedPayload) {
        if let Some(existing) = self.sessions.get_mut(&p.session_id) {
            // Resume / refresh
            existing.label = p.title.clone();
            existing.cwd = p.cwd.clone();
            existing.agent = p.agent.clone();
            existing.model = p.model.clone();
            existing.origin = p.origin.clone();
            existing.jump_target = p.jump_target.clone();
            existing.last_activity = p.timestamp;
            existing.is_remote = p.is_remote;
            existing.is_completed = false;
            existing.is_interrupted = false;
            existing.phase = SessionPhase::Idle;
        } else {
            let mut session = AgentSession::new(
                p.session_id.clone(),
                p.title.clone(),
                p.agent.clone(),
                p.timestamp,
            );
            session.cwd = p.cwd.clone();
            session.model = p.model.clone();
            session.origin = p.origin.clone();
            session.jump_target = p.jump_target.clone();
            session.is_remote = p.is_remote;
            self.sessions.insert(p.session_id.clone(), session);
        }
    }

    fn on_activity_updated(&mut self, p: &ActivityUpdatedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = p.phase.clone();
        s.last_activity = p.timestamp;
        if let Some(ref tn) = p.tool_name {
            s.tool_name = Some(tn.clone());
        }
        if let Some(ref ti) = p.tool_input {
            s.tool_input = Some(ti.clone());
        }
    }

    fn on_permission_requested(&mut self, p: &PermissionRequestPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::RequiresAttention;
        s.last_activity = p.timestamp;
        s.tool_name = Some(p.tool_name.clone());
        s.tool_input = Some(p.tool_input.clone());
    }

    fn on_question_asked(&mut self, p: &QuestionAskedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::RequiresAttention;
        s.last_activity = p.timestamp;
    }

    fn on_session_completed(&mut self, p: &SessionCompletedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::Completed;
        s.is_completed = true;
        s.is_interrupted = p.is_interrupt;
        s.last_activity = p.timestamp;
    }

    fn on_tool_use_started(&mut self, p: &ToolUseStartedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::Running;
        s.last_activity = p.timestamp;
        s.tool_name = Some(p.tool_name.clone());
        s.tool_input = Some(p.tool_input.clone());
        s.current_tool = Some(CurrentTool {
            name: p.tool_name.clone(),
            input: p.tool_input.clone(),
            tool_use_id: p.tool_use_id.clone(),
            start_time: p.timestamp,
        });
    }

    fn on_tool_use_completed(&mut self, p: &ToolUseCompletedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.last_activity = p.timestamp;

        // Clear current tool only if the ids match.
        if s.current_tool
            .as_ref()
            .map_or(false, |ct| ct.tool_use_id == p.tool_use_id)
        {
            s.current_tool = None;
        }

        s.add_tool_to_history(ToolHistoryEntry {
            id: p.tool_use_id.clone(),
            tool_name: p.tool_name.clone(),
            input: serde_json::Value::Null,
            success: p.success,
            error: p.error.clone(),
            duration_ms: p.duration_ms,
            timestamp: p.timestamp,
        });

        if !p.success {
            s.phase = SessionPhase::Error;
            s.last_error = p.error.clone();
        }
    }

    fn on_jump_target_updated(&mut self, p: &JumpTargetPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.jump_target = Some(p.jump_target.clone());
        s.last_activity = p.timestamp;
    }

    fn on_error_occurred(&mut self, p: &ErrorOccurredPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::Error;
        s.last_error = Some(p.message.clone());
        s.last_activity = p.timestamp;
    }
}

// ─── Free helpers ────────────────────────────────────────────────────────────

/// Produce a human label from a path-like id.
fn path_label(id: &str) -> String {
    if id.contains('/') || id.contains('\\') {
        std::path::Path::new(id)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| id.to_string())
    } else {
        format!("session-{}", &id[..id.len().min(8)])
    }
}

// ─── Thread-safe wrapper ─────────────────────────────────────────────────────

/// Global session state, shared between hook_server and any future event sources.
pub struct SharedSessionState(pub Arc<Mutex<SessionState>>);

impl SharedSessionState {
    pub fn new(app_handle: AppHandle) -> Self {
        SharedSessionState(Arc::new(Mutex::new(SessionState::new(app_handle))))
    }
}

// ─── Global singleton (initialized once during app startup) ──────────────────

static GLOBAL_SESSION_STATE: Mutex<Option<Arc<Mutex<SessionState>>>> = Mutex::new(None);

/// Called once during app setup.
pub fn init(app_handle: AppHandle) {
    let mut guard = GLOBAL_SESSION_STATE.lock();
    *guard = Some(Arc::new(Mutex::new(SessionState::new(app_handle))));
    log::info!("SessionState initialized");
}

/// Apply an event to the global session state. No-op if not yet initialized.
pub fn apply_event(event: &AgentEvent) {
    let guard = GLOBAL_SESSION_STATE.lock();
    if let Some(ref arc) = *guard {
        arc.lock().apply(event);
    }
}
