//! Configuration Loader
//!
//! Handles loading, saving, and updating configuration with:
//! - Default values fallback
//! - Configuration file reading
//! - Environment variable overrides
//! - Version migration

use super::{AppConfig, CONFIG_FILE_NAME, CONFIG_VERSION};
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::OnceLock;

/// Global configuration instance
static CONFIG: OnceLock<RwLock<AppConfig>> = OnceLock::new();

/// Get the global configuration instance
fn get_config_instance() -> &'static RwLock<AppConfig> {
    CONFIG.get_or_init(|| RwLock::new(load_from_file().unwrap_or_default()))
}

/// Get the current configuration (read-only)
pub fn get_config() -> AppConfig {
    get_config_instance().read().clone()
}

/// Update configuration with partial updates
pub fn update_config(updates: serde_json::Value) -> Result<AppConfig, String> {
    let mut config = get_config_instance().write();

    // Merge updates into current config
    let current_json = serde_json::to_value(&*config)
        .map_err(|e| format!("Failed to serialize current config: {}", e))?;

    let merged = merge_json(&current_json, &updates);

    let new_config: AppConfig = serde_json::from_value(merged)
        .map_err(|e| format!("Failed to parse merged config: {}", e))?;

    // Save to file
    save_to_file(&new_config)?;

    // Update in-memory config
    *config = new_config.clone();

    Ok(new_config)
}

/// Reset configuration to defaults (optionally just a section)
pub fn reset_config(section: Option<&str>) -> Result<AppConfig, String> {
    let default = AppConfig::default();

    match section {
        Some(section_name) => {
            let mut config = get_config_instance().write();

            // Reset only the specified section
            match section_name {
                "hookServer" => config.hook_server = default.hook_server,
                "pipeServer" => config.pipe_server = default.pipe_server,
                "overlay" => config.overlay = default.overlay,
                "processWatcher" => config.process_watcher = default.process_watcher,
                "audio" => config.audio = default.audio,
                "ui" => config.ui = default.ui,
                _ => return Err(format!("Unknown config section: {}", section_name)),
            }

            save_to_file(&config)?;
            Ok(config.clone())
        }
        None => {
            // Reset entire config
            save_to_file(&default)?;
            *get_config_instance().write() = default.clone();
            Ok(default)
        }
    }
}

/// Reload configuration from file
pub fn reload_config() -> Result<AppConfig, String> {
    let new_config = load_from_file().unwrap_or_default();
    *get_config_instance().write() = new_config.clone();
    Ok(new_config)
}

// ============================================================================
// File Operations
// ============================================================================

/// Get the configuration file path
fn get_config_file_path() -> PathBuf {
    // Use the same directory as Claude Code settings
    if let Some(home) = dirs::home_dir() {
        home.join(".claude").join(CONFIG_FILE_NAME)
    } else {
        PathBuf::from(CONFIG_FILE_NAME)
    }
}

/// Load configuration from file
fn load_from_file() -> Result<AppConfig, String> {
    let path = get_config_file_path();

    if !path.exists() {
        log::info!("Config file not found, using defaults: {:?}", path);
        return Ok(AppConfig::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let raw: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    // Check version and migrate if needed
    let version = raw
        .get("version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let migrated = migrate_config(version, raw)?;

    // Parse with defaults for missing fields
    let config: AppConfig = serde_json::from_value(migrated)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    log::info!("Loaded config from: {:?}", path);
    Ok(config)
}

/// Save configuration to file
fn save_to_file(config: &AppConfig) -> Result<(), String> {
    let path = get_config_file_path();

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    log::info!("Saved config to: {:?}", path);
    Ok(())
}

// ============================================================================
// Migration
// ============================================================================

/// Migrate configuration from older versions
fn migrate_config(version: u32, raw: serde_json::Value) -> Result<serde_json::Value, String> {
    match version {
        0 => {
            // No version field - try to migrate from old format
            // Old format only had hookConfigMode
            log::info!("Migrating config from version 0 to {}", CONFIG_VERSION);

            let migrated = serde_json::json!({
                "version": CONFIG_VERSION,
                "hookConfigMode": raw.get("hookConfigMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("auto"),
            });

            Ok(migrated)
        }
        1 => {
            // Current version - no migration needed
            Ok(raw)
        }
        v if v > CONFIG_VERSION => {
            Err(format!("Unsupported config version: {} (max supported: {})", v, CONFIG_VERSION))
        }
        _ => {
            // Future versions - just try to parse with defaults
            Ok(raw)
        }
    }
}

// ============================================================================
// JSON Utilities
// ============================================================================

/// Merge two JSON values (recursively merge objects, replace other types)
fn merge_json(base: &serde_json::Value, updates: &serde_json::Value) -> serde_json::Value {
    match (base, updates) {
        (serde_json::Value::Object(base_obj), serde_json::Value::Object(updates_obj)) => {
            let mut merged = base_obj.clone();
            for (key, value) in updates_obj {
                if let Some(base_value) = merged.get(key) {
                    merged.insert(key.clone(), merge_json(base_value, value));
                } else {
                    merged.insert(key.clone(), value.clone());
                }
            }
            serde_json::Value::Object(merged)
        }
        _ => updates.clone(),
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.hook_server.port, 7878);
        assert_eq!(config.hook_server.approval_timeout_secs, 120);
        assert_eq!(config.pipe_server.buffer_size, 4096);
    }

    #[test]
    fn test_merge_json() {
        let base = serde_json::json!({
            "a": 1,
            "b": { "c": 2, "d": 3 }
        });

        let updates = serde_json::json!({
            "b": { "c": 10 }
        });

        let merged = merge_json(&base, &updates);

        assert_eq!(merged["a"], 1);
        assert_eq!(merged["b"]["c"], 10);
        assert_eq!(merged["b"]["d"], 3);
    }
}
