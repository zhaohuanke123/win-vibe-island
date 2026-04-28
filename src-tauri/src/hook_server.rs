//! HTTP Hook Server for Claude Code Integration
//!
//! Claude Code supports HTTP hooks that POST JSON to a local server on lifecycle events.
//! This module implements an HTTP server on port 7878 to receive these hooks.
//!
//! Supported hooks:
//! - SessionStart: When a new session begins or resumes
//! - PreToolUse: Before Claude executes any tool
//! - PostToolUse: After a tool completes
//! - Notification: When Claude needs user attention
//! - Stop: When Claude finishes a response
//! - UserPromptSubmit: When user submits a prompt
//! - PermissionRequest: When Claude needs permission to execute a tool

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

/// Default port for the hook server
pub const HOOK_SERVER_PORT: u16 = 7878;

/// Default timeout for approval requests (30 seconds)
const APPROVAL_TIMEOUT_SECS: u64 = 30;

/// Maximum number of error logs to keep
const MAX_ERROR_LOGS: usize = 100;

/// Connection state for the hook server
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HookConnectionState {
    /// Hook server is running and accepting connections
    Connected,
    /// Hook server is not running
    Disconnected,
    /// Hook server encountered an error
    Error,
}

/// Error log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookErrorLog {
    pub timestamp: i64,
    pub error_type: String,
    pub message: String,
    pub details: Option<String>,
}

/// Hook server health status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookHealthStatus {
    pub state: HookConnectionState,
    pub port: u16,
    pub last_heartbeat: Option<i64>,
    pub uptime_secs: Option<u64>,
    pub total_requests: u64,
    pub error_count: u64,
}

/// Response to a permission request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecision {
    /// The behavior: "allow" or "deny"
    pub behavior: String,
    /// Optional message to display
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Optional updated input for the tool
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_input: Option<serde_json::Value>,
}

/// Pending approval request with response channel
struct PendingApproval {
    /// The tool use ID for correlation
    tool_use_id: String,
    /// Session ID
    session_id: String,
    /// Tool name
    tool_name: String,
    /// Tool input
    tool_input: serde_json::Value,
    /// Channel to send the response
    response_tx: oneshot::Sender<PermissionDecision>,
    /// Timestamp when the request was created
    created_at: std::time::Instant,
}

/// Hook server state
struct HookServerState {
    running: Mutex<bool>,
    app_handle: AppHandle,
    /// Pending approval requests keyed by tool_use_id
    pending_approvals: Mutex<std::collections::HashMap<String, PendingApproval>>,
    /// Server start time for uptime calculation
    start_time: std::time::Instant,
    /// Total number of requests received
    total_requests: Mutex<u64>,
    /// Error count
    error_count: Mutex<u64>,
    /// Error logs (most recent first)
    error_logs: Mutex<VecDeque<HookErrorLog>>,
    /// Last heartbeat timestamp
    last_heartbeat: Mutex<Option<i64>>,
}

/// Generic hook payload - captures all fields from Claude Code hooks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookPayload {
    // Core identifiers
    pub session_id: Option<String>,
    pub transcript_path: Option<String>,
    pub cwd: Option<String>,
    pub hook_event_name: Option<String>,

    // SessionStart specific
    pub source: Option<String>,  // startup, resume, clear, compact
    pub model: Option<String>,
    pub agent_type: Option<String>,
    pub agent_id: Option<String>,

    // Tool-related
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    pub tool_response: Option<serde_json::Value>,
    pub tool_use_id: Option<String>,

    // UserPromptSubmit
    pub prompt: Option<String>,
    pub permission_mode: Option<String>,

    // Stop
    pub reason: Option<String>,

    // Notification
    pub notification_type: Option<String>,
    pub message: Option<String>,

    // PermissionRequest
    pub permission_suggestions: Option<Vec<serde_json::Value>>,

    // PostToolUseFailure
    pub error: Option<String>,
    pub is_interrupt: Option<bool>,
    pub duration_ms: Option<u64>,
}

/// Status of the hook server
#[derive(Debug, Clone, Serialize)]
pub struct HookServerStatus {
    pub running: bool,
    pub port: u16,
}

static HOOK_SERVER_STATE: Mutex<Option<Arc<HookServerState>>> = Mutex::new(None);

/// Start the hook server
pub fn start_hook_server(app: AppHandle) -> Result<(), String> {
    let mut state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        if *state.running.lock() {
            return Err("Hook server is already running".to_string());
        }
    }

    let state = Arc::new(HookServerState {
        running: Mutex::new(true),
        app_handle: app.clone(),
        pending_approvals: Mutex::new(std::collections::HashMap::new()),
        start_time: std::time::Instant::now(),
        total_requests: Mutex::new(0),
        error_count: Mutex::new(0),
        error_logs: Mutex::new(VecDeque::new()),
        last_heartbeat: Mutex::new(None),
    });
    *state_guard = Some(state.clone());
    drop(state_guard);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async {
            if let Err(e) = run_hook_server(state).await {
                log::error!("Hook server error: {}", e);
            }
        });
    });

    log::info!("Hook server started on port {}", HOOK_SERVER_PORT);
    Ok(())
}

/// Stop the hook server
pub fn stop_hook_server() -> Result<(), String> {
    let mut state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        *state.running.lock() = false;
    }
    *state_guard = None;
    log::info!("Hook server stopped");
    Ok(())
}

/// Get the current status of the hook server
pub fn get_hook_server_status() -> HookServerStatus {
    let state_guard = HOOK_SERVER_STATE.lock();
    let running = state_guard.as_ref().map_or(false, |s| *s.running.lock());
    HookServerStatus {
        running,
        port: HOOK_SERVER_PORT,
    }
}

async fn run_hook_server(state: Arc<HookServerState>) -> Result<(), String> {
    let app = Router::new()
        .route("/hooks/session-start", post(handle_session_start))
        .route("/hooks/pre-tool-use", post(handle_pre_tool_use))
        .route("/hooks/post-tool-use", post(handle_post_tool_use))
        .route("/hooks/notification", post(handle_notification))
        .route("/hooks/stop", post(handle_stop))
        .route("/hooks/user-prompt-submit", post(handle_user_prompt_submit))
        .route("/hooks/permission-request", post(handle_permission_request))
        .route("/hooks/ping", post(handle_ping))
        .route("/hooks/health", get(handle_health))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], HOOK_SERVER_PORT));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind to port {}: {}", HOOK_SERVER_PORT, e))?;

    log::info!("Hook server listening on {}", addr);

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Hook server error: {}", e))?;

    Ok(())
}

/// Extract session ID from payload, with fallback
fn get_session_id(payload: &HookPayload) -> String {
    // Use session_id if available (preferred)
    if let Some(ref sid) = payload.session_id {
        return sid.clone();
    }
    // Fallback to transcript_path
    if let Some(ref path) = payload.transcript_path {
        // Extract just the filename or use the whole path
        return path.clone();
    }
    // Last resort: generate a temporary ID (should not happen in normal use)
    format!("unknown-{}", chrono_timestamp())
}

/// Extract a human-readable label for the session
fn get_session_label(payload: &HookPayload) -> String {
    // Use cwd as the label (project name)
    if let Some(ref cwd) = payload.cwd {
        // Extract just the folder name
        if let Some(name) = cwd.split('/').next_back() {
            return name.to_string();
        }
        return cwd.clone();
    }
    "Claude Code".to_string()
}

/// Handle SessionStart hook - triggered when a new session begins
async fn handle_session_start(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "SessionStart hook received: session_id={:?}, source={:?}, cwd={:?}",
        payload.session_id,
        payload.source,
        payload.cwd
    );

    let session_id = get_session_id(&payload);
    let label = get_session_label(&payload);

    // Emit session_start event to frontend
    let _ = state.app_handle.emit(
        "session_start",
        &serde_json::json!({
            "session_id": session_id,
            "label": label,
            "cwd": payload.cwd,
            "source": payload.source,
            "model": payload.model,
            "agent_type": payload.agent_type,
        }),
    );

    // Also emit initial state
    let _ = state.app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "idle",
        }),
    );

    Ok(StatusCode::OK)
}

/// Handle PreToolUse hook - triggered before Claude executes any tool
async fn handle_pre_tool_use(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "PreToolUse hook received: session_id={:?}, tool={:?}",
        payload.session_id,
        payload.tool_name
    );

    let session_id = get_session_id(&payload);
    let label = get_session_label(&payload);

    // Emit session_start event to ensure frontend has this session
    // This handles the case where SessionStart hook wasn't received
    let _ = state.app_handle.emit(
        "session_start",
        &serde_json::json!({
            "session_id": session_id,
            "label": label,
            "cwd": payload.cwd,
        }),
    );

    // Emit state_change to running
    let _ = state.app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "running",
            "tool_name": payload.tool_name,
            "tool_input": payload.tool_input,
        }),
    );

    // Extract file path if present
    let file_path = payload.tool_input.as_ref().and_then(|input| {
        input.get("file_path").and_then(|v| v.as_str()).map(|s| s.to_string())
    });

    if let Some(ref tool_name) = payload.tool_name {
        let _ = state.app_handle.emit(
            "tool_use",
            &serde_json::json!({
                "session_id": session_id,
                "tool_name": tool_name,
                "file_path": file_path,
            }),
        );
    }

    Ok(StatusCode::OK)
}

/// Handle PostToolUse hook - triggered after a tool completes
async fn handle_post_tool_use(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "PostToolUse hook received: session_id={:?}, tool={:?}",
        payload.session_id,
        payload.tool_name
    );

    let session_id = get_session_id(&payload);

    // Emit tool_complete event
    let _ = state.app_handle.emit(
        "tool_complete",
        &serde_json::json!({
            "session_id": session_id,
            "tool_name": payload.tool_name,
            "duration_ms": payload.duration_ms,
        }),
    );

    Ok(StatusCode::OK)
}

/// Handle Notification hook - triggered when Claude needs user attention
async fn handle_notification(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "Notification hook received: session_id={:?}, type={:?}",
        payload.session_id,
        payload.notification_type
    );

    let session_id = get_session_id(&payload);

    // Handle different notification types
    match payload.notification_type.as_deref() {
        Some("permission_prompt") => {
            // Claude is waiting for permission
            let _ = state.app_handle.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "approval",
                    "message": payload.message,
                }),
            );
        }
        Some("idle_prompt") => {
            // Claude is idle, waiting for input
            let _ = state.app_handle.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "idle",
                }),
            );
        }
        _ => {
            // Generic notification
            let _ = state.app_handle.emit(
                "notification",
                &serde_json::json!({
                    "session_id": session_id,
                    "message": payload.message,
                    "notification_type": payload.notification_type,
                }),
            );
        }
    }

    Ok(StatusCode::OK)
}

/// Handle Stop hook - triggered when Claude finishes a response
async fn handle_stop(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "Stop hook received: session_id={:?}, reason={:?}",
        payload.session_id,
        payload.reason
    );

    let session_id = get_session_id(&payload);

    // Emit state_change to done/idle
    let _ = state.app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "done",
            "reason": payload.reason,
        }),
    );

    Ok(StatusCode::OK)
}

/// Handle UserPromptSubmit hook - triggered when user submits a prompt
async fn handle_user_prompt_submit(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<StatusCode, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "UserPromptSubmit hook received: session_id={:?}",
        payload.session_id
    );

    let session_id = get_session_id(&payload);

    // Emit state_change to running
    let _ = state.app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "running",
            "prompt": payload.prompt,
        }),
    );

    Ok(StatusCode::OK)
}

/// Handle PermissionRequest hook - triggered when Claude needs permission to execute a tool
/// This handler BLOCKS until the user responds or times out.
async fn handle_permission_request(
    State(state): State<Arc<HookServerState>>,
    Json(payload): Json<HookPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    increment_request_count(&state);
    
    log::info!(
        "PermissionRequest hook received: session_id={:?}, tool={:?}, tool_use_id={:?}",
        payload.session_id,
        payload.tool_name,
        payload.tool_use_id
    );

    let session_id = get_session_id(&payload);
    let tool_use_id = payload.tool_use_id.clone().unwrap_or_else(|| format!("auto-{}", chrono_timestamp()));
    let tool_name = payload.tool_name.clone().unwrap_or_else(|| "unknown".to_string());
    let tool_input = payload.tool_input.clone().unwrap_or(serde_json::json!({}));

    // Determine risk level based on tool name and input
    let risk_level = determine_risk_level(&tool_name, &tool_input);

    // Extract action description from tool input
    let action = format_tool_action(&tool_name, &tool_input);

    // Extract diff data if present (for Write/Edit tools)
    let diff = extract_diff_data(&tool_name, &tool_input);

    // Create a oneshot channel for the response
    let (response_tx, response_rx) = oneshot::channel::<PermissionDecision>();

    // Store the pending approval
    {
        let state_guard = HOOK_SERVER_STATE.lock();
        if let Some(ref state) = *state_guard {
            let mut pending = state.pending_approvals.lock();
            pending.insert(tool_use_id.clone(), PendingApproval {
                tool_use_id: tool_use_id.clone(),
                session_id: session_id.clone(),
                tool_name: tool_name.clone(),
                tool_input: tool_input.clone(),
                response_tx,
                created_at: std::time::Instant::now(),
            });
        }
    }

    // Emit permission_request event to frontend
    let _ = state.app_handle.emit(
        "permission_request",
        &serde_json::json!({
            "session_id": session_id,
            "tool_use_id": tool_use_id,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "action": action,
            "risk_level": risk_level,
            "diff": diff,
            "permission_suggestions": payload.permission_suggestions,
        }),
    );

    // Also emit state_change to approval
    let _ = state.app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "approval",
        }),
    );

    // Wait for response with timeout
    let timeout_duration = std::time::Duration::from_secs(APPROVAL_TIMEOUT_SECS);
    let decision = match tokio::time::timeout(timeout_duration, response_rx).await {
        Ok(Ok(decision)) => {
            log::info!("Permission decision received: {:?}", decision);
            // Emit state_change back to running/idle
            let _ = state.app_handle.emit(
                "state_change",
                &serde_json::json!({
                    "session_id": session_id,
                    "state": "running",
                }),
            );
            decision
        }
        Ok(Err(_)) => {
            log::warn!("Permission response channel closed unexpectedly");
            PermissionDecision {
                behavior: "deny".to_string(),
                message: Some("Approval response channel closed".to_string()),
                updated_input: None,
            }
        }
        Err(_) => {
            log::warn!("Permission request timed out after {} seconds", APPROVAL_TIMEOUT_SECS);
            // Clean up the pending approval
            {
                let state_guard = HOOK_SERVER_STATE.lock();
                if let Some(ref state) = *state_guard {
                    let mut pending = state.pending_approvals.lock();
                    pending.remove(&tool_use_id);
                }
            }
            PermissionDecision {
                behavior: "deny".to_string(),
                message: Some(format!("Permission request timed out after {} seconds", APPROVAL_TIMEOUT_SECS)),
                updated_input: None,
            }
        }
    };

    // Build the response JSON
    let response = serde_json::json!({
        "decision": decision
    });

    Ok(Json(response))
}

/// Determine risk level based on tool name and input
fn determine_risk_level(tool_name: &str, tool_input: &serde_json::Value) -> String {
    match tool_name {
        // High risk tools
        "Bash" => {
            if let Some(cmd) = tool_input.get("command").and_then(|v| v.as_str()) {
                let cmd_lower = cmd.to_lowercase();
                // Check for dangerous commands
                if cmd_lower.contains("rm ") || cmd_lower.contains("rmdir")
                    || cmd_lower.contains("del ") || cmd_lower.contains("format")
                    || cmd_lower.contains("shutdown") || cmd_lower.contains("reboot")
                    || cmd_lower.contains("sudo") || cmd_lower.contains("su ")
                    || cmd_lower.contains("chmod") || cmd_lower.contains("chown")
                    || cmd_lower.contains("mkfs") || cmd_lower.contains("dd ")
                {
                    return "high".to_string();
                }
            }
            "medium".to_string()
        }
        "Write" | "Edit" => {
            // Check if modifying important files
            if let Some(file_path) = tool_input.get("file_path").and_then(|v| v.as_str()) {
                let path_lower = file_path.to_lowercase();
                if path_lower.contains(".env") || path_lower.contains("config")
                    || path_lower.contains("secret") || path_lower.contains("credential")
                    || path_lower.contains("password") || path_lower.contains("key")
                {
                    return "high".to_string();
                }
            }
            "medium".to_string()
        }
        // Medium risk tools
        "TodoWrite" | "Task" | "Agent" => "medium".to_string(),
        // Low risk tools
        "Read" | "Glob" | "Grep" | "LS" => "low".to_string(),
        // Default to medium for unknown tools
        _ => "medium".to_string(),
    }
}

/// Format a human-readable action description from tool name and input
fn format_tool_action(tool_name: &str, tool_input: &serde_json::Value) -> String {
    match tool_name {
        "Bash" => {
            let cmd = tool_input.get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown command");
            let description = tool_input.get("description")
                .and_then(|v| v.as_str())
                .map(|d| format!(": {}", d))
                .unwrap_or_default();
            format!("Execute: {}{}", cmd, description)
        }
        "Read" => {
            let file_path = tool_input.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown file");
            format!("Read file: {}", file_path)
        }
        "Write" => {
            let file_path = tool_input.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown file");
            format!("Write file: {}", file_path)
        }
        "Edit" => {
            let file_path = tool_input.get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown file");
            format!("Edit file: {}", file_path)
        }
        "Glob" => {
            let pattern = tool_input.get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown pattern");
            format!("Find files: {}", pattern)
        }
        "Grep" => {
            let pattern = tool_input.get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown pattern");
            format!("Search: {}", pattern)
        }
        _ => {
            format!("Execute tool: {}", tool_name)
        }
    }
}

/// Extract diff data from Write/Edit tool input
fn extract_diff_data(tool_name: &str, tool_input: &serde_json::Value) -> Option<serde_json::Value> {
    match tool_name {
        "Write" | "Edit" => {
            let file_path = tool_input.get("file_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())?;

            let new_content = tool_input.get("content")
                .or_else(|| tool_input.get("new_string"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let old_content = tool_input.get("old_string")
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

/// Submit an approval response for a pending permission request.
/// This is called from the frontend when the user approves or rejects an action.
pub fn submit_approval_response(tool_use_id: &str, approved: bool) -> Result<(), String> {
    let state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        let mut pending = state.pending_approvals.lock();
        if let Some(pending_approval) = pending.remove(tool_use_id) {
            let decision = PermissionDecision {
                behavior: if approved { "allow" } else { "deny" }.to_string(),
                message: None,
                updated_input: None,
            };
            pending_approval.response_tx.send(decision)
                .map_err(|_| "Failed to send approval response".to_string())?;
            Ok(())
        } else {
            Err(format!("No pending approval found for tool_use_id: {}", tool_use_id))
        }
    } else {
        Err("Hook server not running".to_string())
    }
}

/// Health check endpoint - updates heartbeat
async fn handle_ping(State(state): State<Arc<HookServerState>>) -> StatusCode {
    // Update heartbeat timestamp
    let now = chrono_timestamp();
    *state.last_heartbeat.lock() = Some(now);
    
    // Emit heartbeat event to frontend
    let _ = state.app_handle.emit("hook_heartbeat", &serde_json::json!({
        "timestamp": now,
    }));
    
    StatusCode::OK
}

/// Health status endpoint
async fn handle_health(State(state): State<Arc<HookServerState>>) -> Json<HookHealthStatus> {
    let running = *state.running.lock();
    let state_type = if running {
        HookConnectionState::Connected
    } else {
        HookConnectionState::Disconnected
    };
    
    let uptime = state.start_time.elapsed().as_secs();
    let total_requests = *state.total_requests.lock();
    let error_count = *state.error_count.lock();
    let last_heartbeat = *state.last_heartbeat.lock();
    
    Json(HookHealthStatus {
        state: state_type,
        port: HOOK_SERVER_PORT,
        last_heartbeat,
        uptime_secs: Some(uptime),
        total_requests,
        error_count,
    })
}

/// Get current timestamp as string
fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Add an error to the error log
fn add_error_log(state: &HookServerState, error_type: &str, message: &str, details: Option<&str>) {
    let log_entry = HookErrorLog {
        timestamp: chrono_timestamp(),
        error_type: error_type.to_string(),
        message: message.to_string(),
        details: details.map(|s| s.to_string()),
    };
    
    // Increment error count
    *state.error_count.lock() += 1;
    
    // Add to error logs (most recent first)
    let mut logs = state.error_logs.lock();
    logs.push_front(log_entry);
    
    // Keep only the most recent errors
    if logs.len() > MAX_ERROR_LOGS {
        logs.pop_back();
    }
    
    // Emit error event to frontend
    let _ = state.app_handle.emit("hook_error", &serde_json::json!({
        "timestamp": log_entry.timestamp,
        "error_type": log_entry.error_type,
        "message": log_entry.message,
        "details": log_entry.details,
    }));
}

/// Increment request counter
fn increment_request_count(state: &HookServerState) {
    *state.total_requests.lock() += 1;
}

/// Get hook server health status (IPC command)
pub fn get_hook_health() -> HookHealthStatus {
    let state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        let running = *state.running.lock();
        let state_type = if running {
            HookConnectionState::Connected
        } else {
            HookConnectionState::Disconnected
        };
        
        let uptime = state.start_time.elapsed().as_secs();
        let total_requests = *state.total_requests.lock();
        let error_count = *state.error_count.lock();
        let last_heartbeat = *state.last_heartbeat.lock();
        
        HookHealthStatus {
            state: state_type,
            port: HOOK_SERVER_PORT,
            last_heartbeat,
            uptime_secs: Some(uptime),
            total_requests,
            error_count,
        }
    } else {
        HookHealthStatus {
            state: HookConnectionState::Disconnected,
            port: HOOK_SERVER_PORT,
            last_heartbeat: None,
            uptime_secs: None,
            total_requests: 0,
            error_count: 0,
        }
    }
}

/// Get error logs (IPC command)
pub fn get_hook_errors(limit: usize) -> Vec<HookErrorLog> {
    let state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        let logs = state.error_logs.lock();
        logs.iter().take(limit).cloned().collect()
    } else {
        Vec::new()
    }
}

/// Clear error logs (IPC command)
pub fn clear_hook_errors() {
    let state_guard = HOOK_SERVER_STATE.lock();
    if let Some(ref state) = *state_guard {
        state.error_logs.lock().clear();
        *state.error_count.lock() = 0;
    }
}
