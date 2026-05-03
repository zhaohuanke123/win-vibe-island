//! Session Persistence Store
//!
//! Stores and loads session data to/from a JSON file.
//! The frontend manages serialization format; backend handles file I/O only.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const SESSION_STORE_VERSION: u32 = 1;
const SESSION_FILE_NAME: &str = "sessions.json";
const EXPIRY_DAYS: i64 = 7;

/// Wrapper for persisted session data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionStore {
    version: u32,
    sessions: Vec<serde_json::Value>,
}

/// Get the sessions file path in the config directory
fn get_session_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vibe-island")
        .join(SESSION_FILE_NAME)
}

/// Ensure the parent directory exists
fn ensure_parent_dir(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create session store directory: {}", e))?;
        }
    }
    Ok(())
}

/// Save sessions to disk
pub fn save_sessions(sessions_json: String) -> Result<(), String> {
    let path = get_session_path();
    ensure_parent_dir(&path)?;

    let sessions: Vec<serde_json::Value> = serde_json::from_str(&sessions_json)
        .map_err(|e| format!("Failed to parse sessions JSON: {}", e))?;

    let store = SessionStore {
        version: SESSION_STORE_VERSION,
        sessions,
    };

    let content = serde_json::to_string_pretty(&store)
        .map_err(|e| format!("Failed to serialize session store: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write sessions file: {}", e))?;

    log::info!("Saved {} sessions to {:?}", store.sessions.len(), path);
    Ok(())
}

/// Load sessions from disk, filtering out expired entries
pub fn load_sessions() -> Result<String, String> {
    let path = get_session_path();

    if !path.exists() {
        log::info!("No saved sessions file at {:?}", path);
        return Ok("[]".to_string());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;

    let store: SessionStore = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session store: {}", e))?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let cutoff = now_ms - (EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    let total_count = store.sessions.len();

    // Filter out expired sessions and reset state to done
    let cleaned: Vec<serde_json::Value> = store
        .sessions
        .into_iter()
        .filter(|s| {
            s.get("lastActivity")
                .and_then(|v| v.as_i64())
                .map(|ts| ts >= cutoff)
                .unwrap_or(false)
        })
        .map(|mut s| {
            // Reset state to done for restored sessions
            if let Some(obj) = s.as_object_mut() {
                obj.insert("state".to_string(), serde_json::Value::String("done".to_string()));
            }
            s
        })
        .collect();

    log::info!(
        "Loaded {} sessions ({} expired) from {:?}",
        cleaned.len(),
        total_count - cleaned.len(),
        path
    );

    Ok(serde_json::to_string(&cleaned).unwrap_or_else(|_| "[]".to_string()))
}

/// Get the session file path (for debugging)
pub fn get_session_path_info() -> String {
    get_session_path().to_string_lossy().to_string()
}
