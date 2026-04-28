use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Known AI coding agent process names to detect
const KNOWN_AGENTS: &[&str] = &[
    "claude.exe",
    "claude",
    "codex.exe",
    "codex",
    "aider.exe",
    "aider",
    "cursor.exe",
    "cursor",
    "copilot-agent.exe",
    "copilot-agent",
];

/// Process information for a detected agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    /// Process ID
    pub pid: u32,
    /// Process name (executable name)
    pub name: String,
    /// Command line arguments (if available)
    pub command_line: Option<String>,
    /// Timestamp when the process was first detected
    pub detected_at: u64,
    /// Whether this is a known agent process
    pub is_agent: bool,
    /// Agent type identifier (e.g., "claude", "codex")
    pub agent_type: Option<String>,
}

/// Event emitted when a process is detected
#[derive(Debug, Clone, Serialize)]
pub struct ProcessDetected {
    pub process: ProcessInfo,
}

/// Event emitted when a process terminates
#[derive(Debug, Clone, Serialize)]
pub struct ProcessTerminated {
    pub pid: u32,
    pub name: String,
    pub agent_type: Option<String>,
}

/// Status of the process watcher
#[derive(Debug, Clone, Serialize)]
pub struct ProcessWatcherStatus {
    pub running: bool,
    pub poll_interval_ms: u64,
    pub detected_count: usize,
}

/// Configuration for the process watcher
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessWatcherConfig {
    /// Poll interval in milliseconds (default: 5000)
    pub poll_interval_ms: u64,
    /// Whether to detect node processes with CLI args
    pub detect_node_claude: bool,
}

impl Default for ProcessWatcherConfig {
    fn default() -> Self {
        Self {
            poll_interval_ms: 5000,
            detect_node_claude: true,
        }
    }
}

/// Internal state for the process watcher
struct ProcessWatcherState {
    running: AtomicBool,
    config: Mutex<ProcessWatcherConfig>,
    /// Map of PID -> ProcessInfo for currently detected processes
    detected_processes: Mutex<HashMap<u32, ProcessInfo>>,
}

impl ProcessWatcherState {
    fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
            config: Mutex::new(ProcessWatcherConfig::default()),
            detected_processes: Mutex::new(HashMap::new()),
        }
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn set_running(&self, value: bool) {
        self.running.store(value, Ordering::SeqCst);
    }

    fn get_config(&self) -> ProcessWatcherConfig {
        self.config.lock().clone()
    }

    fn set_config(&self, config: ProcessWatcherConfig) {
        *self.config.lock() = config;
    }
}

static PROCESS_WATCHER_STATE: Mutex<Option<Arc<ProcessWatcherState>>> = Mutex::new(None);

/// Start the process watcher
pub fn start_process_watcher(app: AppHandle) -> Result<(), String> {
    let mut state_guard = PROCESS_WATCHER_STATE.lock();
    if let Some(ref state) = *state_guard {
        if state.is_running() {
            return Err("Process watcher is already running".to_string());
        }
    }

    let state = Arc::new(ProcessWatcherState::new());
    state.set_running(true);
    *state_guard = Some(state.clone());
    drop(state_guard);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async {
            if let Err(e) = run_process_watcher(state, app).await {
                log::error!("Process watcher error: {}", e);
            }
        });
    });

    log::info!("Process watcher started");
    Ok(())
}

/// Stop the process watcher
pub fn stop_process_watcher() -> Result<(), String> {
    let mut state_guard = PROCESS_WATCHER_STATE.lock();
    if let Some(ref state) = *state_guard {
        if !state.is_running() {
            return Err("Process watcher is not running".to_string());
        }
        state.set_running(false);
    } else {
        return Err("Process watcher is not running".to_string());
    }
    *state_guard = None;
    log::info!("Process watcher stopped");
    Ok(())
}

/// Get the current status of the process watcher
pub fn get_process_watcher_status() -> ProcessWatcherStatus {
    let state_guard = PROCESS_WATCHER_STATE.lock();
    let (running, poll_interval_ms, detected_count) = match state_guard.as_ref() {
        Some(state) => {
            let config = state.get_config();
            let processes = state.detected_processes.lock();
            (
                state.is_running(),
                config.poll_interval_ms,
                processes.len(),
            )
        }
        None => (false, 5000, 0),
    };
    ProcessWatcherStatus {
        running,
        poll_interval_ms,
        detected_count,
    }
}

/// Get the list of currently detected processes
pub fn get_detected_processes() -> Vec<ProcessInfo> {
    let state_guard = PROCESS_WATCHER_STATE.lock();
    match state_guard.as_ref() {
        Some(state) => {
            let processes = state.detected_processes.lock();
            processes.values().cloned().collect()
        }
        None => Vec::new(),
    }
}

/// Set the process watcher configuration
pub fn set_process_watcher_config(config: ProcessWatcherConfig) -> Result<(), String> {
    let state_guard = PROCESS_WATCHER_STATE.lock();
    match state_guard.as_ref() {
        Some(state) => {
            state.set_config(config);
            Ok(())
        }
        None => Err("Process watcher is not running".to_string()),
    }
}

async fn run_process_watcher(
    state: Arc<ProcessWatcherState>,
    app: AppHandle,
) -> Result<(), String> {
    loop {
        if !state.is_running() {
            break;
        }

        let config = state.get_config();

        // Enumerate processes
        #[cfg(target_os = "windows")]
        {
            let current_processes = enumerate_processes_windows(&config)?;
            update_detected_processes(&state, &app, current_processes);
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = &app;
            log::warn!("Process enumeration is only supported on Windows");
            break;
        }

        // Wait for next poll interval
        tokio::time::sleep(tokio::time::Duration::from_millis(config.poll_interval_ms)).await;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn enumerate_processes_windows(config: &ProcessWatcherConfig) -> Result<Vec<ProcessInfo>, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32,
        TH32CS_SNAPPROCESS,
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|e| format!("Failed to create process snapshot: {}", e))?;

    let mut processes = Vec::new();

    let mut entry = PROCESSENTRY32 {
        dwSize: std::mem::size_of::<PROCESSENTRY32>() as u32,
        ..Default::default()
    };

    unsafe {
        if Process32First(snapshot, &mut entry).is_ok() {
            loop {
                let pid = entry.th32ProcessID;
                // szExeFile is a [i8; 260] array (C char)
                let name_bytes: &[u8] = std::slice::from_raw_parts(
                    entry.szExeFile.as_ptr() as *const u8,
                    entry.szExeFile.len(),
                );
                let name = String::from_utf8_lossy(name_bytes)
                    .trim_end_matches('\0')
                    .to_string();

                // Check if this is a known agent
                let (is_agent, agent_type) = check_if_agent(&name, None);

                // If configured to detect node processes with claude CLI args
                let (is_agent, agent_type) = if !is_agent && config.detect_node_claude {
                    if name.to_lowercase() == "node.exe" || name.to_lowercase() == "node" {
                        // Try to get command line to check for claude CLI
                        if let Some(cmdline) = get_process_command_line(pid) {
                            let cmd_lower = cmdline.to_lowercase();
                            if cmd_lower.contains("claude") || cmd_lower.contains("codex") {
                                let agent_type = if cmd_lower.contains("claude") {
                                    Some("claude".to_string())
                                } else {
                                    Some("codex".to_string())
                                };
                                (true, agent_type)
                            } else {
                                (is_agent, agent_type)
                            }
                        } else {
                            (is_agent, agent_type)
                        }
                    } else {
                        (is_agent, agent_type)
                    }
                } else {
                    (is_agent, agent_type)
                };

                // Only include agent processes or all if needed for tracking
                if is_agent {
                    processes.push(ProcessInfo {
                        pid,
                        name: name.clone(),
                        command_line: None,
                        detected_at: now,
                        is_agent,
                        agent_type,
                    });
                }

                if Process32Next(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
    }

    unsafe {
        let _ = CloseHandle(snapshot);
    }

    Ok(processes)
}

/// Check if a process name matches known agent patterns
fn check_if_agent(name: &str, _command_line: Option<&str>) -> (bool, Option<String>) {
    let name_lower = name.to_lowercase();

    for &agent in KNOWN_AGENTS {
        if name_lower == agent || name_lower == format!("{}.exe", agent) {
            let agent_type = agent.trim_end_matches(".exe").to_string();
            return (true, Some(agent_type));
        }
    }

    (false, None)
}

#[cfg(target_os = "windows")]
fn get_process_command_line(pid: u32) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if handle.is_err() {
            return None;
        }
        let handle = handle.unwrap();

        // Use NtQueryInformationProcess to get command line
        // For simplicity, we'll skip this complex implementation
        // and rely on process name matching only for now
        let _ = CloseHandle(handle);
    }

    None
}

/// Update detected processes and emit events for new/terminated processes
fn update_detected_processes(
    state: &Arc<ProcessWatcherState>,
    app: &AppHandle,
    current_processes: Vec<ProcessInfo>,
) {
    let mut detected = state.detected_processes.lock();

    // Build a map of current PIDs
    let current_pids: std::collections::HashSet<u32> =
        current_processes.iter().map(|p| p.pid).collect();

    // Find terminated processes
    let terminated: Vec<ProcessInfo> = detected
        .iter()
        .filter(|(pid, _)| !current_pids.contains(pid))
        .map(|(_, info)| info.clone())
        .collect();

    // Emit ProcessTerminated events
    for proc in terminated {
        let _ = app.emit(
            "process_terminated",
            &ProcessTerminated {
                pid: proc.pid,
                name: proc.name.clone(),
                agent_type: proc.agent_type.clone(),
            },
        );
        log::info!("Process terminated: {} (PID: {})", proc.name, proc.pid);
        detected.remove(&proc.pid);
    }

    // Find new processes
    for proc in current_processes {
        if !detected.contains_key(&proc.pid) {
            // New process detected
            let _ = app.emit(
                "process_detected",
                &ProcessDetected {
                    process: proc.clone(),
                },
            );
            log::info!(
                "Process detected: {} (PID: {}, agent: {:?})",
                proc.name,
                proc.pid,
                proc.agent_type
            );
            detected.insert(proc.pid, proc);
        }
    }
}
