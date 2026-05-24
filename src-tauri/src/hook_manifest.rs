//! Hook 安装清单管理 — 跟踪 Vibe Island 写入的 Claude Code hook 记录。
//! 支持安全安装（去重检查）、精确卸载（仅删除清单中记录的 hook）、以及时间戳备份策略（保留最近 3 个备份）。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookManifest {
    pub hook_command: String,
    pub installed_at: i64,
    pub installed_hooks: Vec<String>,
    pub app_version: String,
}

fn manifest_path() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        home.join(".claude").join("vibe-island-manifest.json")
    } else {
        PathBuf::from("vibe-island-manifest.json")
    }
}

pub fn read_manifest() -> Option<HookManifest> {
    let path = manifest_path();
    if !path.exists() {
        return None;
    }
    let mut file = fs::File::open(&path).ok()?;
    let mut content = String::new();
    file.read_to_string(&mut content).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_manifest(manifest: &HookManifest) -> Result<(), String> {
    let path = manifest_path();
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create manifest directory: {}", e))?;
        }
    }
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    let mut file =
        fs::File::create(&path).map_err(|e| format!("Failed to create manifest: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write manifest: {}", e))?;
    log::info!("Manifest written to {}", path.display());
    Ok(())
}

pub fn delete_manifest() -> Result<(), String> {
    let path = manifest_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete manifest: {}", e))?;
        log::info!("Manifest deleted at {}", path.display());
    }
    Ok(())
}

#[allow(dead_code)]
pub fn is_installed() -> bool {
    read_manifest().is_some()
}

fn now_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn create_manifest(hook_command: String, installed_hooks: Vec<String>, app_version: String) -> HookManifest {
    HookManifest {
        hook_command,
        installed_at: now_timestamp(),
        installed_hooks,
        app_version,
    }
}

pub const MAX_BACKUPS: usize = 3;

pub fn create_timestamped_backup(settings_path: &std::path::Path) -> Result<(), String> {
    if !settings_path.exists() {
        return Ok(());
    }
    let ts = now_timestamp();
    let file_name = settings_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("settings.json");
    let backup_name = format!("{}.{}.backup", file_name, ts);
    let backup_path = settings_path.with_file_name(backup_name);

    fs::copy(settings_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;
    log::info!("Backup created at {}", backup_path.display());

    prune_old_backups(settings_path);
    Ok(())
}

fn prune_old_backups(settings_path: &std::path::Path) {
    let dir = match settings_path.parent() {
        Some(d) => d,
        None => return,
    };
    let file_name = settings_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("settings.json");
    let prefix = format!("{}.", file_name);

    let mut backups: Vec<(i64, PathBuf)> = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with(&prefix) && name_str.ends_with(".backup") {
                let trimmed = name_str
                    .trim_start_matches(&prefix)
                    .trim_end_matches(".backup");
                if let Ok(ts) = trimmed.parse::<i64>() {
                    backups.push((ts, entry.path()));
                }
            }
        }
    }

    backups.sort_by(|a, b| b.0.cmp(&a.0));

    for (_, path) in backups.into_iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(&path);
    }
}
