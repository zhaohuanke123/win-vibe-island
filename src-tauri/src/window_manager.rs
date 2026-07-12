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
    pub snap_position: Option<SnapPosition>,
}

// ── 吸附状态跟踪 ──

static CURRENT_SNAP: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
const SNAP_NONE: u8 = 0;
const SNAP_TOP: u8 = 1;
const SNAP_BOTTOM: u8 = 2;

/// 获取当前吸附方向
pub fn current_snap_position() -> Option<SnapPosition> {
    match CURRENT_SNAP.load(std::sync::atomic::Ordering::Relaxed) {
        SNAP_TOP => Some(SnapPosition::Top),
        SNAP_BOTTOM => Some(SnapPosition::Bottom),
        _ => None,
    }
}

/// 设置当前吸附方向
pub fn set_current_snap_position(pos: Option<SnapPosition>) {
    let val = match pos {
        Some(SnapPosition::Top) => SNAP_TOP,
        Some(SnapPosition::Bottom) => SNAP_BOTTOM,
        None => SNAP_NONE,
    };
    CURRENT_SNAP.store(val, std::sync::atomic::Ordering::Relaxed);
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

/// 把 outer_size（物理像素）+ scale_factor 换算为逻辑像素。
/// calculate_snap_position 等内部函数假设入参是逻辑像素，caller MUST 用本函数换算。
pub fn outer_size_to_logical(outer_width: f64, outer_height: f64, scale: f64) -> (f64, f64) {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    (outer_width / s, outer_height / s)
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
    edge_margin: Option<i32>,
) -> Option<SnapResult> {
    // Use preferred monitor position or (0, 0) as fallback
    let probe_x = prefer_monitor_x.unwrap_or(0);
    let probe_y = prefer_monitor_y.unwrap_or(0);

    let work = get_monitor_work_area_at(probe_x, probe_y)?;
    Some(calculate_snap_position_for_work_area(
        window_width,
        window_height,
        position,
        &work,
        edge_margin,
    ))
}

#[cfg(target_os = "windows")]
/// 纯数学：在给定 work area 内计算 snap 位置。入参 window_width/window_height MUST 是逻辑像素
/// （caller 负责 outer_size / scale_factor 换算），内部按 work.dpi_scale 放大为物理像素。
pub fn calculate_snap_position_for_work_area(
    window_width: i32,
    window_height: i32,
    position: SnapPosition,
    work: &MonitorWorkArea,
    edge_margin: Option<i32>,
) -> SnapResult {
    let scaled_width = (window_width as f64 * work.dpi_scale).round() as i32;
    let scaled_height = (window_height as f64 * work.dpi_scale).round() as i32;

    let center_x = work.left + (work.right - work.left - scaled_width) / 2;

    const DEFAULT_EDGE_MARGIN: i32 = 4;
    let margin = edge_margin.unwrap_or(DEFAULT_EDGE_MARGIN);

    let y = match position {
        SnapPosition::Top => work.top + margin,
        SnapPosition::Bottom => work.bottom - scaled_height - margin,
    };

    SnapResult {
        x: center_x.max(work.left),
        y: y.max(work.top).min(work.bottom - scaled_height),
        monitor_index: 0,
        dpi_scale: work.dpi_scale,
        snap_position: Some(position),
    }
}

#[cfg(target_os = "windows")]
/// Snap threshold in logical pixels — when the window is within this distance
/// of the edge, it should auto-snap.
pub const SNAP_THRESHOLD: i32 = 40;

#[cfg(target_os = "windows")]
/// Check if a pill (described by its top/bottom screen Y) is within snap threshold of top/bottom edge.
/// B4-Lite 下 HWND 是 bounding box（远大于可见药丸），因此 MUST 用药丸坐标而非 HWND 顶 + HWND 高度。
pub fn is_near_edge(pill_top_y: i32, pill_bottom_y: i32, probe_x: i32, probe_y: i32) -> Option<SnapPosition> {
    let work = get_monitor_work_area_at(probe_x, probe_y)?;
    is_near_edge_for_work(pill_top_y, pill_bottom_y, &work)
}

/// 纯数学：根据药丸屏幕顶/底 Y 判断是否贴近 work area 顶/底边。
/// 跨平台可测（不依赖 Win32）。
pub fn is_near_edge_for_work(
    pill_top_y: i32,
    pill_bottom_y: i32,
    work: &MonitorWorkArea,
) -> Option<SnapPosition> {
    // Check top edge（药丸顶部贴近 work.top）
    if (pill_top_y - work.top).abs() <= SNAP_THRESHOLD_CROSS {
        return Some(SnapPosition::Top);
    }
    // Check bottom edge（药丸底部贴近 work.bottom）
    if (work.bottom - pill_bottom_y).abs() <= SNAP_THRESHOLD_CROSS {
        return Some(SnapPosition::Bottom);
    }
    None
}

/// 跨平台默认阈值（与 windows 下的 SNAP_THRESHOLD 保持一致）
pub const SNAP_THRESHOLD_CROSS: i32 = 40;

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
    _edge_margin: Option<i32>,
) -> Option<SnapResult> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn is_near_edge(_pill_top_y: i32, _pill_bottom_y: i32, _probe_x: i32, _probe_y: i32) -> Option<SnapPosition> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn enumerate_monitors() -> Vec<MonitorWorkArea> {
    vec![]
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    fn work_1920x1080_scale(scale: f64) -> MonitorWorkArea {
        MonitorWorkArea { left: 0, top: 0, right: 1920, bottom: 1080, dpi_scale: scale }
    }

    // Scenario 1: scale 1.5 下 top snap 后药丸水平居中
    // bbox 600×720 logical，scale=1.5 → scaled_width=900 physical
    // center_x = 0 + (1920 - 900) / 2 = 510
    #[test]
    fn snap_top_at_scale_1_5_centers_hwnd_with_logical_input() {
        let work = work_1920x1080_scale(1.5);
        let result = calculate_snap_position_for_work_area(
            600, 720, SnapPosition::Top, &work, Some(0),
        );
        assert_eq!(result.x, 510, "HWND 左上 x 必须使 HWND 水平居中");
        assert_eq!(result.y, 0, "top snap y = work.top + margin(0)");
        assert_eq!(result.dpi_scale, 1.5);
    }

    // Scenario 2: scale 1.0 下行为不变（回归保护）
    // scaled_width = 600，center_x = (1920 - 600) / 2 = 660
    #[test]
    fn snap_top_at_scale_1_0_matches_logical_math() {
        let work = work_1920x1080_scale(1.0);
        let result = calculate_snap_position_for_work_area(
            600, 720, SnapPosition::Top, &work, Some(0),
        );
        assert_eq!(result.x, 660);
        assert_eq!(result.y, 0);
    }

    // 反向验证：若误传物理像素 900（旧 bug），结果会偏
    #[test]
    fn passing_physical_pixels_would_offcenter() {
        let work = work_1920x1080_scale(1.5);
        let buggy = calculate_snap_position_for_work_area(
            900, 1080, SnapPosition::Top, &work, Some(0),
        );
        // 旧 bug：scaled_width = 900 * 1.5 = 1350，center_x = (1920-1350)/2 = 285
        assert_eq!(buggy.x, 285, "若传物理像素，HWND 会偏左 —— 此测试文档化旧 bug 行为");
    }

    // outer_size_to_logical 换算
    #[test]
    fn outer_size_to_logical_converts_correctly() {
        assert_eq!(outer_size_to_logical(900.0, 1080.0, 1.5), (600.0, 720.0));
        assert_eq!(outer_size_to_logical(600.0, 720.0, 1.0), (600.0, 720.0));
        // scale 异常时兜底
        assert_eq!(outer_size_to_logical(600.0, 720.0, 0.0), (600.0, 720.0));
    }

    // Scenario 3: 拖药丸到屏幕底部触发 bottom snap
    #[test]
    fn is_near_edge_for_work_bottom_uses_pill_bottom_y() {
        let work = work_1920x1080_scale(1.5); // bottom = 1080
        let pill_top = 1080 - 60;
        let pill_bottom = 1080 - 10; // 距 work.bottom 10 ≤ 40
        assert_eq!(is_near_edge_for_work(pill_top, pill_bottom, &work), Some(SnapPosition::Bottom));
    }

    // Scenario 4: 拖药丸到屏幕顶部仍触发 top snap
    #[test]
    fn is_near_edge_for_work_top_uses_pill_top_y() {
        let work = work_1920x1080_scale(1.5); // top = 0
        let pill_top = 30; // 距 work.top 30 ≤ 40
        let pill_bottom = 30 + 52;
        assert_eq!(is_near_edge_for_work(pill_top, pill_bottom, &work), Some(SnapPosition::Top));
    }

    // Scenario 5: HWND 中部不影响边缘检测
    #[test]
    fn is_near_edge_for_work_middle_returns_none() {
        let work = work_1920x1080_scale(1.5);
        // pill 在屏幕中部（HWND 大小不参与判断）
        let pill_top = 500;
        let pill_bottom = 552;
        assert_eq!(is_near_edge_for_work(pill_top, pill_bottom, &work), None);
    }

    // 反向验证：旧逻辑（用 HWND 底部 = pill_top + 720）会在中部误判
    #[test]
    fn legacy_hwnd_height_logic_would_false_positive_in_middle() {
        let work = work_1920x1080_scale(1.5);
        let pill_top = 500;
        let hwnd_height = 720; // B4-Lite bbox 高
        let scaled_h = (hwnd_height as f64 * 1.5).round() as i32; // 1080
        // 旧逻辑：work.bottom - scaled_h - y = 1080 - 1080 - 500 = -500，abs=500 > 40 → None
        // 但若用户把 pill 拖到屏幕底部（pill_top=980），旧逻辑：1080 - 1080 - 980 = -980 → None
        // 即旧逻辑永远检测不到 bottom —— 此测试文档化旧 bug
        let pill_top_near_bottom = 980;
        let legacy_check = ((work.bottom - scaled_h) - pill_top_near_bottom).abs();
        assert!(legacy_check > SNAP_THRESHOLD_CROSS, "旧逻辑下 bottom snap 永远不触发");
    }
}
