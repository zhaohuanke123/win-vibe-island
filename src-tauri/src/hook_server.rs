//! HTTP Hook Server for Claude Code Integration
//!
//! Claude Code supports HTTP hooks that POST JSON to a local server on lifecycle events.
//! This module implements an HTTP server on port 7878 to receive these hooks.
//!
//! Supported hooks:
//! - PreToolUse: Before Claude executes any tool (enables approval flow)
//! - Notification: When Claude needs user attention
//! - Stop: When Claude finishes a response

use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Default port for the hook server
pub const HOOK_SERVER_PORT: u16 = 7878;

/// Hook server state
struct HookServerState {
    running: Mutex<bool>,
    app_handle: AppHandle,
}

/// PreToolUse hook payload from Claude Code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreToolUsePayload {
    /// The tool being invoked (e.g., "Write", "Edit", "Bash")
    pub tool_name: String,
    /// Tool-specific input
    pub tool_input: serde_json::Value,
    /// Session/transcript ID
    #[serde(default)]
    pub transcript_path: Option<String>,
    /// The prompt that led to this tool use
    #[serde(default)]
    pub prompt: Option<String>,
}

/// Notification hook payload from Claude Code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPayload {
    /// Notification message
    pub message: String,
    /// Notification type (e.g., "approval_required", "error", "info")
    #[serde(default)]
    pub notification_type: Option<String>,
    /// Session/transcript ID
    #[serde(default)]
    pub transcript_path: Option<String>,
}

/// Stop hook payload from Claude Code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopPayload {
    /// Reason for stopping (e.g., "end_turn", "max_tokens")
    #[serde(default)]
    pub reason: Option<String>,
    /// Session/transcript ID
    #[serde(default)]
    pub transcript_path: Option<String>,
}

/// Event emitted to frontend when a hook is received
#[derive(Debug, Clone, Serialize)]
pub struct HookEvent {
    pub hook_type: String,
    pub session_id: String,
    pub data: serde_json::Value,
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
    let app_handle = state.app_handle.clone();

    let app = Router::new()
        .route("/hooks/pre-tool-use", post(handle_pre_tool_use))
        .route("/hooks/notification", post(handle_notification))
        .route("/hooks/stop", post(handle_stop))
        .route("/hooks/ping", post(handle_ping))
        .with_state(app_handle);

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

/// Handle PreToolUse hook - triggered before Claude executes any tool
async fn handle_pre_tool_use(
    State(app_handle): State<AppHandle>,
    Json(payload): Json<PreToolUsePayload>,
) -> Result<StatusCode, StatusCode> {
    log::info!(
        "PreToolUse hook received: tool={}, input={:?}",
        payload.tool_name,
        payload.tool_input
    );

    // Generate session ID from transcript path or use default
    let session_id = payload
        .transcript_path
        .clone()
        .unwrap_or_else(|| format!("claude-{}", chrono_timestamp()));

    // Emit event to frontend
    let event = HookEvent {
        hook_type: "pre_tool_use".to_string(),
        session_id: session_id.clone(),
        data: serde_json::to_value(&payload).unwrap_or(serde_json::json!({})),
    };

    if let Err(e) = app_handle.emit("claude_hook", &event) {
        log::error!("Failed to emit PreToolUse event: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Also emit a session_start event if this is a new session
    let _ = app_handle.emit(
        "session_start",
        &serde_json::json!({
            "session_id": session_id,
            "label": format!("Claude Code - {}", payload.tool_name),
            "tool_name": payload.tool_name,
        }),
    );

    // Return 200 to allow the tool to proceed
    // Return 403 to reject the tool (for approval flow)
    Ok(StatusCode::OK)
}

/// Handle Notification hook - triggered when Claude needs user attention
async fn handle_notification(
    State(app_handle): State<AppHandle>,
    Json(payload): Json<NotificationPayload>,
) -> Result<StatusCode, StatusCode> {
    log::info!(
        "Notification hook received: type={:?}, message={}",
        payload.notification_type,
        payload.message
    );

    let session_id = payload
        .transcript_path
        .clone()
        .unwrap_or_else(|| format!("claude-{}", chrono_timestamp()));

    // Emit event to frontend
    let event = HookEvent {
        hook_type: "notification".to_string(),
        session_id: session_id.clone(),
        data: serde_json::to_value(&payload).unwrap_or(serde_json::json!({})),
    };

    if let Err(e) = app_handle.emit("claude_hook", &event) {
        log::error!("Failed to emit Notification event: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // If this is an approval notification, emit state_change
    if payload.notification_type.as_deref() == Some("approval_required") {
        let _ = app_handle.emit(
            "state_change",
            &serde_json::json!({
                "session_id": session_id,
                "state": "approval",
            }),
        );
    }

    Ok(StatusCode::OK)
}

/// Handle Stop hook - triggered when Claude finishes a response
async fn handle_stop(
    State(app_handle): State<AppHandle>,
    Json(payload): Json<StopPayload>,
) -> Result<StatusCode, StatusCode> {
    log::info!("Stop hook received: reason={:?}", payload.reason);

    let session_id = payload
        .transcript_path
        .clone()
        .unwrap_or_else(|| format!("claude-{}", chrono_timestamp()));

    // Emit event to frontend
    let event = HookEvent {
        hook_type: "stop".to_string(),
        session_id: session_id.clone(),
        data: serde_json::to_value(&payload).unwrap_or(serde_json::json!({})),
    };

    if let Err(e) = app_handle.emit("claude_hook", &event) {
        log::error!("Failed to emit Stop event: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Emit state_change to done
    let _ = app_handle.emit(
        "state_change",
        &serde_json::json!({
            "session_id": session_id,
            "state": "done",
        }),
    );

    Ok(StatusCode::OK)
}

/// Health check endpoint
async fn handle_ping() -> StatusCode {
    StatusCode::OK
}

/// Get current timestamp as string
fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
