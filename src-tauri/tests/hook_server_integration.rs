//! Integration tests for Hook Server types
//!
//! These tests verify the data types used by the hook server.

#[cfg(test)]
mod payload_tests {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct HookPayload {
        session_id: Option<String>,
        transcript_path: Option<String>,
        cwd: Option<String>,
        tool_name: Option<String>,
        tool_input: Option<serde_json::Value>,
    }

    #[test]
    fn test_hook_payload_deserialization() {
        let json = r#"{
            "session_id": "test-123",
            "cwd": "/path/to/project",
            "tool_name": "Read",
            "tool_input": {"file_path": "/test.ts"}
        }"#;

        let payload: HookPayload =
            serde_json::from_str(json).expect("Failed to parse payload");

        assert_eq!(payload.session_id, Some("test-123".to_string()));
        assert_eq!(payload.cwd, Some("/path/to/project".to_string()));
        assert_eq!(payload.tool_name, Some("Read".to_string()));
    }

    #[test]
    fn test_hook_payload_optional_fields() {
        let json = r#"{
            "session_id": "test-456"
        }"#;

        let payload: HookPayload =
            serde_json::from_str(json).expect("Failed to parse payload");

        assert_eq!(payload.session_id, Some("test-456".to_string()));
        assert_eq!(payload.cwd, None);
        assert_eq!(payload.tool_name, None);
    }
}

#[cfg(test)]
mod risk_level_tests {
    fn determine_risk_level(tool_name: &str, tool_input: &serde_json::Value) -> &'static str {
        match tool_name {
            "Bash" => {
                if let Some(cmd) = tool_input.get("command").and_then(|v| v.as_str()) {
                    let cmd_lower = cmd.to_lowercase();
                    if cmd_lower.contains("rm ") || cmd_lower.contains("sudo") {
                        return "high";
                    }
                }
                "medium"
            }
            "Read" | "Glob" | "Grep" => "low",
            "Write" | "Edit" => {
                if let Some(file_path) = tool_input.get("file_path").and_then(|v| v.as_str()) {
                    let path_lower = file_path.to_lowercase();
                    if path_lower.contains(".env") || path_lower.contains("config") {
                        return "high";
                    }
                }
                "medium"
            }
            _ => "medium",
        }
    }

    #[test]
    fn test_bash_dangerous_command() {
        let input = serde_json::json!({ "command": "rm -rf /" });
        assert_eq!(determine_risk_level("Bash", &input), "high");
    }

    #[test]
    fn test_bash_sudo_command() {
        let input = serde_json::json!({ "command": "sudo apt install" });
        assert_eq!(determine_risk_level("Bash", &input), "high");
    }

    #[test]
    fn test_bash_normal_command() {
        let input = serde_json::json!({ "command": "npm install" });
        assert_eq!(determine_risk_level("Bash", &input), "medium");
    }

    #[test]
    fn test_read_is_low_risk() {
        let input = serde_json::json!({ "file_path": "/test.ts" });
        assert_eq!(determine_risk_level("Read", &input), "low");
    }

    #[test]
    fn test_write_sensitive_file() {
        let input = serde_json::json!({ "file_path": "/path/.env" });
        assert_eq!(determine_risk_level("Write", &input), "high");
    }

    #[test]
    fn test_write_normal_file() {
        let input = serde_json::json!({ "file_path": "/src/main.ts" });
        assert_eq!(determine_risk_level("Write", &input), "medium");
    }
}

#[cfg(test)]
mod action_format_tests {
    fn format_tool_action(tool_name: &str, tool_input: &serde_json::Value) -> String {
        match tool_name {
            "Bash" => {
                let cmd = tool_input
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                format!("Execute: {}", cmd)
            }
            "Read" => {
                let path = tool_input
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                format!("Read file: {}", path)
            }
            "Write" => {
                let path = tool_input
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                format!("Write file: {}", path)
            }
            _ => format!("Execute tool: {}", tool_name),
        }
    }

    #[test]
    fn test_format_bash_action() {
        let input = serde_json::json!({ "command": "npm test" });
        assert_eq!(format_tool_action("Bash", &input), "Execute: npm test");
    }

    #[test]
    fn test_format_read_action() {
        let input = serde_json::json!({ "file_path": "/src/test.ts" });
        assert_eq!(format_tool_action("Read", &input), "Read file: /src/test.ts");
    }

    #[test]
    fn test_format_write_action() {
        let input = serde_json::json!({ "file_path": "/src/new.ts" });
        assert_eq!(format_tool_action("Write", &input), "Write file: /src/new.ts");
    }

    #[test]
    fn test_format_unknown_tool() {
        let input = serde_json::json!({});
        assert_eq!(format_tool_action("CustomTool", &input), "Execute tool: CustomTool");
    }
}
