use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use log::{Log, Record, Level, LevelFilter};
use tauri::AppHandle;
use tauri::Manager;

/// 日志文件目录（OnceLock：setup 时初始化，之后所有 log! 宏共享）
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 初始化 Rust 端 JSONL 日志。
/// 在 app setup 时调用，此后所有 log::info!/warn!/error! 自动写入
/// 与前端 logger 相同的 YYYY-MM-DD.jsonl 文件。
pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = log_file_path(app)?;
    let dir = path.parent().unwrap().to_path_buf();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create log dir: {}", e))?;

    LOG_DIR.set(dir)
        .map_err(|_| "Logger already initialized".to_string())?;

    log::set_boxed_logger(Box::new(JsonlLogger))
        .map(|()| log::set_max_level(LevelFilter::Info))
        .map_err(|e| format!("Failed to set logger: {}", e))
}

struct JsonlLogger;

impl Log for JsonlLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let Some(log_dir) = LOG_DIR.get() else { return };

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let file_path = log_dir.join(format!("{}.jsonl", today));

        let level = match record.level() {
            Level::Error => "ERROR",
            Level::Warn => "WARN",
            Level::Info => "INFO",
            Level::Debug => "DEBUG",
            Level::Trace => "DEBUG",
        };

        let entry = serde_json::json!({
            "timestamp": chrono::Local::now().to_rfc3339(),
            "level": level,
            "target": record.target(),
            "message": record.args().to_string(),
            "rust_module": record.target(),
        });

        // 写入 JSONL 文件（与前端日志同一文件）
        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
        {
            let _ = writeln!(file, "{}", entry);
        }

        // debug 模式同时输出到 stderr，方便开发
        if cfg!(debug_assertions) {
            eprintln!("[{}] {}: {}", level, record.target(), record.args());
        }
    }

    fn flush(&self) {}
}

/// 匹配前端 LogEntry 结构的核心字段（只解析需要的）
#[derive(Deserialize)]
struct LogEntry {
    timestamp: Option<String>,
    level: Option<String>,
    error_code: Option<String>,
    message: Option<String>,
    #[allow(dead_code)]
    context: Option<serde_json::Value>,
    #[allow(dead_code)]
    error: Option<serde_json::Value>,
    trace_id: Option<String>,
}

fn log_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_dir = data_dir.join("logs");
    fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;

    // 按日期分片：2026-05-13.jsonl
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(log_dir.join(format!("{}.jsonl", today)))
}

/// 前端 ipc 入口：接收结构化日志条目，追加写入当天的 JSONL 文件
#[tauri::command]
pub fn log_entry(app: AppHandle, entry: String) -> Result<(), String> {
    let path = log_file_path(&app)?;

    // 尝试解析验证，失败也写入（原始字符串）
    let enriched = match serde_json::from_str::<LogEntry>(&entry) {
        Ok(parsed) => {
            // 确保 timestamp 存在
            let ts = parsed
                .timestamp
                .unwrap_or_else(|| chrono::Local::now().to_rfc3339());
            let mut map = serde_json::Map::new();
            map.insert("timestamp".into(), serde_json::Value::String(ts.clone()));
            map.insert(
                "level".into(),
                serde_json::Value::String(parsed.level.unwrap_or_else(|| "INFO".into())),
            );
            if let Some(ec) = &parsed.error_code {
                map.insert("error_code".into(), serde_json::Value::String(ec.clone()));
            }
            map.insert(
                "message".into(),
                serde_json::Value::String(parsed.message.unwrap_or_default()),
            );
            if let Some(tid) = &parsed.trace_id {
                map.insert("trace_id".into(), serde_json::Value::String(tid.clone()));
            }
            // 把原始 entry 的剩余字段也 merge 进去
            if let Ok(original) = serde_json::from_str::<serde_json::Value>(&entry) {
                if let serde_json::Value::Object(obj) = original {
                    for (k, v) in obj {
                        if !map.contains_key(&k) {
                            map.insert(k, v);
                        }
                    }
                }
            }
            serde_json::to_string(&map).unwrap_or(entry)
        }
        Err(_) => {
            // 非 JSON 也写入，包装一下
            let now = chrono::Local::now().to_rfc3339();
            format!(
                r#"{{"timestamp":"{}","level":"RAW","raw_message":{}}}"#,
                now,
                serde_json::to_string(&entry).unwrap_or_default()
            )
        }
    };

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    writeln!(file, "{}", enriched)
        .map_err(|e| format!("Failed to write log entry: {}", e))?;

    Ok(())
}
