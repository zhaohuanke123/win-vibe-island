use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

static PIPE_SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Pipe name for the VibeIsland event channel
pub const PIPE_NAME: &str = r"\\.\pipe\VibeIsland";

/// Agent event received from SDK clients
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

    let pipe_name = PIPE_NAME.to_string();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async {
            if let Err(e) = run_pipe_server(&pipe_name, state, app).await {
                log::error!("Pipe server error: {}", e);
            }
        });
    });

    log::info!("Named pipe server started at {}", PIPE_NAME);
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
        pipe_name: PIPE_NAME.to_string(),
    }
}

/// Check if the pipe server is running
pub fn is_pipe_server_running() -> bool {
    PIPE_SERVER_RUNNING.load(Ordering::SeqCst)
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
        let server = ServerOptions::new()
            .first_pipe_instance(false)
            .create(pipe_name)
            .map_err(|e| format!("Failed to create named pipe: {}", e))?;

        // Wait for a client to connect
        server
            .connect()
            .await
            .map_err(|e| format!("Failed to wait for pipe connection: {}", e))?;

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
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
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

    let mut buffer = Vec::with_capacity(4096);
    let mut temp_buf = [0u8; 4096];

    loop {
        if !state.is_running() {
            break;
        }

        // Read data from the pipe
        match server.read(&mut temp_buf).await {
            Ok(0) => {
                // Connection closed by client
                log::info!("Client disconnected from named pipe");
                break;
            }
            Ok(n) => {
                buffer.extend_from_slice(&temp_buf[..n]);

                // Try to parse complete JSON messages (newline-delimited)
                while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                    let message_bytes = buffer.drain(..=pos).collect::<Vec<_>>();
                    let message_str = String::from_utf8_lossy(&message_bytes[..message_bytes.len() - 1]); // Exclude newline

                    // Parse and handle the event
                    match serde_json::from_str::<AgentEvent>(&message_str) {
                        Ok(event) => {
                            handle_agent_event(&app, event);
                        }
                        Err(e) => {
                            log::warn!("Failed to parse agent event: {} (message: {})", e, message_str);
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

fn handle_agent_event(app: &AppHandle, event: AgentEvent) {
    log::debug!("Received agent event: {:?}", event);

    // Emit state_change event to frontend
    let _ = app.emit("state_change", &StateChange {
        session_id: event.session_id.clone(),
        state: event.state.clone(),
    });

    // If there's additional payload, emit it as well
    if let Some(ref payload) = event.payload {
        // Check for special payload types
        if let Some(event_type) = payload.get("event_type").and_then(|v| v.as_str()) {
            match event_type {
                "session_start" => {
                    let label = payload
                        .get("label")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Agent Session")
                        .to_string();
                    let pid = payload.get("pid").and_then(|v| v.as_u64()).map(|v| v as u32);

                    let _ = app.emit("session_start", &SessionStart {
                        session_id: event.session_id.clone(),
                        label,
                        pid,
                    });
                }
                "session_end" => {
                    let _ = app.emit("session_end", &SessionEnd {
                        session_id: event.session_id.clone(),
                    });
                }
                _ => {}
            }
        }
    }
}
