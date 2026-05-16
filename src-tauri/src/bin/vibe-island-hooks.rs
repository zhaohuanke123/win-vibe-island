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
    let payload: serde_json::Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(_) => process::exit(0),
    };

    let event_name = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let needs_response = BLOCKING_EVENTS.contains(&event_name);

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
        "hook_event_name": event_name,
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
        let client = tokio::time::timeout(
            Duration::from_millis(CONNECT_TIMEOUT_MS),
            connect_pipe(),
        )
        .await;

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

    // 5. Write response to stdout if we got one
    if let Some(response_json) = result {
        let _ = io::stdout().write_all(response_json.as_bytes());
        let _ = io::stdout().flush();
    }
    // If no response: fail-open, exit silently (no stdout = agent continues)
}

#[cfg(target_os = "windows")]
async fn connect_pipe() -> Result<tokio::net::windows::named_pipe::NamedPipeClient, Box<dyn std::error::Error>> {
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
    tokio::net::UnixStream::connect(socket_path).await.map_err(|e| e.into())
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
                            && envelope.get("request_id").and_then(|v| v.as_str()) == Some(expected_request_id)
                        {
                            // Found our response — extract the stdout payload
                            if let Some(stdout_payload) = envelope.get("stdout_payload") {
                                return Some(serde_json::to_string(stdout_payload).unwrap_or_default());
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
