use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static DEMO_RUNNING: AtomicBool = AtomicBool::new(false);
static DEMO_THREAD_HANDLE: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DemoConfig {
    /// Delay between state transitions in milliseconds
    pub transition_delay_ms: u64,
    /// Number of sessions to create (0 = infinite)
    pub session_count: u32,
    /// Delay between spawning new sessions in milliseconds
    pub session_spawn_delay_ms: u64,
}

impl Default for DemoConfig {
    fn default() -> Self {
        Self {
            transition_delay_ms: 1000,
            session_count: 0,
            session_spawn_delay_ms: 2000,
        }
    }
}

static DEMO_CONFIG: Mutex<DemoConfig> = Mutex::new(DemoConfig {
    transition_delay_ms: 1000,
    session_count: 0,
    session_spawn_delay_ms: 2000,
});

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn start_demo_mode(app: AppHandle) -> Result<(), String> {
    if DEMO_RUNNING.load(Ordering::SeqCst) {
        return Err("Demo mode is already running".to_string());
    }

    DEMO_RUNNING.store(true, Ordering::SeqCst);

    let handle = thread::spawn(move || {
        let config = DEMO_CONFIG.lock().unwrap().clone();
        let mut sessions_created = 0u32;

        while DEMO_RUNNING.load(Ordering::SeqCst) {
            // Check if we've reached the session limit
            if config.session_count > 0 && sessions_created >= config.session_count {
                break;
            }

            // Create a new session
            let session_id = format!("demo-session-{}", SESSION_COUNTER.fetch_add(1, Ordering::SeqCst));
            let label = format!("Demo Agent #{}", sessions_created + 1);

            // Emit session_start event
            let _ = app.emit("session_start", serde_json::json!({
                "session_id": &session_id,
                "label": &label,
                "pid": None::<u32>
            }));

            // Cycle through states
            let states = ["idle", "running", "approval", "done"];
            for state in states {
                if !DEMO_RUNNING.load(Ordering::SeqCst) {
                    break;
                }

                thread::sleep(Duration::from_millis(config.transition_delay_ms));

                if !DEMO_RUNNING.load(Ordering::SeqCst) {
                    break;
                }

                let _ = app.emit("state_change", serde_json::json!({
                    "session_id": &session_id,
                    "state": state
                }));
            }

            // Wait before removing session
            thread::sleep(Duration::from_millis(config.transition_delay_ms));

            // Emit session_end event
            let _ = app.emit("session_end", serde_json::json!({
                "session_id": &session_id
            }));

            sessions_created += 1;

            // Wait before spawning next session
            if DEMO_RUNNING.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(config.session_spawn_delay_ms));
            }
        }
    });

    *DEMO_THREAD_HANDLE.lock().unwrap() = Some(handle);

    Ok(())
}

pub fn stop_demo_mode() -> Result<(), String> {
    if !DEMO_RUNNING.load(Ordering::SeqCst) {
        return Err("Demo mode is not running".to_string());
    }

    DEMO_RUNNING.store(false, Ordering::SeqCst);

    // Wait for the thread to finish
    if let Some(handle) = DEMO_THREAD_HANDLE.lock().unwrap().take() {
        let _ = handle.join();
    }

    Ok(())
}

pub fn set_demo_config(config: DemoConfig) -> Result<(), String> {
    *DEMO_CONFIG.lock().unwrap() = config;
    Ok(())
}

pub fn get_demo_config() -> DemoConfig {
    DEMO_CONFIG.lock().unwrap().clone()
}

pub fn is_demo_running() -> bool {
    DEMO_RUNNING.load(Ordering::SeqCst)
}