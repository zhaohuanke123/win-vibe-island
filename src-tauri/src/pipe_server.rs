use crate::config::get_config;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

/// Get the pipe name from configuration
fn get_pipe_name() -> String {
    get_config().pipe_server.pipe_name.clone()
}

/// Agent event received from SDK clients (legacy protocol)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    /// Unique session identifier
    pub session_id: String,
    /// Current state: "idle", "running", "approval", "done"
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
                            // New: CLI hook event
                            handle_hook_event(&app, &envelope);
                            // For blocking events, we need to wait for user response
                            // and write back through the pipe. For now, fire-and-forget
                            // events are handled; blocking events will be enhanced later.
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

/// Handle a hook event envelope from the CLI.
/// Dispatches to the same logic as hook_server.rs handlers.
fn handle_hook_event(app: &AppHandle, envelope: &serde_json::Value) {
    use crate::adapters::claude_adapter::ClaudeCodeAdapter;
    use crate::session_state;

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

    let cwd = payload
        .get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let label = cwd
        .rsplit(|c| c == '/' || c == '\\')
        .find(|s| !s.is_empty())
        .unwrap_or("Claude Code")
        .to_string();

    log::info!(
        "Hook event via pipe: {} session={}",
        event_name,
        session_id
    );

    match event_name {
        "SessionStart" => {
            let _ = app.emit(
                "session_start",
                &serde_json::json!({
                    "session_id": session_id,
                    "label": label,
                    "cwd": payload.get("cwd"),
                    "source": payload.get("source"),
                    "model": payload.get("model"),
                }),
            );
            let event = ClaudeCodeAdapter::to_session_started(&payload);
            session_state::apply_event(&event);
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "idle" }),
            );
        }
        "PreToolUse" => {
            let _ = app.emit(
                "session_start",
                &serde_json::json!({
                    "session_id": session_id,
                    "label": label,
                    "cwd": payload.get("cwd"),
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "thinking",
                    "tool_name": payload.get("tool_name"),
                    "tool_input": payload.get("tool_input"),
                }),
            );
            let thinking = ClaudeCodeAdapter::to_thinking_updated(&payload);
            session_state::apply_event(&thinking);
            let tool_started = ClaudeCodeAdapter::to_tool_use_started(&payload);
            session_state::apply_event(&tool_started);

            if let Some(tool_name) = payload.get("tool_name").and_then(|v| v.as_str()) {
                let file_path = payload.get("tool_input").and_then(|input| {
                    input.get("file_path").and_then(|v| v.as_str()).map(|s| s.to_string())
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
        }
        "PostToolUse" => {
            let event = ClaudeCodeAdapter::to_tool_use_completed(&payload);
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
                &serde_json::json!({ "session_id": session_id, "state": "streaming" }),
            );
        }
        "PostToolUseFailure" => {
            let event = ClaudeCodeAdapter::to_tool_use_completed(&payload);
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
                &serde_json::json!({ "session_id": session_id, "state": "error", "error": payload.get("error") }),
            );
        }
        "Notification" => {
            let event = ClaudeCodeAdapter::to_notification_updated(&payload);
            session_state::apply_event(&event);
            match payload.get("notification_type").and_then(|v| v.as_str()) {
                Some("permission_prompt") => {
                    let _ = app.emit(
                        "state_change",
                        &serde_json::json!({
                            "session_id": session_id,
                            "state": "approval",
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
        }
        "Stop" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "done",
                    "reason": payload.get("reason"),
                }),
            );
            let event = ClaudeCodeAdapter::to_session_completed(&payload);
            session_state::apply_event(&event);
        }
        "StopFailure" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "error",
                    "error": payload.get("error"),
                }),
            );
        }
        "UserPromptSubmit" => {
            let event = ClaudeCodeAdapter::to_user_prompt_submit(&payload);
            session_state::apply_event(&event);
            let _ = app.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "running",
                    "prompt": payload.get("prompt"),
                }),
            );
        }
        "PermissionRequest" => {
            // For PermissionRequest via pipe, we use the same logic as hook_server
            // but the response goes back through the pipe instead of HTTP.
            // The CLI will block waiting for a response.
            let event = ClaudeCodeAdapter::to_permission_requested(&payload);
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
                    "permission_suggestions": payload.get("permission_suggestions"),
                }),
            );
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "approval" }),
            );
        }
        "PermissionDenied" => {
            let _ = app.emit(
                "state_change",
                &serde_json::json!({ "session_id": session_id, "state": "running" }),
            );
        }
        _ => {
            log::debug!("Unhandled hook event via pipe: {}", event_name);
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
            tool_input.get("file_path").and_then(|v| v.as_str()).unwrap_or("unknown")
        ),
        "Write" => format!(
            "Write file: {}",
            tool_input.get("file_path").and_then(|v| v.as_str()).unwrap_or("unknown")
        ),
        "Edit" => format!(
            "Edit file: {}",
            tool_input.get("file_path").and_then(|v| v.as_str()).unwrap_or("unknown")
        ),
        "Glob" => format!(
            "Find files: {}",
            tool_input.get("pattern").and_then(|v| v.as_str()).unwrap_or("unknown")
        ),
        "Grep" => format!(
            "Search: {}",
            tool_input.get("pattern").and_then(|v| v.as_str()).unwrap_or("unknown")
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
                    let pid = payload.get("pid").and_then(|v| v.as_u64()).map(|v| v as u32);

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
