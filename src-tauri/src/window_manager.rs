//! Window manager for screen edge snapping and monitor-aware positioning.
//!
//! Aligns with macOS Open Island's notch-area snapping:
//! - Top edge: auto-center in the "notch" area (top of screen)
//! - Bottom edge: auto-center at the bottom of screen
//! - Multi-monitor aware with per-monitor DPI scaling

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::*;
#[cfg(target_os = "windows")]

use crate::overlay::{self, DpiScale};

/// Which edge the overlay snaps to
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SnapPosition {
    /// Snap to top-center (notch area)
    Top,
    /// Snap to bottom-center
    Bottom,
}

impl std::fmt::Display for SnapPosition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SnapPosition::Top => write!(f, "top"),
            SnapPosition::Bottom => write!(f, "bottom"),
        }
    }
}

/// Monitor work area information
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorWorkArea {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub dpi_scale: DpiScale,
}

/// Result of a snap operation
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapResult {
    pub x: i32,
    pub y: i32,
    pub monitor_index: usize,
    pub dpi_scale: f64,
}

// ============================================================================
// Windows implementation
// ============================================================================

#[cfg(target_os = "windows")]
/// Get the work area of the monitor containing the given point.
/// Returns the work area (excluding taskbar) and DPI scale.
pub fn get_monitor_work_area_at(x: i32, y: i32) -> Option<MonitorWorkArea> {
    unsafe {
        let point = POINT { x, y };
        let hmonitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);

        let mut monitor_info = MONITORINFOEXW::default();
        monitor_info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

        if GetMonitorInfoW(
            HMONITOR(hmonitor.0),
            &mut monitor_info as *mut _ as *mut MONITORINFO,
        )
        .as_bool()
        {
            let work = monitor_info.monitorInfo.rcWork;
            let dpi_scale = overlay::get_dpi_scale_for_monitor(hmonitor).unwrap_or(1.0);

            Some(MonitorWorkArea {
                left: work.left,
                top: work.top,
                right: work.right,
                bottom: work.bottom,
                dpi_scale,
            })
        } else {
            None
        }
    }
}

#[cfg(target_os = "windows")]
/// Calculate the snap position for the overlay window.
///
/// Top snap: center horizontally, top edge of work area + small offset
/// Bottom snap: center horizontally, bottom edge - window height - small offset
pub fn calculate_snap_position(
    window_width: i32,
    window_height: i32,
    position: SnapPosition,
    prefer_monitor_x: Option<i32>,
    prefer_monitor_y: Option<i32>,
) -> Option<SnapResult> {
    // Use preferred monitor position or (0, 0) as fallback
    let probe_x = prefer_monitor_x.unwrap_or(0);
    let probe_y = prefer_monitor_y.unwrap_or(0);

    let work = get_monitor_work_area_at(probe_x, probe_y)?;

    let scaled_width = (window_width as f64 * work.dpi_scale).round() as i32;
    let scaled_height = (window_height as f64 * work.dpi_scale).round() as i32;

    let center_x = work.left + (work.right - work.left - scaled_width) / 2;

    const EDGE_MARGIN: i32 = 4;

    let y = match position {
        SnapPosition::Top => work.top + EDGE_MARGIN,
        SnapPosition::Bottom => work.bottom - scaled_height - EDGE_MARGIN,
    };

    Some(SnapResult {
        x: center_x.max(work.left),
        y: y.max(work.top).min(work.bottom - scaled_height),
        monitor_index: 0,
        dpi_scale: work.dpi_scale,
    })
}

#[cfg(target_os = "windows")]
/// Snap threshold in logical pixels — when the window is within this distance
/// of the edge, it should auto-snap.
pub const SNAP_THRESHOLD: i32 = 40;

#[cfg(target_os = "windows")]
/// Check if a position is within snap threshold of the top or bottom edge
pub fn is_near_edge(y: i32, window_height: i32, probe_x: i32, probe_y: i32) -> Option<SnapPosition> {
    let work = get_monitor_work_area_at(probe_x, probe_y)?;

    let scaled_height = (window_height as f64 * work.dpi_scale).round() as i32;

    // Check top edge
    if (y - work.top).abs() <= SNAP_THRESHOLD {
        return Some(SnapPosition::Top);
    }

    // Check bottom edge
    if ((work.bottom - scaled_height) - y).abs() <= SNAP_THRESHOLD {
        return Some(SnapPosition::Bottom);
    }

    None
}

#[cfg(target_os = "windows")]
/// Enumerate all monitors and return their work areas
pub fn enumerate_monitors() -> Vec<MonitorWorkArea> {
    let mut monitors = Vec::new();

    unsafe {
        struct EnumData {
            monitors: *mut Vec<MonitorWorkArea>,
        }

        unsafe extern "system" fn monitor_enum_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let data = &mut *(lparam.0 as *mut EnumData);

            let mut monitor_info = MONITORINFOEXW::default();
            monitor_info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

            if GetMonitorInfoW(hmonitor, &mut monitor_info as *mut _ as *mut MONITORINFO).as_bool() {
                let work = monitor_info.monitorInfo.rcWork;
                let dpi_scale = overlay::get_dpi_scale_for_monitor(hmonitor).unwrap_or(1.0);

                (*data.monitors).push(MonitorWorkArea {
                    left: work.left,
                    top: work.top,
                    right: work.right,
                    bottom: work.bottom,
                    dpi_scale,
                });
            }

            BOOL(1)
        }

        let mut data = EnumData {
            monitors: &mut monitors,
        };

        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut data as *mut _ as isize),
        );
    }

    monitors
}

// ============================================================================
// Non-Windows stubs
// ============================================================================

#[cfg(not(target_os = "windows"))]
pub fn get_monitor_work_area_at(_x: i32, _y: i32) -> Option<MonitorWorkArea> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn calculate_snap_position(
    _window_width: i32,
    _window_height: i32,
    _position: SnapPosition,
    _prefer_monitor_x: Option<i32>,
    _prefer_monitor_y: Option<i32>,
) -> Option<SnapResult> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn is_near_edge(_y: i32, _window_height: i32, _probe_x: i32, _probe_y: i32) -> Option<SnapPosition> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn enumerate_monitors() -> Vec<MonitorWorkArea> {
    vec![]
}
