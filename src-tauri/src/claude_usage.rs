use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsage {
    pub five_hour_percent: Option<u32>,
    pub seven_day_percent: Option<u32>,
    pub five_hour_reset_at: Option<String>,
    pub seven_day_reset_at: Option<String>,
    pub available: bool,
}

fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

fn cache_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".claude").join("plugins").join("claude-hud").join(".usage-cache.json"))
}

fn parse_reset_time(value: &serde_json::Value) -> Option<String> {
    if value.is_null() {
        return None;
    }
    if let Some(s) = value.as_str() {
        return Some(s.to_string());
    }
    if let Some(ts) = value.as_f64() {
        if ts <= 0.0 || !ts.is_finite() {
            return None;
        }
        let millis = if ts > 1e12 { ts } else { ts * 1000.0 };
        let secs = (millis / 1000.0) as i64;
        let nsecs = ((millis % 1000.0) * 1_000_000.0) as u32;
        let dt = chrono::DateTime::from_timestamp(secs, nsecs)?;
        return Some(dt.to_rfc3339());
    }
    None
}

fn parse_percent(value: &serde_json::Value) -> Option<u32> {
    if value.is_null() {
        return None;
    }
    value.as_f64()
        .filter(|v| v.is_finite())
        .map(|v| (v.clamp(0.0, 100.0)).round() as u32)
}

fn is_fresh(timestamp_ms: f64) -> bool {
    if timestamp_ms <= 0.0 || !timestamp_ms.is_finite() {
        return false;
    }
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64;
    let age = now_ms - timestamp_ms;
    age < 5.0 * 60.0 * 1000.0 // 5 min freshness window
}

pub fn get_claude_usage() -> ClaudeUsage {
    let path = match cache_path() {
        Some(p) => p,
        None => return ClaudeUsage {
            five_hour_percent: None,
            seven_day_percent: None,
            five_hour_reset_at: None,
            seven_day_reset_at: None,
            available: false,
        },
    };

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return ClaudeUsage {
            five_hour_percent: None,
            seven_day_percent: None,
            five_hour_reset_at: None,
            seven_day_reset_at: None,
            available: false,
        },
    };

    let cache: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return ClaudeUsage {
            five_hour_percent: None,
            seven_day_percent: None,
            five_hour_reset_at: None,
            seven_day_reset_at: None,
            available: false,
        },
    };

    let data = &cache["data"];
    if data.is_null() {
        return ClaudeUsage {
            five_hour_percent: None,
            seven_day_percent: None,
            five_hour_reset_at: None,
            seven_day_reset_at: None,
            available: false,
        };
    }

    let timestamp = cache["timestamp"].as_f64().unwrap_or(0.0);
    if !is_fresh(timestamp) {
        return ClaudeUsage {
            five_hour_percent: None,
            seven_day_percent: None,
            five_hour_reset_at: None,
            seven_day_reset_at: None,
            available: false,
        };
    }

    let five_hour = parse_percent(&data["fiveHour"]);
    let seven_day = parse_percent(&data["sevenDay"]);
    let five_hour_reset = parse_reset_time(&data["fiveHourResetAt"]);
    let seven_day_reset = parse_reset_time(&data["sevenDayResetAt"]);

    ClaudeUsage {
        five_hour_percent: five_hour,
        seven_day_percent: seven_day,
        five_hour_reset_at: five_hour_reset,
        seven_day_reset_at: seven_day_reset,
        available: five_hour.is_some() || seven_day.is_some(),
    }
}
