//! Transcript Discovery
//!
//! Scans `~/.claude/projects/` for JSONL transcript files to recover
//! historical agent sessions. Stream-parses with BufReader to handle
//! large files without loading them entirely into memory.

use crate::agent_event::{AgentTool, SessionOrigin, SessionPhase};
use crate::agent_session::AgentSession;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_FILES: usize = 40;
const MAX_AGE_HOURS: u64 = 24;

/// Metadata extracted from a single JSONL transcript file.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSession {
    pub session_id: String,
    pub cwd: Option<String>,
    pub last_user_prompt: Option<String>,
    pub model: Option<String>,
    pub timestamp: i64,
    pub file_path: String,
}

/// Get the Claude projects directory: `~/.claude/projects/`
fn projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// Current time as epoch millis.
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
}

/// Parse an ISO 8601 timestamp string to epoch millis.
fn parse_timestamp(ts_str: &str) -> Option<i64> {
    // Handle formats like "2026-05-16T14:40:16.376Z" or "2026-05-16T14:40:16.376+08:00"
    let ts_str = ts_str.trim();
    // Try chrono parsing
    chrono::DateTime::parse_from_rfc3339(ts_str)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

/// Collect JSONL files from `~/.claude/projects/` modified within the last 24h.
fn collect_recent_jsonl_files(projects_dir: &Path) -> Vec<PathBuf> {
    let cutoff = now_millis().saturating_sub(MAX_AGE_HOURS * 60 * 60 * 1000);

    let mut entries: Vec<(u64, PathBuf)> = Vec::new();

    if let Ok(dir_iter) = fs::read_dir(projects_dir) {
        for dir_entry in dir_iter.flatten() {
            if dir_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let project_dir = dir_entry.path();
                if let Ok(file_iter) = fs::read_dir(&project_dir) {
                    for file_entry in file_iter.flatten() {
                        let path = file_entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                            let modified = fs::metadata(&path)
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);

                            if modified >= cutoff {
                                entries.push((modified, path));
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort newest first
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.truncate(MAX_FILES);
    entries.into_iter().map(|(_, p)| p).collect()
}

/// Stream-parse a single JSONL transcript file, extracting session metadata.
fn parse_transcript(path: &Path) -> Option<DiscoveredSession> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut session_id: Option<String> = None;
    let mut cwd: Option<String> = None;
    let mut last_user_prompt: Option<String> = None;
    let mut model: Option<String> = None;
    let mut latest_timestamp: Option<i64> = None;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Extract session_id (from any line that has it)
        if session_id.is_none() {
            if let Some(sid) = value.get("sessionId").and_then(|v| v.as_str()) {
                session_id = Some(sid.to_string());
            }
        }

        // Extract cwd
        if cwd.is_none() {
            if let Some(c) = value.get("cwd").and_then(|v| v.as_str()) {
                cwd = Some(c.to_string());
            }
        }

        // Extract model from assistant messages
        if model.is_none() {
            if value.get("type").and_then(|v| v.as_str()) == Some("assistant") {
                if let Some(m) = value
                    .get("message")
                    .and_then(|msg| msg.get("model"))
                    .and_then(|v| v.as_str())
                {
                    model = Some(m.to_string());
                }
            }
        }

        // Extract last user prompt text
        if value.get("type").and_then(|v| v.as_str()) == Some("user") {
            if let Some(content) = value.get("message").and_then(|m| m.get("content")) {
                if let Some(arr) = content.as_array() {
                    for item in arr {
                        if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                                let text = text.trim();
                                // Skip IDE metadata lines
                                if !text.starts_with("<ide_") && !text.is_empty() {
                                    last_user_prompt = Some(text.to_string());
                                }
                            }
                        }
                    }
                } else if let Some(text) = content.as_str() {
                    let text = text.trim();
                    if !text.is_empty() {
                        last_user_prompt = Some(text.to_string());
                    }
                }
            }
        }

        // Track latest timestamp
        if let Some(ts_str) = value.get("timestamp").and_then(|v| v.as_str()) {
            if let Some(ts) = parse_timestamp(ts_str) {
                match latest_timestamp {
                    None => latest_timestamp = Some(ts),
                    Some(current) => {
                        if ts > current {
                            latest_timestamp = Some(ts);
                        }
                    }
                }
            }
        }
    }

    let session_id = session_id?;

    // Derive session_id from file name if not found in content
    Some(DiscoveredSession {
        session_id,
        cwd,
        last_user_prompt,
        model,
        timestamp: latest_timestamp.unwrap_or(0),
        file_path: path.to_string_lossy().to_string(),
    })
}

/// Scan for recent Claude Code transcript files and return discovered sessions.
pub fn discover_sessions() -> Vec<DiscoveredSession> {
    let projects_dir = match projects_dir() {
        Some(d) => d,
        None => {
            log::warn!("TranscriptDiscovery: cannot find home directory");
            return Vec::new();
        }
    };

    if !projects_dir.exists() {
        log::info!("TranscriptDiscovery: projects dir {:?} does not exist", projects_dir);
        return Vec::new();
    }

    let files = collect_recent_jsonl_files(&projects_dir);
    log::info!("TranscriptDiscovery: scanning {} JSONL files", files.len());

    let mut results = Vec::new();
    for path in &files {
        match parse_transcript(path) {
            Some(session) => results.push(session),
            None => {
                log::debug!("TranscriptDiscovery: failed to parse {:?}", path);
            }
        }
    }

    log::info!("TranscriptDiscovery: found {} sessions", results.len());
    results
}

/// Convert discovered sessions into AgentSession objects for merging into session state.
pub fn to_agent_sessions(discovered: &[DiscoveredSession]) -> Vec<AgentSession> {
    let now_ts = now_millis() as i64;
    discovered
        .iter()
        .map(|d| {
            let label = d
                .cwd
                .as_ref()
                .and_then(|c| Path::new(c).file_name())
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| {
                    format!("session-{}", &d.session_id[..d.session_id.len().min(8)])
                });

            let mut session = AgentSession::new(
                d.session_id.clone(),
                label,
                AgentTool::ClaudeCode,
                d.timestamp,
            );
            session.cwd = d.cwd.clone();
            session.model = d.model.clone();
            session.phase = SessionPhase::Completed;
            session.origin = Some(SessionOrigin::Transcript);
            session.last_activity = if d.timestamp > 0 { d.timestamp } else { now_ts };
            session.title = d.last_user_prompt.clone();
            session.is_completed = true;
            session
        })
        .collect()
}

/// Merge discovered transcript sessions into the global session state.
/// Existing sessions are preserved; discovered sessions only fill in gaps.
pub fn merge_into_state(discovered: &[DiscoveredSession]) -> usize {
    let sessions = to_agent_sessions(discovered);
    let merged = crate::session_state::merge_sessions(sessions);
    log::info!("TranscriptDiscovery: merged {} new sessions into state", merged);
    merged
}
