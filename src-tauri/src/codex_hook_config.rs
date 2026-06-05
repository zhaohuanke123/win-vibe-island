//! Codex CLI Hook 配置管理。
//!
//! 默认写入 `~/.codex/hooks.json`，安装生命周期 hooks 和轻量工具活动 hooks：
//! `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`。
//! 合并和卸载都以 hook group 为单位，只触碰指向
//! `vibe-island-hooks.exe --source codex` 的 Vibe Island 配置。

use crate::hook_config::{self, HookConfigMode, HookConfigStatus, HookDetailStatus};
use crate::hook_manifest;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

const REQUIRED_CODEX_HOOKS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
];
const CODEX_SESSION_START_MATCHER: &str = "startup|resume|clear|compact";
const CODEX_TOOL_MATCHER: &str = "*";
const CODEX_HOOK_TIMEOUT_SECS: u64 = 3;

fn get_default_hooks_path() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        home.join(".codex").join("hooks.json")
    } else {
        PathBuf::from(".codex").join("hooks.json")
    }
}

fn read_hooks_json(path: &PathBuf) -> Value {
    if !path.exists() {
        return serde_json::json!({});
    }
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return serde_json::json!({}),
    };
    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() {
        return serde_json::json!({});
    }
    serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
}

fn write_hooks_json(path: &PathBuf, settings: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize Codex hooks: {}", e))?;
    let mut file =
        fs::File::create(path).map_err(|e| format!("Failed to create hooks.json: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write hooks.json: {}", e))?;
    Ok(())
}

fn codex_hook_command() -> String {
    let hooks_bin = hook_config::get_hooks_bin_path();
    let hooks_bin_str = hooks_bin.to_string_lossy().to_string().replace('\\', "/");
    format!("\"{}\" --source codex", hooks_bin_str)
}

fn is_vibe_codex_single_hook(hook: &Value) -> bool {
    if hook.get("type").and_then(|v| v.as_str()) != Some("command") {
        return false;
    }
    hook.get("command")
        .and_then(|v| v.as_str())
        .map(|cmd| {
            let lower = cmd.to_lowercase();
            lower.contains("vibe-island-hooks") && lower.contains("--source codex")
        })
        .unwrap_or(false)
}

fn group_contains_vibe_codex_hook(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|hooks| hooks.iter().any(is_vibe_codex_single_hook))
        .unwrap_or(false)
}

fn generate_codex_hook_config() -> Value {
    let command = codex_hook_command();
    serde_json::json!({
        "hooks": {
            "SessionStart": [
                {
                    "matcher": CODEX_SESSION_START_MATCHER,
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": CODEX_HOOK_TIMEOUT_SECS
                        }
                    ]
                }
            ],
            "UserPromptSubmit": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": CODEX_HOOK_TIMEOUT_SECS
                        }
                    ]
                }
            ],
            "PreToolUse": [
                {
                    "matcher": CODEX_TOOL_MATCHER,
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": CODEX_HOOK_TIMEOUT_SECS
                        }
                    ]
                }
            ],
            "PostToolUse": [
                {
                    "matcher": CODEX_TOOL_MATCHER,
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": CODEX_HOOK_TIMEOUT_SECS
                        }
                    ]
                }
            ],
            "Stop": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": CODEX_HOOK_TIMEOUT_SECS
                        }
                    ]
                }
            ]
        }
    })
}

fn compute_codex_hook_details(settings: &Value) -> (Vec<String>, Vec<(String, HookDetailStatus)>) {
    let hooks_obj = settings.get("hooks").and_then(|h| h.as_object());
    let mut configured = Vec::new();
    let mut details = Vec::new();

    for hook_name in REQUIRED_CODEX_HOOKS {
        match hooks_obj {
            Some(obj) if obj.contains_key(*hook_name) => {
                let groups = obj.get(*hook_name).and_then(|v| v.as_array());
                let has_vibe = groups
                    .map(|arr| arr.iter().any(group_contains_vibe_codex_hook))
                    .unwrap_or(false);
                if has_vibe {
                    details.push((hook_name.to_string(), HookDetailStatus::Installed));
                    configured.push(hook_name.to_string());
                } else {
                    details.push((hook_name.to_string(), HookDetailStatus::External));
                }
            }
            _ => details.push((hook_name.to_string(), HookDetailStatus::Missing)),
        }
    }

    (configured, details)
}

fn merge_codex_hooks(existing: &mut Value, vibe_hooks: &Value) {
    let Some(vibe_map) = vibe_hooks.get("hooks").and_then(|h| h.as_object()) else {
        return;
    };

    if existing.get("hooks").is_none() {
        existing["hooks"] = serde_json::json!({});
    }

    let Some(existing_map) = existing.get_mut("hooks").and_then(|h| h.as_object_mut()) else {
        existing["hooks"] = vibe_hooks
            .get("hooks")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        return;
    };

    for (hook_name, vibe_groups) in vibe_map {
        let vibe_groups_arr = vibe_groups.as_array().cloned().unwrap_or_default();
        let preserved = existing_map
            .get(hook_name)
            .and_then(|v| v.as_array())
            .map(|groups| {
                groups
                    .iter()
                    .filter(|g| !group_contains_vibe_codex_hook(g))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let merged = preserved
            .into_iter()
            .chain(vibe_groups_arr.into_iter())
            .collect::<Vec<_>>();
        existing_map.insert(hook_name.clone(), Value::Array(merged));
    }
}

fn remove_codex_hooks_filtered(settings: &mut Value, hooks_to_remove: &[String]) {
    let Some(hooks_map) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) else {
        return;
    };

    for hook_name in hooks_to_remove {
        if let Some(groups) = hooks_map.get(hook_name).and_then(|v| v.as_array()).cloned() {
            let preserved = groups
                .into_iter()
                .filter(|g| !group_contains_vibe_codex_hook(g))
                .collect::<Vec<_>>();
            if preserved.is_empty() {
                hooks_map.remove(hook_name);
            } else {
                hooks_map.insert(hook_name.clone(), Value::Array(preserved));
            }
        }
    }

    if hooks_map.is_empty() {
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("hooks");
        }
    }
}

pub fn check_codex_hook_config() -> HookConfigStatus {
    let hooks_path = get_default_hooks_path();
    let settings = read_hooks_json(&hooks_path);
    let (configured_hooks, hook_details) = compute_codex_hook_details(&settings);
    let missing_hooks = hook_details
        .iter()
        .filter(|(_, status)| !matches!(status, HookDetailStatus::Installed))
        .map(|(name, _)| name.clone())
        .collect::<Vec<_>>();

    let configured = missing_hooks.is_empty();
    let partial = !configured && !configured_hooks.is_empty();

    HookConfigStatus {
        configured,
        partial,
        mode: hook_config::get_stored_mode(),
        settings_path: Some(hooks_path.to_string_lossy().to_string()),
        configured_hooks,
        missing_hooks,
        manifest_present: false,
        manifest_installed_at: None,
        manifest_app_version: None,
        hook_details,
    }
}

pub fn install_codex_hooks() -> Result<String, String> {
    if let Err(e) = hook_config::deploy_hooks_binary() {
        log::warn!("Could not deploy hooks binary for Codex: {}", e);
    }

    let hooks_path = get_default_hooks_path();
    if let Some(dir) = hooks_path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create .codex directory: {}", e))?;
    }

    hook_manifest::create_timestamped_backup(&hooks_path)?;

    let mut settings = read_hooks_json(&hooks_path);
    let vibe_hooks = generate_codex_hook_config();
    merge_codex_hooks(&mut settings, &vibe_hooks);
    write_hooks_json(&hooks_path, &settings)?;

    Ok(hooks_path.to_string_lossy().to_string())
}

pub fn uninstall_codex_hooks() -> Result<(), String> {
    let hooks_path = get_default_hooks_path();
    if !hooks_path.exists() {
        return Ok(());
    }

    hook_manifest::create_timestamped_backup(&hooks_path)?;

    let mut settings = read_hooks_json(&hooks_path);
    let hooks_to_remove = REQUIRED_CODEX_HOOKS
        .iter()
        .map(|h| h.to_string())
        .collect::<Vec<_>>();
    remove_codex_hooks_filtered(&mut settings, &hooks_to_remove);
    write_hooks_json(&hooks_path, &settings)?;
    Ok(())
}

#[allow(dead_code)]
pub fn auto_configure_codex_hooks() -> Result<bool, String> {
    if hook_config::get_stored_mode() == HookConfigMode::Manual {
        return Ok(false);
    }
    let status = check_codex_hook_config();
    if status.configured {
        return Ok(false);
    }
    install_codex_hooks()?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_codex_hook_config_contains_default_hooks() {
        let config = generate_codex_hook_config();
        let hooks = config.get("hooks").unwrap().as_object().unwrap();

        for hook_name in REQUIRED_CODEX_HOOKS {
            assert!(
                hooks.contains_key(*hook_name),
                "Missing hook: {}",
                hook_name
            );
        }
        assert!(!hooks.contains_key("PermissionRequest"));
        assert!(hooks.contains_key("PreToolUse"));
        assert!(hooks.contains_key("PostToolUse"));
    }

    #[test]
    fn test_codex_hook_command_has_source() {
        let config = generate_codex_hook_config();
        let hooks = config.get("hooks").unwrap().as_object().unwrap();
        let session_start = hooks
            .get("SessionStart")
            .and_then(|v| v.as_array())
            .and_then(|v| v.first())
            .and_then(|v| v.get("hooks"))
            .and_then(|v| v.as_array())
            .and_then(|v| v.first())
            .unwrap();
        let command = session_start
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap();
        assert!(command.contains("--source codex"));
    }

    #[test]
    fn test_merge_codex_hooks_preserves_external_group() {
        let mut existing = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "matcher": "startup",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "other-tool.exe"
                            }
                        ]
                    }
                ]
            }
        });

        let vibe_hooks = generate_codex_hook_config();
        merge_codex_hooks(&mut existing, &vibe_hooks);

        let groups = existing["hooks"]["SessionStart"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert!(groups.iter().any(|g| {
            g["hooks"][0]["command"]
                .as_str()
                .map(|cmd| cmd == "other-tool.exe")
                .unwrap_or(false)
        }));
        assert!(groups.iter().any(group_contains_vibe_codex_hook));
    }

    #[test]
    fn test_compute_status_treats_external_hooks_as_not_installed() {
        let settings = serde_json::json!({
            "hooks": {
                "SessionStart": [{ "hooks": [{ "type": "command", "command": "other-tool.exe" }] }],
                "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "other-tool.exe" }] }],
                "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "other-tool.exe" }] }],
                "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "other-tool.exe" }] }],
                "Stop": [{ "hooks": [{ "type": "command", "command": "other-tool.exe" }] }]
            }
        });

        let (configured, details) = compute_codex_hook_details(&settings);

        assert!(configured.is_empty());
        assert!(details
            .iter()
            .all(|(_, status)| matches!(status, HookDetailStatus::External)));
    }

    #[test]
    fn test_remove_codex_hooks_only_removes_vibe_groups() {
        let mut settings = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": "\"C:/vibe-island-hooks.exe\" --source codex"
                            }
                        ]
                    },
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": "other-tool.exe"
                            }
                        ]
                    }
                ],
                "Stop": [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": "\"C:/vibe-island-hooks.exe\" --source codex"
                            }
                        ]
                    }
                ]
            }
        });

        let hooks = vec!["SessionStart".to_string(), "Stop".to_string()];
        remove_codex_hooks_filtered(&mut settings, &hooks);

        assert_eq!(
            settings["hooks"]["SessionStart"].as_array().unwrap().len(),
            1
        );
        assert_eq!(
            settings["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str(),
            Some("other-tool.exe")
        );
        assert!(settings["hooks"].get("Stop").is_none());
    }
}
