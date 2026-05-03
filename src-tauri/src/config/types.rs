//! Configuration Type Definitions
//!
//! All configuration types with default values and serialization support.

use serde::{Deserialize, Serialize};

/// Application global configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Configuration file version (for migration)
    #[serde(default = "default_config_version")]
    pub version: u32,

    /// Hook server configuration
    #[serde(default)]
    pub hook_server: HookServerConfig,

    /// Pipe server configuration
    #[serde(default)]
    pub pipe_server: PipeServerConfig,

    /// Overlay window configuration
    #[serde(default)]
    pub overlay: OverlayConfigDefaults,

    /// Process watcher configuration
    #[serde(default)]
    pub process_watcher: ProcessWatcherConfig,

    /// Audio configuration
    #[serde(default)]
    pub audio: AudioConfig,

    /// UI configuration (synced to frontend)
    #[serde(default)]
    pub ui: UiConfig,
}

fn default_config_version() -> u32 {
    super::CONFIG_VERSION
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: default_config_version(),
            hook_server: HookServerConfig::default(),
            pipe_server: PipeServerConfig::default(),
            overlay: OverlayConfigDefaults::default(),
            process_watcher: ProcessWatcherConfig::default(),
            audio: AudioConfig::default(),
            ui: UiConfig::default(),
        }
    }
}

// ============================================================================
// Hook Server Configuration
// ============================================================================

/// Hook server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookServerConfig {
    /// Listening port
    #[serde(default = "default_hook_port")]
    pub port: u16,

    /// Approval request timeout (seconds)
    #[serde(default = "default_approval_timeout")]
    pub approval_timeout_secs: u64,

    /// PreToolUse hook timeout (seconds)
    #[serde(default = "default_pre_tool_timeout")]
    pub pre_tool_timeout_secs: u64,

    /// PermissionRequest hook timeout (seconds)
    #[serde(default = "default_permission_timeout")]
    pub permission_timeout_secs: u64,

    /// Maximum number of error logs to keep
    #[serde(default = "default_max_error_logs")]
    pub max_error_logs: usize,
}

fn default_hook_port() -> u16 {
    7878
}
fn default_approval_timeout() -> u64 {
    120
}
fn default_pre_tool_timeout() -> u64 {
    30
}
fn default_permission_timeout() -> u64 {
    60
}
fn default_max_error_logs() -> usize {
    100
}

impl Default for HookServerConfig {
    fn default() -> Self {
        Self {
            port: default_hook_port(),
            approval_timeout_secs: default_approval_timeout(),
            pre_tool_timeout_secs: default_pre_tool_timeout(),
            permission_timeout_secs: default_permission_timeout(),
            max_error_logs: default_max_error_logs(),
        }
    }
}

// ============================================================================
// Pipe Server Configuration
// ============================================================================

/// Pipe server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipeServerConfig {
    /// Named pipe name
    #[serde(default = "default_pipe_name")]
    pub pipe_name: String,

    /// Connection retry interval (milliseconds)
    #[serde(default = "default_retry_interval")]
    pub retry_interval_ms: u64,

    /// Buffer size for reading messages
    #[serde(default = "default_buffer_size")]
    pub buffer_size: usize,
}

fn default_pipe_name() -> String {
    r"\\.\pipe\VibeIsland".to_string()
}
fn default_retry_interval() -> u64 {
    10
}
fn default_buffer_size() -> usize {
    4096
}

impl Default for PipeServerConfig {
    fn default() -> Self {
        Self {
            pipe_name: default_pipe_name(),
            retry_interval_ms: default_retry_interval(),
            buffer_size: default_buffer_size(),
        }
    }
}

// ============================================================================
// Overlay Configuration
// ============================================================================

/// Overlay default configuration values
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfigDefaults {
    /// Default X position
    #[serde(default = "default_overlay_x")]
    pub default_x: i32,

    /// Default Y position
    #[serde(default = "default_overlay_y")]
    pub default_y: i32,

    /// Compact mode width
    #[serde(default = "default_compact_width")]
    pub compact_width: i32,

    /// Compact mode height
    #[serde(default = "default_compact_height")]
    pub compact_height: i32,

    /// Expanded mode width
    #[serde(default = "default_expanded_width")]
    pub expanded_width: i32,

    /// Expanded mode minimum height
    #[serde(default = "default_expanded_min_height")]
    pub expanded_min_height: i32,

    /// Expanded mode maximum height
    #[serde(default = "default_expanded_max_height")]
    pub expanded_max_height: i32,

    /// Default transparency (0-255)
    #[serde(default = "default_alpha")]
    pub alpha: u8,

    /// Border radius for compact mode
    #[serde(default = "default_compact_radius")]
    pub compact_border_radius: u32,

    /// Border radius for expanded mode
    #[serde(default = "default_expanded_radius")]
    pub expanded_border_radius: u32,
}

fn default_overlay_x() -> i32 { 100 }
fn default_overlay_y() -> i32 { 100 }
fn default_compact_width() -> i32 { 320 }
fn default_compact_height() -> i32 { 56 }
fn default_expanded_width() -> i32 { 600 }
fn default_expanded_min_height() -> i32 { 180 }
fn default_expanded_max_height() -> i32 { 720 }
fn default_alpha() -> u8 { 240 }
fn default_compact_radius() -> u32 { 26 }
fn default_expanded_radius() -> u32 { 18 }

impl Default for OverlayConfigDefaults {
    fn default() -> Self {
        Self {
            default_x: default_overlay_x(),
            default_y: default_overlay_y(),
            compact_width: default_compact_width(),
            compact_height: default_compact_height(),
            expanded_width: default_expanded_width(),
            expanded_min_height: default_expanded_min_height(),
            expanded_max_height: default_expanded_max_height(),
            alpha: default_alpha(),
            compact_border_radius: default_compact_radius(),
            expanded_border_radius: default_expanded_radius(),
        }
    }
}

// ============================================================================
// Process Watcher Configuration
// ============================================================================

/// Process watcher configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessWatcherConfig {
    /// Polling interval (milliseconds)
    #[serde(default = "default_poll_interval")]
    pub poll_interval_ms: u64,

    /// Whether to detect node claude processes
    #[serde(default = "default_detect_node")]
    pub detect_node_claude: bool,
}

fn default_poll_interval() -> u64 { 5000 }
fn default_detect_node() -> bool { true }

impl Default for ProcessWatcherConfig {
    fn default() -> Self {
        Self {
            poll_interval_ms: default_poll_interval(),
            detect_node_claude: default_detect_node(),
        }
    }
}

// ============================================================================
// Audio Configuration
// ============================================================================

/// Notification sound types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationSound {
    None,
    Pop,
    Ping,
    Glass,
    Hero,
    Blow,
    Bottle,
    Frog,
    Funk,
    Morse,
    Purr,
    Tink,
}

impl Default for NotificationSound {
    fn default() -> Self {
        Self::Hero
    }
}

/// Audio configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    /// Default notification sound
    #[serde(default)]
    pub default_sound: NotificationSound,

    /// Custom sounds directory (optional)
    pub sounds_dir: Option<String>,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            default_sound: NotificationSound::default(),
            sounds_dir: None,
        }
    }
}

// ============================================================================
// UI Configuration (Frontend Sync)
// ============================================================================

/// UI configuration synced to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiConfig {
    /// State colors
    #[serde(default)]
    pub state_colors: StateColors,

    /// Animation configuration
    #[serde(default)]
    pub animation: AnimationConfig,

    /// Dimension configuration
    #[serde(default)]
    pub dimensions: UiDimensions,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            state_colors: StateColors::default(),
            animation: AnimationConfig::default(),
            dimensions: UiDimensions::default(),
        }
    }
}

/// State indicator colors
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateColors {
    pub idle: String,
    pub thinking: String,
    pub running: String,
    pub streaming: String,
    pub approval: String,
    pub error: String,
    pub done: String,
}

impl Default for StateColors {
    fn default() -> Self {
        Self {
            idle: "#6b7280".to_string(),
            thinking: "#a78bfa".to_string(),
            running: "#3b82f6".to_string(),
            streaming: "#06b6d4".to_string(),
            approval: "#f59e0b".to_string(),
            error: "#ef4444".to_string(),
            done: "#22c55e".to_string(),
        }
    }
}

/// Animation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationConfig {
    /// Thinking animation duration (ms)
    #[serde(default = "default_thinking_duration")]
    pub thinking_duration_ms: u64,

    /// Running animation duration (ms)
    #[serde(default = "default_running_duration")]
    pub running_duration_ms: u64,

    /// Streaming animation duration (ms)
    #[serde(default = "default_streaming_duration")]
    pub streaming_duration_ms: u64,

    /// Approval animation duration (ms)
    #[serde(default = "default_approval_duration")]
    pub approval_duration_ms: u64,

    /// Spring animation parameters
    #[serde(default)]
    pub spring: SpringConfig,
}

fn default_thinking_duration() -> u64 { 1200 }
fn default_running_duration() -> u64 { 1000 }
fn default_streaming_duration() -> u64 { 500 }
fn default_approval_duration() -> u64 { 600 }

impl Default for AnimationConfig {
    fn default() -> Self {
        Self {
            thinking_duration_ms: default_thinking_duration(),
            running_duration_ms: default_running_duration(),
            streaming_duration_ms: default_streaming_duration(),
            approval_duration_ms: default_approval_duration(),
            spring: SpringConfig::default(),
        }
    }
}

/// Spring animation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringConfig {
    pub expand: SpringParams,
    pub collapse: SpringParams,
    pub transition: SpringParams,
    pub micro: SpringParams,
}

impl Default for SpringConfig {
    fn default() -> Self {
        Self {
            expand: SpringParams { stiffness: 300, damping: 22, mass: 0.9 },
            collapse: SpringParams { stiffness: 380, damping: 26, mass: 0.85 },
            transition: SpringParams { stiffness: 400, damping: 30, mass: 1.0 },
            micro: SpringParams { stiffness: 500, damping: 35, mass: 0.8 },
        }
    }
}

/// Spring animation parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringParams {
    pub stiffness: u32,
    pub damping: u32,
    #[serde(default = "default_mass")]
    pub mass: f32,
}

fn default_mass() -> f32 { 1.0 }

/// UI dimension configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiDimensions {
    /// Status bar height
    #[serde(default = "default_bar_height")]
    pub bar_height: u32,

    /// Padding
    #[serde(default = "default_padding")]
    pub padding: u32,

    /// Gap between elements
    #[serde(default = "default_gap")]
    pub gap: u32,

    /// Status dot size
    #[serde(default = "default_dot_size")]
    pub status_dot_size: u32,
}

fn default_bar_height() -> u32 { 52 }
fn default_padding() -> u32 { 14 }
fn default_gap() -> u32 { 8 }
fn default_dot_size() -> u32 { 12 }

impl Default for UiDimensions {
    fn default() -> Self {
        Self {
            bar_height: default_bar_height(),
            padding: default_padding(),
            gap: default_gap(),
            status_dot_size: default_dot_size(),
        }
    }
}
