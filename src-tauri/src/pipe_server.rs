//! Windows Named Pipe 服务器 — 监听 `\\.\pipe\VibeIsland`，接收 Agent SDK（Node.js/Python）推送的会话事件。
//! 作为 HTTP Hook 的补充通道，支持非 Claude Code 工具（Codex CLI、自定义 agent）接入。

use crate::agent_event::{JumpTarget, JumpTargetPayload};
use crate::config::get_config;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[cfg(target_os = "windows")]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

/// Result of processing a hook event — indicates whether a blocking response is needed.
enum HookEventResult {
    /// Fire-and-forget: no response needed (e.g. SessionStart, Notification).
    FireAndForget,
    /// Respond immediately with an empty allow payload (PreToolUse).
    RespondImmediately {
        request_id: String,
        event_name: String,
    },
    /// Wait for user approval/rejection before responding (PermissionRequest).
    WaitForApproval {
        request_id: String,
        event_name: String,
        rx: oneshot::Receiver<crate::hook_server::PermissionDecision>,
    },
}

/// Get the pipe name from configuration
fn get_pipe_name() -> String {
    get_config().pipe_server.pipe_name.clone()
}

/// Agent event received from SDK clients (legacy protocol)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    /// Unique session identifier
    pub session_id: String,
    /// Current state: "idle", "running", "waitingForApproval", "waitingForAnswer", "completed"
    pub state: String,
    /// Optional payload with additional event data
    #[serde(default)]
    pub payload: Option<serde_json::Value>,
}

/// Hook event envelope from CLI (new bidirectional protocol)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookEnvelope {
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub request_id: Option<String>,
    pub hook_event_name: Option<String>,
    pub payload: Option<serde_json::Value>,
}

/// Hook response envelope back to CLI
#[derive(Debug, Clone, Serialize)]
pub struct HookResponse {
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub request_id: String,
    pub stdout_payload: serde_json::Value,
}

/// Session start event (when first connection from a session)
#[derive(Debug, Clone, Serialize)]
pub struct SessionStart {
    pub session_id: String,
    pub label: String,
    pub pid: Option<u32>,
}

/// State change event
#[derive(Debug, Clone, Serialize)]
pub struct StateChange {
    pub session_id: String,
    pub state: String,
}

/// Session end event
#[derive(Debug, Clone, Serialize)]
pub struct SessionEnd {
    pub session_id: String,
}

/// Status of the pipe server
#[derive(Debug, Clone, Serialize)]
pub struct PipeServerStatus {
    pub running: bool,
    pub pipe_name: String,
}

/// Shared state for the pipe server
struct PipeServerState {
    running: AtomicBool,
}

impl PipeServerState {
    fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
        }
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn set_running(&self, value: bool) {
        self.running.store(value, Ordering::SeqCst);
    }
}

static PIPE_STATE: Mutex<Option<Arc<PipeServerState>>> = Mutex::new(None);

/// Start the named pipe server
#[cfg(target_os = "windows")]
pub fn start_pipe_server(app: AppHandle) -> Result<(), String> {
    let mut state_guard = PIPE_STATE.lock();
    if let Some(ref state) = *state_guard {
        if state.is_running() {
            return Err("Pipe server is already running".to_string());
        }
    }

    let state = Arc::new(PipeServerState::new());
    state.set_running(true);
    *state_guard = Some(state.clone());
    drop(state_guard);

    let pipe_name = get_pipe_name();
    let pipe_name_for_log = pipe_name.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async {
            if let Err(e) = run_pipe_server(&pipe_name, state, app).await {
                log::error!("Pipe server error: {}", e);
            }
        });
    });

    log::info!("Named pipe server started at {}", pipe_name_for_log);
    Ok(())
}

/// Start the named pipe server (non-Windows stub)
#[cfg(not(target_os = "windows"))]
pub fn start_pipe_server(_app: AppHandle) -> Result<(), String> {
    Err("Named pipe server is only supported on Windows".to_string())
}

/// Stop the named pipe server
pub fn stop_pipe_server() -> Result<(), String> {
    let mut state_guard = PIPE_STATE.lock();
    if let Some(ref state) = *state_guard {
        if !state.is_running() {
            return Err("Pipe server is not running".to_string());
        }
        state.set_running(false);
    } else {
        return Err("Pipe server is not running".to_string());
    }
    *state_guard = None;
    log::info!("Named pipe server stopped");
    Ok(())
}

/// Get the current status of the pipe server
pub fn get_pipe_server_status() -> PipeServerStatus {
    let state_guard = PIPE_STATE.lock();
    let running = state_guard
        .as_ref()
        .map(|s| s.is_running())
        .unwrap_or(false);
    PipeServerStatus {
        running,
        pipe_name: get_pipe_name(),
    }
}

#[cfg(target_os = "windows")]
async fn run_pipe_server(
    pipe_name: &str,
    state: Arc<PipeServerState>,
    app: AppHandle,
) -> Result<(), String> {
    loop {
        if !state.is_running() {
            break;
        }

        // Create a new pipe server instance
        let server = match ServerOptions::new()
            .first_pipe_instance(false)
            .create(pipe_name)
        {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Failed to create named pipe (will retry): {}", e);
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                continue;
            }
        };

        // Wait for a client to connect
        if let Err(e) = server.connect().await {
            log::warn!("Pipe connection failed (will retry): {}", e);
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            continue;
        }

        if !state.is_running() {
            break;
        }

        log::info!("Client connected to named pipe");

        // Spawn a new task to handle this connection
        let app_clone = app.clone();
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(server, app_clone, state_clone).await {
                log::error!("Connection handler error: {}", e);
            }
        });

        // Small delay before creating next pipe instance
        let retry_interval = get_config().pipe_server.retry_interval_ms;
        tokio::time::sleep(tokio::time::Duration::from_millis(retry_interval)).await;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
async fn handle_connection(
    mut server: NamedPipeServer,
    app: AppHandle,
    state: Arc<PipeServerState>,
) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let buffer_size = get_config().pipe_server.buffer_size;
    let mut buffer = Vec::with_capacity(buffer_size);
    let mut temp_buf = vec![0u8; buffer_size];

    loop {
        if !state.is_running() {
            break;
        }

        // Read data from the pipe
        match server.read(&mut temp_buf).await {
            Ok(0) => {
                log::info!("Client disconnected from named pipe");
                break;
            }
            Ok(n) => {
                buffer.extend_from_slice(&temp_buf[..n]);

                // Process complete newline-delimited JSON messages
                while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                    let message_bytes = buffer.drain(..=pos).collect::<Vec<_>>();
                    let message_str =
                        String::from_utf8_lossy(&message_bytes[..message_bytes.len() - 1]);

                    // Try to parse as hook envelope first (new protocol)
                    if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&message_str) {
                        let msg_type = envelope.get("type").and_then(|v| v.as_str()).unwrap_or("");

                        if msg_type == "hook_event" {
                            match handle_hook_event(&app, &envelope) {
                                HookEventResult::FireAndForget => {}
                                HookEventResult::RespondImmediately {
                                    request_id,
                                    event_name,
                                } => {
                                    let (tx, rx) = oneshot::channel::<
                                        crate::hook_server::PermissionDecision,
                                    >();
                                    let _ = tx.send(crate::hook_server::PermissionDecision {
                                        behavior: "allow".to_string(),
                                        message: None,
                                        updated_input: None,
                                    });
                                    if let Err(e) = write_pipe_response(
                                        &mut server,
                                        request_id,
                                        &event_name,
                                        rx,
                                    )
                                    .await
                                    {
                                        log::error!("Failed to write pipe response: {}", e);
                                        break;
                                    }
                                }
                                HookEventResult::WaitForApproval {
                                    request_id,
                                    event_name,
                                    rx,
                                } => {
                                    if let Err(e) = write_pipe_response(
                                        &mut server,
                                        request_id,
                                        &event_name,
                                        rx,
                                    )
                                    .await
                                    {
                                        log::error!("Failed to write pipe response: {}", e);
                                        break;
                                    }
                                }
                            }
                            continue;
                        }
                    }

                    // Legacy: parse as AgentEvent
                    match serde_json::from_str::<AgentEvent>(&message_str) {
                        Ok(event) => {
                            handle_agent_event(&app, event);
                        }
                        Err(e) => {
                            log::warn!(
                                "Failed to parse pipe message: {} (message: {})",
                                e,
                                message_str
                            );
                        }
                    }
                }
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::BrokenPipe {
                    log::info!("Client disconnected (broken pipe)");
                } else {
                    log::error!("Pipe read error: {}", e);
                }
                break;
            }
        }
    }

    // Gracefully disconnect
    let _ = server.disconnect();
    let _ = server.shutdown().await;

    Ok(())
}

/// Write a response back to the CLI through the named pipe.
#[cfg(target_os = "windows")]
async fn write_pipe_response(
    server: &mut NamedPipeServer,
    request_id: String,
    event_name: &str,
    rx: oneshot::Receiver<crate::hook_server::PermissionDecision>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let decision = tokio::time::timeout(tokio::time::Duration::from_secs(290), rx).await;

    let decision = match decision {
        Ok(Ok(d)) => d,
        Ok(Err(_)) => {
            log::warn!("Approval channel closed; fail-open allow");
            crate::hook_server::PermissionDecision {
                behavior: "allow".to_string(),
                message: Some("Approval channel closed".to_string()),
                updated_input: None,
            }
        }
        Err(_) => {
            log::warn!("Approval timed out after 290s; fail-open allow");
            crate::hook_server::PermissionDecision {
                behavior: "allow".to_string(),
                message: Some("Approval timed out".to_string()),
                updated_input: None,
            }
        }
    };

    let stdout_payload = if event_name == "PreToolUse" {
        serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": event_name,
                "permissionDecision": decision.behavior,
            }
        })
    } else {
        // PermissionRequest returns a decision object
        if let Some(ref updated_input) = decision.updated_input {
            serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": event_name,
                    "decision": {
                        "behavior": decision.behavior,
                        "updatedInput": updated_input,
                    }
                }
            })
        } else {
            serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": event_name,
                    "decision": { "behavior": decision.behavior }
                }
            })
        }
    };

    let envelope = serde_json::json!({
        "type": "hook_response",
        "request_id": request_id,
        "stdout_payload": stdout_payload,
    });

    let message = serde_json::to_string(&envelope).unwrap_or_default();
    let framed = format!("{}\n", message);

    log::info!(
        "Writing pipe response ({} bytes): behavior={}",
        framed.len(),
        decision.behavior
    );

    server
        .write_all(framed.as_bytes())
        .await
        .map_err(|e| format!("Pipe write error: {}", e))?;
    server
        .flush()
        .await
        .map_err(|e| format!("Pipe flush error: {}", e))?;

    log::info!("Pipe response written for request_id={}", request_id);
    Ok(())
}

/// 从 hooks envelope 的 PID 探测终端类型并构建 JumpTarget（V2：使用 terminal_jump::resolver）
/// 返回 Option<JumpTarget>，可直接序列化到前端事件中。
fn build_jump_target(envelope: &serde_json::Value, cwd: &str) -> Option<JumpTarget> {
    let hooks_pid = envelope
        .get("pid")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let hooks_ppid = envelope
        .get("ppid")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);

    #[cfg(target_os = "windows")]
    {
        let result = hooks_pid
            .map(|p| crate::terminal_jump::resolver::resolve_from_pid(p, Some(cwd), hooks_ppid));
        log::info!(
            "[build_jump_target] hooks_pid={:?}, ppid={:?}, terminal_app={:?}",
            hooks_pid,
            hooks_ppid,
            result.as_ref().and_then(|jt| jt.terminal_app.as_ref())
        );
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = hooks_pid;
        let _ = hooks_ppid;
        let _ = cwd;
        None
    }
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Handle a hook event envelope from the CLI.
/// Returns HookEventResult indicating whether the connection handler must send a response.
fn handle_hook_event(app: &AppHandle, envelope: &serde_json::Value) -> HookEventResult {
    use crate::adapters::HookAdapter;
    use crate::session_state;

    let request_id = envelope
        .get("request_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let event_name = envelope
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let payload = envelope
        .get("payload")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let session_id = payload
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let cwd = payload.get("cwd").and_then(|v| v.as_str()).unwrap_or("");

    let agent_type = detect_hook_agent_type(envelope, &payload);
    let adapter = HookAdapter::from_agent_type(&agent_type);
    let is_codex = agent_type == "codex";

    let label = cwd
        .rsplit(|c| c == '/' || c == '\\')
        .find(|s| !s.is_empty())
        .unwrap_or(if is_codex { "Codex" } else { "Claude Code" })
        .to_string();

    log::info!("Hook event via pipe: {} session={}", event_name, session_id);

    match event_name {
        "SessionStart" => {
            let hooks_pid = envelope
                .get("pid")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let jump_target = build_jump_target(envelope, cwd);

            log::info!(
                "[SessionStart] session_id={}, hooks_pid={:?}, jump_target={:?}",
                session_id,
                hooks_pid,
                jump_target
            );

            let _ = app.emit(
                "session_start",
                &serde_json::json!({
                    "session_id": session_id,
                    "label": label,
                    "cwd": cwd,
                    "source": payload.get("source"),
                    "model": payload.get("model"),
                    "agent_type": agent_type,
                    "pid": hooks_pid,
                    "jump_target": jump_target,
                }),
            );
            let event = adapter.to_session_started(&payload);
            session_state::apply_event(&event);

            // 持久化 jump_target 到 session state（与 hook_server 对齐）
            if let Some(jt) = jump_target {
                let jt_event =
                    crate::agent_event::AgentEvent::JumpTargetUpdated(JumpTargetPayload {
                        session_id: session_id.clone(),
                        jump_target: jt,
                        timestamp: now_ts(),
                    });
                session_state::apply_event(&jt_event);
            }

            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "idle" }),
            );
            HookEventResult::FireAndForget
        }
        "PreToolUse" => {
            let pre_cwd = payload.get("cwd").and_then(|v| v.as_str()).unwrap_or(cwd);
            let jump_target = build_jump_target(envelope, pre_cwd);
            let hooks_pid = envelope
                .get("pid")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);

            log::info!(
                "[PreToolUse] session_id={}, hooks_pid={:?}, jump_target={:?}",
                session_id,
                hooks_pid,
                jump_target
            );

            let _ = app.emit(
                "session_start",
                &serde_json::json!({
                    "session_id": session_id,
                    "label": label,
                    "cwd": payload.get("cwd"),
                    "agent_type": agent_type,
                    "pid": hooks_pid,
                    "jump_target": jump_target,
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "running",
                    "tool_name": payload.get("tool_name"),
                    "tool_input": payload.get("tool_input"),
                }),
            );
            let thinking = adapter.to_thinking_updated(&payload);
            session_state::apply_event(&thinking);
            let tool_started = adapter.to_tool_use_started(&payload);
            session_state::apply_event(&tool_started);

            // 持久化 jump_target 到 session state（PreToolUse 可刷新终端信息）
            if let Some(jt) = jump_target {
                let jt_event =
                    crate::agent_event::AgentEvent::JumpTargetUpdated(JumpTargetPayload {
                        session_id: session_id.clone(),
                        jump_target: jt,
                        timestamp: now_ts(),
                    });
                session_state::apply_event(&jt_event);
            }

            if let Some(tool_name) = payload.get("tool_name").and_then(|v| v.as_str()) {
                let file_path = payload.get("tool_input").and_then(|input| {
                    input
                        .get("file_path")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                });
                let _ = app.emit(
                    "tool_use",
                    &serde_json::json!({
                        "session_id": session_id,
                        "tool_name": tool_name,
                        "file_path": file_path,
                        "tool_input": payload.get("tool_input"),
                    }),
                );
            }
            // PreToolUse is blocking in the CLI but doesn't need user input —
            // acknowledge immediately so the agent continues without waiting.
            HookEventResult::RespondImmediately {
                request_id,
                event_name: event_name.to_string(),
            }
        }
        "PostToolUse" => {
            let event = adapter.to_tool_use_completed(&payload);
            session_state::apply_event(&event);
            let _ = app.emit(
                "tool_complete",
                &serde_json::json!({
                    "session_id": session_id,
                    "tool_name": payload.get("tool_name"),
                    "duration_ms": payload.get("duration_ms"),
                    "tool_response": payload.get("tool_response"),
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "running" }),
            );
            HookEventResult::FireAndForget
        }
        "PostToolUseFailure" => {
            let event = adapter.to_tool_use_completed(&payload);
            session_state::apply_event(&event);
            let _ = app.emit(
                "tool_error",
                &serde_json::json!({
                    "session_id": session_id,
                    "tool_name": payload.get("tool_name"),
                    "error": payload.get("error"),
                    "duration_ms": payload.get("duration_ms"),
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "completed", "error": payload.get("error") }),
            );
            HookEventResult::FireAndForget
        }
        "Notification" => {
            let event = adapter.to_notification_updated(&payload);
            session_state::apply_event(&event);
            match payload.get("notification_type").and_then(|v| v.as_str()) {
                Some("permission_prompt") => {
                    let _ = app.emit(
                        "state_change",
                        &serde_json::json!({
                            "session_id": session_id,
                            "state": "waitingForApproval",
                            "message": payload.get("message"),
                        }),
                    );
                }
                Some("idle_prompt") => {
                    let _ = app.emit(
                        "state_change",
                        &serde_json::json!({ "session_id": session_id, "state": "idle" }),
                    );
                }
                _ => {
                    let _ = app.emit(
                        "notification",
                        &serde_json::json!({
                            "session_id": session_id,
                            "message": payload.get("message"),
                            "notification_type": payload.get("notification_type"),
                        }),
                    );
                }
            }
            HookEventResult::FireAndForget
        }
        "Stop" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "completed",
                    "reason": payload.get("reason"),
                }),
            );
            let event = adapter.to_session_completed(&payload);
            session_state::apply_event(&event);
            HookEventResult::FireAndForget
        }
        "StopFailure" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "completed",
                    "error": payload.get("error"),
                }),
            );
            HookEventResult::FireAndForget
        }
        "UserPromptSubmit" => {
            let event = adapter.to_user_prompt_submit(&payload);
            session_state::apply_event(&event);
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "running",
                    "prompt": payload.get("prompt"),
                }),
            );
            HookEventResult::FireAndForget
        }
        "PermissionRequest" => {
            let event = adapter.to_permission_requested(&payload);
            session_state::apply_event(&event);

            let tool_use_id = payload
                .get("tool_use_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_name = payload
                .get("tool_name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_input = payload
                .get("tool_input")
                .cloned()
                .unwrap_or(serde_json::json!({}));

            use crate::approval_types::approval_types;
            let approval_type = approval_types::from_tool_name(&tool_name);
            let risk_level = determine_risk_level(&tool_name, &tool_input);
            let action = format_tool_action(&tool_name, &tool_input);
            let diff = extract_diff_data(&tool_name, &tool_input);

            let questions = if approval_type == approval_types::QUESTION {
                extract_questions(&tool_input)
            } else {
                None
            };

            let plan_content = if approval_type == approval_types::PLAN {
                tool_input
                    .get("plan")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            } else {
                None
            };

            let _ = app.emit(
                "permission_request",
                &serde_json::json!({
                    "session_id": session_id,
                    "tool_use_id": tool_use_id,
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "approval_type": approval_type,
                    "action": action,
                    "risk_level": risk_level,
                    "diff": diff,
                    "questions": questions,
                    "plan_content": plan_content,
                    "permission_suggestions": payload.get("permission_suggestions"),
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "waitingForApproval" }),
            );

            let rx = crate::hook_server::register_pipe_approval(
                tool_use_id,
                session_id,
                tool_name,
                tool_input,
            );
            HookEventResult::WaitForApproval {
                request_id,
                event_name: event_name.to_string(),
                rx,
            }
        }
        "PermissionDenied" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "running" }),
            );
            HookEventResult::FireAndForget
        }
        _ => {
            log::debug!("Unhandled hook event via pipe: {}", event_name);
            HookEventResult::FireAndForget
        }
    }
}

/// Determine risk level (shared with hook_server)
fn determine_risk_level(tool_name: &str, tool_input: &serde_json::Value) -> String {
    match tool_name {
        "Bash" => {
            if let Some(cmd) = tool_input.get("command").and_then(|v| v.as_str()) {
                let cmd_lower = cmd.to_lowercase();
                if cmd_lower.contains("rm ")
                    || cmd_lower.contains("rmdir")
                    || cmd_lower.contains("del ")
                    || cmd_lower.contains("format")
                    || cmd_lower.contains("shutdown")
                    || cmd_lower.contains("reboot")
                    || cmd_lower.contains("sudo")
                    || cmd_lower.contains("su ")
                    || cmd_lower.contains("chmod")
                    || cmd_lower.contains("chown")
                    || cmd_lower.contains("mkfs")
                    || cmd_lower.contains("dd ")
                {
                    return "high".to_string();
                }
            }
            "medium".to_string()
        }
        "Write" | "Edit" => {
            if let Some(file_path) = tool_input.get("file_path").and_then(|v| v.as_str()) {
                let path_lower = file_path.to_lowercase();
                if path_lower.contains(".env")
                    || path_lower.contains("config")
                    || path_lower.contains("secret")
                    || path_lower.contains("credential")
                    || path_lower.contains("password")
                    || path_lower.contains("key")
                {
                    return "high".to_string();
                }
            }
            "medium".to_string()
        }
        "TodoWrite" | "Task" | "Agent" => "medium".to_string(),
        "Read" | "Glob" | "Grep" | "LS" => "low".to_string(),
        _ => "medium".to_string(),
    }
}

/// Format tool action (shared with hook_server)
fn format_tool_action(tool_name: &str, tool_input: &serde_json::Value) -> String {
    match tool_name {
        "Bash" => {
            let cmd = tool_input
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown command");
            let description = tool_input
                .get("description")
                .and_then(|v| v.as_str())
                .map(|d| format!(": {}", d))
                .unwrap_or_default();
            format!("Execute: {}{}", cmd, description)
        }
        "Read" => format!(
            "Read file: {}",
            tool_input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ),
        "Write" => format!(
            "Write file: {}",
            tool_input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ),
        "Edit" => format!(
            "Edit file: {}",
            tool_input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ),
        "Glob" => format!(
            "Find files: {}",
            tool_input
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ),
        "Grep" => format!(
            "Search: {}",
            tool_input
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ),
        _ => format!("Execute tool: {}", tool_name),
    }
}

/// Extract diff data (shared with hook_server)
fn extract_diff_data(tool_name: &str, tool_input: &serde_json::Value) -> Option<serde_json::Value> {
    match tool_name {
        "Write" | "Edit" => {
            let file_path = tool_input
                .get("file_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())?;

            let new_content = tool_input
                .get("content")
                .or_else(|| tool_input.get("new_string"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let old_content = tool_input
                .get("old_string")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if new_content.is_some() {
                Some(serde_json::json!({
                    "fileName": file_path.split('/').next_back().unwrap_or(&file_path),
                    "filePath": file_path,
                    "oldContent": old_content.unwrap_or_default(),
                    "newContent": new_content.unwrap_or_default(),
                }))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn extract_questions(tool_input: &serde_json::Value) -> Option<Vec<serde_json::Value>> {
    let questions_array = tool_input.get("questions").and_then(|v| v.as_array())?;

    let questions: Vec<serde_json::Value> = questions_array
        .iter()
        .map(|q| {
            let question = q.get("question").and_then(|v| v.as_str()).unwrap_or("");
            let header = q.get("header").and_then(|v| v.as_str()).unwrap_or("");
            let multi_select = q
                .get("multiSelect")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let options = q
                .get("options")
                .and_then(|v| v.as_array())
                .map(|opts| {
                    opts.iter()
                        .map(|opt| {
                            serde_json::json!({
                                "label": opt.get("label").and_then(|v| v.as_str()).unwrap_or(""),
                                "description": opt.get("description").and_then(|v| v.as_str()),
                                "preview": opt.get("preview").and_then(|v| v.as_str()),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            serde_json::json!({
                "question": question,
                "header": header,
                "multiSelect": multi_select,
                "options": options,
            })
        })
        .collect();

    if questions.is_empty() {
        None
    } else {
        Some(questions)
    }
}

/// 根据 envelope/payload 中的字段判断 hook 来源 agent 类型。
///
/// 优先级：envelope.source（CLI --source 参数）> payload.agent_type > payload.source
/// envelope.source 是最可靠的信号——由 vibe-island-hooks 注入，不受 agent 自身数据影响。
/// Codex SessionStart 的 payload.source 是 "startup"/"resume" 等，不能作为 agent 类型判断依据。
fn detect_hook_agent_type(envelope: &serde_json::Value, payload: &serde_json::Value) -> String {
    for value in [
        envelope.get("source"),
        payload.get("agent_type"),
        payload.get("source"),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(raw) = value.as_str() {
            let lower = raw.to_lowercase();
            if lower.contains("codex") {
                return "codex".to_string();
            }
            if lower.contains("claude") {
                return "claude".to_string();
            }
        }
    }

    "claude".to_string()
}

/// Handle legacy agent events (from SDK clients)
fn handle_agent_event(app: &AppHandle, event: AgentEvent) {
    log::debug!("Received agent event: {:?}", event);

    let _ = app.emit(
        "state_change",
        &StateChange {
            session_id: event.session_id.clone(),
            state: event.state.clone(),
        },
    );

    if let Some(ref payload) = event.payload {
        if let Some(event_type) = payload.get("event_type").and_then(|v| v.as_str()) {
            match event_type {
                "session_start" => {
                    let label = payload
                        .get("label")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Agent Session")
                        .to_string();
                    let pid = payload
                        .get("pid")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);

                    let _ = app.emit(
                        "session_start",
                        &SessionStart {
                            session_id: event.session_id.clone(),
                            label,
                            pid,
                        },
                    );
                }
                "session_end" => {
                    let _ = app.emit(
                        "session_end",
                        &SessionEnd {
                            session_id: event.session_id.clone(),
                        },
                    );
                }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_agent_prefers_envelope_source() {
        // Codex SessionStart：payload.source 是 "startup"，envelope.source 是 "codex"
        let envelope = serde_json::json!({ "source": "codex" });
        let payload = serde_json::json!({ "source": "startup" });
        assert_eq!(detect_hook_agent_type(&envelope, &payload), "codex");
    }

    #[test]
    fn test_detect_agent_falls_back_to_payload_agent_type() {
        let envelope = serde_json::json!({});
        let payload = serde_json::json!({ "agent_type": "codex" });
        assert_eq!(detect_hook_agent_type(&envelope, &payload), "codex");
    }

    #[test]
    fn test_detect_agent_defaults_to_claude() {
        let envelope = serde_json::json!({});
        let payload = serde_json::json!({});
        assert_eq!(detect_hook_agent_type(&envelope, &payload), "claude");
    }
}
