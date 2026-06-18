//! Vibe Island Hooks CLI
//!
//! Lightweight command hook for Claude Code. Reads JSON from stdin,
//! forwards to the Vibe Island app via Named Pipe, and writes responses
//! to stdout only for blocking events (PermissionRequest, PreToolUse).
//!
//! Fail-open: if the app isn't running, exits silently without writing stdout,
//! so the agent continues unaffected.

use std::io::{self, Read, Write};
use std::process;
use std::time::Duration;

const PIPE_NAME: &str = r"\\.\pipe\VibeIsland";
const CONNECT_TIMEOUT_MS: u64 = 500;
const RESPONSE_TIMEOUT_SECS: u64 = 3;
/// PermissionRequest gets a longer timeout (user needs time to review).
const PERMISSION_TIMEOUT_SECS: u64 = 300;

/// Events that require a blocking response from the app.
const BLOCKING_EVENTS: &[&str] = &["PermissionRequest", "PreToolUse"];

fn main() {
    let source = parse_source_arg(std::env::args().skip(1));

    // 1. Read payload from stdin
    let mut input = String::new();
    if let Err(_) = io::stdin().read_to_string(&mut input) {
        process::exit(0); // fail-open
    }

    let input = input.trim();
    if input.is_empty() {
        process::exit(0);
    }

    // 2. Parse to extract event name
    let mut payload: serde_json::Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(_) => process::exit(0),
    };
    enrich_payload_for_source(&mut payload, source);

    let event_name = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let event_name = event_name.to_string();

    let needs_response = BLOCKING_EVENTS.contains(&event_name.as_str());

    // 3. Build envelope with request_id for correlation
    let request_id = format!(
        "{:016x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64
            ^ std::process::id() as u64
    );

    let envelope = serde_json::json!({
        "type": "hook_event",
        "request_id": request_id,
        "hook_event_name": event_name.clone(),
        "source": source,
        "pid": std::process::id(),
        "ppid": get_parent_pid(),
        "payload": payload,
    });

    let message = format!("{}\n", serde_json::to_string(&envelope).unwrap_or_default());

    // 4. Run async pipe communication
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(_) => process::exit(0),
    };

    let result = rt.block_on(async {
        // Connect to Named Pipe with timeout
        let client =
            tokio::time::timeout(Duration::from_millis(CONNECT_TIMEOUT_MS), connect_pipe()).await;

        let mut client = match client {
            Ok(Ok(c)) => c,
            _ => {
                // Fail-open: app not running or timeout
                return None;
            }
        };

        // Send the event
        use tokio::io::AsyncWriteExt;
        if client.write_all(message.as_bytes()).await.is_err() {
            return None;
        }
        if client.flush().await.is_err() {
            return None;
        }

        if !needs_response {
            return None; // fire-and-forget, no response needed
        }

        // Wait for response with timeout
        let timeout = if event_name == "PermissionRequest" {
            Duration::from_secs(PERMISSION_TIMEOUT_SECS)
        } else {
            Duration::from_secs(RESPONSE_TIMEOUT_SECS)
        };

        let response = tokio::time::timeout(timeout, read_pipe_response(&mut client, &request_id))
            .await
            .ok()
            .flatten();

        response
    });

    // 5. Write response to stdout
    // CC 要求 exit 0 时 stdout 必须有合法 JSON
    if let Some(response_json) = result {
        let _ = io::stdout().write_all(response_json.as_bytes());
    } else {
        let _ = io::stdout().write_all(b"{\"continue\":true}");
    }
    let _ = io::stdout().flush();
}

fn parse_source_arg<I>(args: I) -> &'static str
where
    I: IntoIterator<Item = String>,
{
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        if let Some(source) = arg.strip_prefix("--source=") {
            return normalize_source(source);
        }
        if arg == "--source" {
            if let Some(source) = iter.next() {
                return normalize_source(&source);
            }
        }
    }
    "claude"
}

fn normalize_source(source: &str) -> &'static str {
    match source.to_lowercase().as_str() {
        "codex" => "codex",
        _ => "claude",
    }
}

fn enrich_payload_for_source(payload: &mut serde_json::Value, source: &str) {
    let Some(obj) = payload.as_object_mut() else {
        return;
    };

    obj.entry("source".to_string())
        .or_insert_with(|| serde_json::Value::String(source.to_string()));

    if source == "codex" {
        obj.entry("agent_type".to_string())
            .or_insert_with(|| serde_json::Value::String("codex".to_string()));
    }
}

#[cfg(target_os = "windows")]
async fn connect_pipe(
) -> Result<tokio::net::windows::named_pipe::NamedPipeClient, Box<dyn std::error::Error>> {
    use tokio::net::windows::named_pipe::ClientOptions;
    loop {
        match ClientOptions::new().open(PIPE_NAME) {
            Ok(client) => return Ok(client),
            Err(e) if e.raw_os_error() == Some(231) => {
                // ERROR_PIPE_BUSY: server is busy, wait and retry
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(e) => return Err(e.into()),
        }
    }
}

#[cfg(not(target_os = "windows"))]
async fn connect_pipe() -> Result<tokio::net::UnixStream, Box<dyn std::error::Error>> {
    // Non-Windows: use Unix socket
    let socket_path = "/tmp/vibe-island.sock";
    tokio::net::UnixStream::connect(socket_path)
        .await
        .map_err(|e| e.into())
}

async fn read_pipe_response(
    pipe: &mut (dyn tokio::io::AsyncRead + Unpin),
    expected_request_id: &str,
) -> Option<String> {
    use tokio::io::AsyncReadExt;

    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 4096];

    loop {
        match pipe.read(&mut tmp).await {
            Ok(0) => break, // EOF
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                // Check if we have a complete line (newline-delimited JSON)
                while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                    let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
                    let line = String::from_utf8_lossy(&line_bytes[..line_bytes.len() - 1]);

                    if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&line) {
                        if envelope.get("type").and_then(|v| v.as_str()) == Some("hook_response")
                            && envelope.get("request_id").and_then(|v| v.as_str())
                                == Some(expected_request_id)
                        {
                            // Found our response — extract the stdout payload
                            if let Some(stdout_payload) = envelope.get("stdout_payload") {
                                return Some(
                                    serde_json::to_string(stdout_payload).unwrap_or_default(),
                                );
                            }
                            return Some(line.to_string());
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }

    None
}

/// 获取当前进程的父进程 PID
#[cfg(target_os = "windows")]
fn get_parent_pid() -> u32 {
    use windows::Win32::System::Diagnostics::ToolHelp::*;

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let my_pid = std::process::id();
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == my_pid {
                    return entry.th32ParentProcessID;
                }
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        0
    }
}

#[cfg(not(target_os = "windows"))]
fn get_parent_pid() -> u32 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_source_arg_defaults_to_claude() {
        assert_eq!(parse_source_arg(Vec::<String>::new()), "claude");
    }

    #[test]
    fn test_parse_source_arg_accepts_codex_forms() {
        assert_eq!(
            parse_source_arg(vec!["--source".to_string(), "codex".to_string()]),
            "codex"
        );
        assert_eq!(
            parse_source_arg(vec!["--source=codex".to_string()]),
            "codex"
        );
    }

    #[test]
    fn test_enrich_payload_sets_codex_agent_type() {
        let mut payload = serde_json::json!({
            "hook_event_name": "SessionStart",
            "session_id": "s1"
        });
        enrich_payload_for_source(&mut payload, "codex");

        assert_eq!(
            payload.get("source").and_then(|v| v.as_str()),
            Some("codex")
        );
        assert_eq!(
            payload.get("agent_type").and_then(|v| v.as_str()),
            Some("codex")
        );
    }

    #[test]
    fn test_enrich_payload_preserves_explicit_agent_type() {
        let mut payload = serde_json::json!({
            "source": "custom",
            "agent_type": "opencode"
        });
        enrich_payload_for_source(&mut payload, "codex");

        assert_eq!(
            payload.get("source").and_then(|v| v.as_str()),
            Some("custom")
        );
        assert_eq!(
            payload.get("agent_type").and_then(|v| v.as_str()),
            Some("opencode")
        );
    }
}
