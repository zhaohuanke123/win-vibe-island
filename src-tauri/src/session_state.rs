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

    /// Insert a session directly (used by transcript discovery to fill gaps).
    pub fn insert_from_transcript(&mut self, id: String, session: AgentSession) {
        self.sessions.insert(id, session);
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
            existing.phase = SessionPhase::Completed;
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
        if let Some(ref prompt) = p.prompt {
            s.last_prompt = Some(prompt.clone());
        }
        if let Some(ref title) = p.title {
            s.title = Some(title.clone());
        }
    }

    fn on_permission_requested(&mut self, p: &PermissionRequestPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::WaitingForApproval;
        s.last_activity = p.timestamp;
        s.tool_name = Some(p.tool_name.clone());
        s.tool_input = Some(p.tool_input.clone());
    }

    fn on_question_asked(&mut self, p: &QuestionAskedPayload) {
        let s = self.get_or_create(&p.session_id, p.timestamp);
        s.phase = SessionPhase::WaitingForAnswer;
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
            s.phase = SessionPhase::Completed;
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
        s.phase = SessionPhase::Completed;
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

/// Merge sessions into global state. Only inserts sessions whose id is not already present.
/// Returns the number of newly inserted sessions.
pub fn merge_sessions(sessions: Vec<AgentSession>) -> usize {
    let guard = GLOBAL_SESSION_STATE.lock();
    if let Some(ref arc) = *guard {
        let mut state = arc.lock();
        let mut merged = 0;
        for session in sessions {
            if !state.sessions().contains_key(&session.id) {
                let id = session.id.clone();
                state.insert_from_transcript(id, session);
                merged += 1;
            }
        }
        merged
    } else {
        0
    }
}

/// 对活跃 sessions 运行一次 JumpTarget 富化（周期性重新解析）
///
/// 遍历所有未完成的 session，调用 terminal_jump::resolver::enrich_jump_target
/// 探测 Windows Terminal tab_id 等精确信息。若获得新信息则通过 apply 更新
/// 并自动 emit JumpTargetUpdated 事件到前端。
///
/// 返回被更新的 session 数量。
pub fn run_jump_target_enrichment() -> usize {
    let guard = GLOBAL_SESSION_STATE.lock();
    let arc = match guard.as_ref() {
        Some(a) => a.clone(),
        None => return 0,
    };
    drop(guard);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // 收集需要富化的 sessions
    let targets: Vec<(String, JumpTarget)> = {
        let state = arc.lock();
        state
            .sessions()
            .iter()
            .filter(|(_, s)| !s.is_completed)
            .filter_map(|(id, s)| {
                s.jump_target
                    .as_ref()
                    .filter(|jt| jt.terminal_app.is_some()) // 只对已识别终端的 session 做富化
                    .filter(|jt| jt.terminal_tab_id.is_none()) // 已有精确 tab_id 则跳过
                    .map(|jt| (id.clone(), jt.clone()))
            })
            .collect()
    };

    if targets.is_empty() {
        return 0;
    }

    let mut count = 0;
    for (session_id, current_jt) in targets {
        let enriched = crate::terminal_jump::resolver::enrich_jump_target(&current_jt);

        // 检查是否获得了新的有用信息（tab_id 从无到有）
        let got_new_info = enriched.terminal_tab_id.is_some()
            && enriched.terminal_tab_id != current_jt.terminal_tab_id;

        if got_new_info {
            let event = AgentEvent::JumpTargetUpdated(JumpTargetPayload {
                session_id,
                jump_target: enriched,
                timestamp: now,
            });
            arc.lock().apply(&event);
            count += 1;
        }
    }

    if count > 0 {
        log::info!(
            "[jump-target-enrich] 本轮更新了 {} 个 session 的 JumpTarget",
            count
        );
    }
    count
}
