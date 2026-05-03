//! Unified Configuration Module
//!
//! This module provides centralized configuration management for Vibe Island.
//! It supports:
//! - Default values (hardcoded in code)
//! - Configuration file (user customizable)
//! - Environment variable overrides
//!
//! Configuration is synchronized between Rust backend and TypeScript frontend
//! via Tauri commands and events.

pub mod loader;
pub mod types;

pub use loader::{get_config, reload_config, reset_config, update_config};
pub use types::*;

/// Configuration file version for migration purposes
pub const CONFIG_VERSION: u32 = 1;

/// Default configuration file name
pub const CONFIG_FILE_NAME: &str = "vibe-island-config.json";
