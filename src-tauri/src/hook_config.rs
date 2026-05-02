//! Hook Configuration Management
//!
//! This module handles automatic configuration of Claude Code hooks.
//! On startup, it checks if hooks are configured and can auto-install them.
//! On exit (in auto-cleanup mode), it can remove the hooks.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

/// Hook configuration modes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HookConfigMode {
    /// Auto-configure on startup, keep hooks on exit (default)
    Auto,
    /// Auto-configure on startup, remove hooks on exit
    AutoCleanup,
    /// Manual mode - don't auto-configure, user manages settings
    Manual,
}

impl Default for HookConfigMode {
    fn default() -> Self {
        HookConfigMode::Auto
    }
}

/// Hook configuration status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookConfigStatus {
    /// Whether hooks are configured
    pub configured: bool,
    /// Whether hooks are partially configured (some missing)
    pub partial: bool,
    /// Configuration mode
    pub mode: HookConfigMode,
    /// Path to the settings file
    pub settings_path: Option<String>,
    /// List of configured hook events
    pub configured_hooks: Vec<String>,
    /// List of missing hook events
    pub missing_hooks: Vec<String>,
}

/// Required hook events for Vibe Island
const REQUIRED_HOOKS: &[&str] = &[
    "SessionStart",
    "PreToolUse",
    "PostToolUse",
    "Notification",
    "Stop",
    "UserPromptSubmit",
    "PermissionRequest",
];

/// Hook server URL
const HOOK_SERVER_URL: &str = "http://localhost:7878";

/// Backup file extension
const BACKUP_EXT: &str = ".vibe-island-backup";

/// Get the user-level Claude Code settings path
fn get_user_settings_path() -> Option<PathBuf> {
    // On Windows: %USERPROFILE%\.claude\settings.json
    // On Unix: ~/.claude/settings.json
    if let Some(home) = dirs::home_dir() {
        let path = home.join(".claude").join("settings.json");
        if path.exists() {
            return Some(path);
        }
    }
    None
}

/// Get the project-level Claude Code settings path
fn get_project_settings_path() -> Option<PathBuf> {
    // Current directory .claude/settings.json
    let path = PathBuf::from(".claude").join("settings.json");
    if path.exists() {
        return Some(path);
    }
    None
}

/// Get the settings path to use (user-level preferred, then project-level)
fn get_active_settings_path() -> Option<PathBuf> {
    get_user_settings_path().or_else(get_project_settings_path)
}

/// Get the path where we would create settings if it doesn't exist
fn get_default_settings_path() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        home.join(".claude").join("settings.json")
    } else {
        PathBuf::from(".claude").join("settings.json")
    }
}

/// Check if hooks are configured in the settings file
pub fn check_hook_config() -> HookConfigStatus {
    let settings_path = get_active_settings_path();

    if let Some(path) = settings_path {
        let configured_hooks = read_configured_hooks(&path);
        let missing_hooks: Vec<String> = REQUIRED_HOOKS
            .iter()
            .filter(|h| !configured_hooks.contains(&h.to_string()))
            .map(|h| h.to_string())
            .collect();

        let configured = missing_hooks.is_empty();
        let partial = !configured && !configured_hooks.is_empty();

        HookConfigStatus {
            configured,
            partial,
            mode: HookConfigMode::default(),
            settings_path: Some(path.to_string_lossy().to_string()),
            configured_hooks,
            missing_hooks,
        }
    } else {
        // No settings file exists
        HookConfigStatus {
            configured: false,
            partial: false,
            mode: HookConfigMode::default(),
            settings_path: None,
            configured_hooks: Vec::new(),
            missing_hooks: REQUIRED_HOOKS.iter().map(|h| h.to_string()).collect(),
        }
    }
}

/// Read configured hook events from settings.json
fn read_configured_hooks(path: &PathBuf) -> Vec<String> {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() {
        return Vec::new();
    }

    // Parse JSON and extract hook names
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(hooks) = json.get("hooks").and_then(|h| h.as_object()) {
            return hooks.keys().map(|k| k.to_string()).collect();
        }
    }

    Vec::new()
}

/// Check if a hook configuration points to Vibe Island
///
/// The hook config can be:
/// 1. A direct hook object: { "type": "http", "url": "..." }
/// 2. A hook wrapper with nested hooks: { "hooks": [...] }
/// 3. An array of hooks: [{ "hooks": [...] }, ...]
fn is_vibe_island_hook(hook_config: &serde_json::Value) -> bool {
    // Case 1: Direct hook object with URL
    if let Some(url) = hook_config.get("url").and_then(|u| u.as_str()) {
        return url.contains("localhost:7878") || url.contains("127.0.0.1:7878");
    }

    // Case 2: Hook wrapper with nested hooks array
    if let Some(hooks_arr) = hook_config.get("hooks").and_then(|h| h.as_array()) {
        for h in hooks_arr {
            if is_vibe_island_hook(h) {
                return true;
            }
        }
    }

    // Case 3: It might be an array of hook configurations
    if let Some(arr) = hook_config.as_array() {
        for item in arr {
            if is_vibe_island_hook(item) {
                return true;
            }
        }
    }

    false
}

/// Generate the Vibe Island hook configuration
fn generate_hook_config() -> serde_json::Value {
    serde_json::json!({
        "hooks": {
            "SessionStart": [
                {
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/session-start", HOOK_SERVER_URL)
                        }
                    ]
                }
            ],
            "PreToolUse": [
                {
                    "matcher": "*",
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/pre-tool-use", HOOK_SERVER_URL),
                            "timeout": 30
                        }
                    ]
                }
            ],
            "PostToolUse": [
                {
                    "matcher": "*",
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/post-tool-use", HOOK_SERVER_URL)
                        }
                    ]
                }
            ],
            "Notification": [
                {
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/notification", HOOK_SERVER_URL)
                        }
                    ]
                }
            ],
            "Stop": [
                {
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/stop", HOOK_SERVER_URL)
                        }
                    ]
                }
            ],
            "UserPromptSubmit": [
                {
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/user-prompt-submit", HOOK_SERVER_URL)
                        }
                    ]
                }
            ],
            "PermissionRequest": [
                {
                    "matcher": "*",
                    "hooks": [
                        {
                            "type": "http",
                            "url": format!("{}/hooks/permission-request", HOOK_SERVER_URL),
                            "timeout": 60
                        }
                    ]
                }
            ]
        }
    })
}

/// Install hooks to settings.json
/// Returns the path where hooks were installed
pub fn install_hooks() -> Result<String, String> {
    let settings_path = get_active_settings_path().unwrap_or_else(get_default_settings_path);

    // Ensure .claude directory exists
    let parent = settings_path.parent();
    if let Some(dir) = parent {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
        }
    }

    // Read existing settings or create new
    let mut existing_settings: serde_json::Value = if settings_path.exists() {
        let mut file = fs::File::open(&settings_path)
            .map_err(|e| format!("Failed to open settings.json: {}", e))?;
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Create backup before modifying
    let backup_path = settings_path.with_extension(BACKUP_EXT);
    if settings_path.exists() {
        fs::copy(&settings_path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
        log::info!("Backup created at {}", backup_path.display());
    }

    // Merge Vibe Island hooks
    let vibe_hooks = generate_hook_config();
    merge_hooks(&mut existing_settings, &vibe_hooks);

    // Write updated settings
    let content = serde_json::to_string_pretty(&existing_settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    let mut file = fs::File::create(&settings_path)
        .map_err(|e| format!("Failed to create settings.json: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    log::info!("Hooks installed to {}", settings_path.display());
    Ok(settings_path.to_string_lossy().to_string())
}

/// Merge Vibe Island hooks into existing settings
///
/// IMPORTANT: This function is designed to be non-destructive:
/// - If a hook doesn't exist, add it
/// - If a hook already exists and points to Vibe Island, update it
/// - If a hook already exists and points elsewhere, SKIP it (don't overwrite user's config)
fn merge_hooks(existing: &mut serde_json::Value, vibe_hooks: &serde_json::Value) {
    if let Some(existing_hooks) = existing.get_mut("hooks") {
        if let Some(existing_map) = existing_hooks.as_object_mut() {
            if let Some(vibe_map) = vibe_hooks.get("hooks").and_then(|h| h.as_object()) {
                for (hook_name, hook_config) in vibe_map {
                    if !existing_map.contains_key(hook_name) {
                        // Hook doesn't exist, add it
                        existing_map.insert(hook_name.clone(), hook_config.clone());
                        log::info!("Added missing hook: {}", hook_name);
                    } else {
                        // Hook exists - check if it's ours
                        let existing_config = existing_map.get(hook_name).unwrap();
                        if is_vibe_island_hook(existing_config) {
                            // It's our hook, update it
                            existing_map.insert(hook_name.clone(), hook_config.clone());
                            log::info!("Updated existing Vibe Island hook: {}", hook_name);
                        } else {
                            // It's user's own hook, DON'T overwrite
                            log::warn!(
                                "Skipping hook '{}' - user has their own configuration",
                                hook_name
                            );
                        }
                    }
                }
            }
        }
    } else {
        // No hooks section exists, add entire vibe_hooks
        existing["hooks"] = vibe_hooks
            .get("hooks")
            .cloned()
            .unwrap_or(serde_json::json!({}));
    }
}

/// Uninstall Vibe Island hooks from settings.json
pub fn uninstall_hooks() -> Result<(), String> {
    let settings_path = get_active_settings_path();

    if let Some(path) = settings_path {
        if !path.exists() {
            return Ok(()); // No settings file, nothing to remove
        }

        // Read existing settings
        let mut file =
            fs::File::open(&path).map_err(|e| format!("Failed to open settings.json: {}", e))?;
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;

        let mut settings: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings.json: {}", e))?;

        // Remove Vibe Island hooks
        remove_vibe_hooks(&mut settings);

        // Write updated settings
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        let mut file = fs::File::create(&path)
            .map_err(|e| format!("Failed to create settings.json: {}", e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write settings.json: {}", e))?;

        log::info!("Hooks removed from {}", path.display());

        // Restore from backup if exists
        let backup_path = path.with_extension(BACKUP_EXT);
        if backup_path.exists() {
            // Only restore if backup is different from current
            let backup_content = fs::read_to_string(&backup_path)
                .map_err(|e| format!("Failed to read backup: {}", e))?;
            if backup_content != content {
                fs::copy(&backup_path, &path)
                    .map_err(|e| format!("Failed to restore backup: {}", e))?;
                log::info!("Restored from backup");
            }
            // Remove backup file
            fs::remove_file(&backup_path).map_err(|e| format!("Failed to remove backup: {}", e))?;
        }
    }

    Ok(())
}

/// Remove Vibe Island hooks from settings
fn remove_vibe_hooks(settings: &mut serde_json::Value) {
    if let Some(hooks) = settings.get_mut("hooks") {
        if let Some(hooks_map) = hooks.as_object_mut() {
            // Remove hooks that point to Vibe Island
            let keys_to_remove: Vec<String> = hooks_map
                .iter()
                .filter(|(_, config)| is_vibe_island_hook(config))
                .map(|(name, _)| name.clone())
                .collect();

            for key in keys_to_remove {
                hooks_map.remove(&key);
            }

            // If hooks section is empty, remove it entirely
            if hooks_map.is_empty() {
                settings.as_object_mut().unwrap().remove("hooks");
            }
        }
    }
}

/// Auto-configure hooks on startup if needed
pub fn auto_configure_hooks() -> Result<bool, String> {
    let status = check_hook_config();

    if status.configured {
        log::info!("Hooks already configured");
        return Ok(false); // Already configured, no action needed
    }

    if status.mode == HookConfigMode::Manual {
        log::info!("Manual mode - skipping auto-configuration");
        return Ok(false);
    }

    log::info!("Auto-configuring hooks...");
    install_hooks()?;
    Ok(true)
}

/// Auto-cleanup hooks on exit if needed
///
/// Note: This function should only be called if the user has explicitly
/// chosen auto-cleanup mode. The mode should be stored persistently.
pub fn auto_cleanup_hooks(mode: HookConfigMode) -> Result<bool, String> {
    if mode != HookConfigMode::AutoCleanup {
        log::info!(
            "Not in auto-cleanup mode (mode: {:?}) - keeping hooks",
            mode
        );
        return Ok(false);
    }

    log::info!("Auto-cleanup mode - removing hooks");
    uninstall_hooks()?;
    Ok(true)
}

/// Get the stored hook configuration mode from app config
/// Reads from a config file in the user's .claude directory
pub fn get_stored_mode() -> HookConfigMode {
    let config_path = get_config_file_path();

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(mode_str) = config.get("hookConfigMode").and_then(|m| m.as_str()) {
                match mode_str {
                    "auto" => return HookConfigMode::Auto,
                    "autoCleanup" => return HookConfigMode::AutoCleanup,
                    "manual" => return HookConfigMode::Manual,
                    _ => {}
                }
            }
        }
    }

    // Default to Auto mode
    HookConfigMode::Auto
}

/// Store the hook configuration mode
/// Writes to a config file in the user's .claude directory
pub fn set_stored_mode(mode: HookConfigMode) -> Result<(), String> {
    let config_path = get_config_file_path();

    // Ensure parent directory exists
    let parent = config_path.parent();
    if let Some(dir) = parent {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }

    let mode_str = match mode {
        HookConfigMode::Auto => "auto",
        HookConfigMode::AutoCleanup => "autoCleanup",
        HookConfigMode::Manual => "manual",
    };

    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Update mode
    config["hookConfigMode"] = serde_json::Value::String(mode_str.to_string());

    // Write config
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("Hook config mode saved: {}", mode_str);
    Ok(())
}

/// Get the path to the Vibe Island config file
fn get_config_file_path() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        home.join(".claude").join("vibe-island-config.json")
    } else {
        PathBuf::from("vibe-island-config.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_test_settings(dir: &TempDir, content: &str) -> PathBuf {
        let claude_dir = dir.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        let settings_path = claude_dir.join("settings.json");
        fs::write(&settings_path, content).unwrap();
        settings_path
    }

    #[test]
    fn test_generate_hook_config_contains_all_required_hooks() {
        let config = generate_hook_config();
        let hooks = config.get("hooks").unwrap().as_object().unwrap();

        for hook_name in REQUIRED_HOOKS {
            assert!(
                hooks.contains_key(*hook_name),
                "Missing hook: {}",
                hook_name
            );
        }
    }

    #[test]
    fn test_is_vibe_island_hook_detects_vibe_url() {
        let hook = serde_json::json!({
            "type": "http",
            "url": "http://localhost:7878/hooks/session-start"
        });
        assert!(is_vibe_island_hook(&hook));

        let hook = serde_json::json!({
            "type": "http",
            "url": "http://127.0.0.1:7878/hooks/test"
        });
        assert!(is_vibe_island_hook(&hook));

        let hook = serde_json::json!({
            "type": "http",
            "url": "http://other-server:8080/hooks/test"
        });
        assert!(!is_vibe_island_hook(&hook));
    }

    #[test]
    fn test_is_vibe_island_hook_detects_nested_hooks() {
        let hook = serde_json::json!({
            "hooks": [
                {
                    "type": "http",
                    "url": "http://localhost:7878/hooks/test"
                }
            ]
        });
        assert!(is_vibe_island_hook(&hook));
    }

    #[test]
    fn test_merge_hooks_adds_missing_hooks() {
        let mut existing = serde_json::json!({
            "hooks": {
                "SomeOtherHook": [
                    {
                        "type": "http",
                        "url": "http://other-server:8080/hooks/test"
                    }
                ]
            }
        });

        let vibe_hooks = generate_hook_config();
        merge_hooks(&mut existing, &vibe_hooks);

        let hooks = existing.get("hooks").unwrap().as_object().unwrap();

        // Should have existing hook
        assert!(hooks.contains_key("SomeOtherHook"));

        // Should have Vibe Island hooks
        assert!(hooks.contains_key("SessionStart"));
        assert!(hooks.contains_key("PreToolUse"));
    }

    #[test]
    fn test_merge_hooks_replaces_vibe_hooks() {
        let mut existing = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "type": "http",
                        "url": "http://localhost:7878/hooks/old-endpoint"
                    }
                ]
            }
        });

        let vibe_hooks = generate_hook_config();
        merge_hooks(&mut existing, &vibe_hooks);

        let hooks = existing.get("hooks").unwrap().as_object().unwrap();
        let session_hooks = hooks.get("SessionStart").unwrap().as_array().unwrap();
        let first_hook = &session_hooks[0].get("hooks").unwrap().as_array().unwrap()[0];
        let url = first_hook.get("url").unwrap().as_str().unwrap();

        // Should be updated to new endpoint
        assert!(url.contains("/hooks/session-start"));
    }

    #[test]
    fn test_merge_hooks_preserves_non_vibe_hooks() {
        let mut existing = serde_json::json!({
            "hooks": {
                "CustomHook": [
                    {
                        "type": "http",
                        "url": "http://my-server:3000/hooks/custom"
                    }
                ]
            }
        });

        let vibe_hooks = generate_hook_config();
        merge_hooks(&mut existing, &vibe_hooks);

        let hooks = existing.get("hooks").unwrap().as_object().unwrap();

        // Should preserve custom hook
        assert!(hooks.contains_key("CustomHook"));
        let custom_hooks = hooks.get("CustomHook").unwrap().as_array().unwrap();
        let url = custom_hooks[0].get("url").unwrap().as_str().unwrap();
        assert_eq!(url, "http://my-server:3000/hooks/custom");
    }

    #[test]
    fn test_merge_hooks_does_not_overwrite_user_hooks() {
        // User has SessionStart pointing to their own server
        let mut existing = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "type": "http",
                        "url": "http://user-server:8080/hooks/session-start"
                    }
                ]
            }
        });

        let vibe_hooks = generate_hook_config();
        merge_hooks(&mut existing, &vibe_hooks);

        let hooks = existing.get("hooks").unwrap().as_object().unwrap();

        // SessionStart should still point to user's server (NOT overwritten)
        let session_hooks = hooks.get("SessionStart").unwrap().as_array().unwrap();
        let url = session_hooks[0].get("url").unwrap().as_str().unwrap();
        assert_eq!(url, "http://user-server:8080/hooks/session-start");

        // But other Vibe Island hooks should be added
        assert!(hooks.contains_key("PreToolUse"));
        assert!(hooks.contains_key("PostToolUse"));
    }

    #[test]
    fn test_remove_vibe_hooks_removes_only_vibe_hooks() {
        let mut settings = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "hooks": [
                            {
                                "type": "http",
                                "url": "http://localhost:7878/hooks/session-start"
                            }
                        ]
                    }
                ],
                "CustomHook": [
                    {
                        "type": "http",
                        "url": "http://my-server:3000/hooks/custom"
                    }
                ]
            }
        });

        remove_vibe_hooks(&mut settings);

        let hooks = settings.get("hooks").unwrap().as_object().unwrap();

        // Vibe Island hook removed
        assert!(!hooks.contains_key("SessionStart"));

        // Custom hook preserved
        assert!(hooks.contains_key("CustomHook"));
    }

    #[test]
    fn test_remove_vibe_hooks_removes_empty_hooks_section() {
        let mut settings = serde_json::json!({
            "hooks": {
                "SessionStart": [
                    {
                        "hooks": [
                            {
                                "type": "http",
                                "url": "http://localhost:7878/hooks/session-start"
                            }
                        ]
                    }
                ]
            },
            "otherSetting": "value"
        });

        remove_vibe_hooks(&mut settings);

        // Hooks section should be removed entirely
        assert!(!settings.as_object().unwrap().contains_key("hooks"));

        // Other settings preserved
        assert!(settings.as_object().unwrap().contains_key("otherSetting"));
    }

    #[test]
    fn test_hook_config_mode_default() {
        let mode = HookConfigMode::default();
        assert_eq!(mode, HookConfigMode::Auto);
    }

    #[test]
    fn test_hook_config_status_serialization() {
        let status = HookConfigStatus {
            configured: true,
            partial: false,
            mode: HookConfigMode::Auto,
            settings_path: Some("/path/to/settings.json".to_string()),
            configured_hooks: vec!["SessionStart".to_string()],
            missing_hooks: vec![],
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("configured"));
        assert!(json.contains("camelCase"));
    }
}
