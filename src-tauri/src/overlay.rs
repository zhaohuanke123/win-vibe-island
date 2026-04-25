#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
#[cfg(target_os = "windows")]
use windows::Win32::UI::HiDpi::*;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, HMONITOR, MONITOR_DEFAULTTONEAREST};

/// DPI scale factor (96 DPI = 1.0, 144 DPI = 1.5, 192 DPI = 2.0)
pub type DpiScale = f64;

/// Default DPI value (96 DPI is the Windows default)
pub const DEFAULT_DPI: u32 = 96;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OverlayConfig {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub alpha: u8,
    /// DPI scale factor for the monitor where this overlay is displayed
    #[serde(default = "default_dpi_scale")]
    pub dpi_scale: DpiScale,
}

fn default_dpi_scale() -> DpiScale {
    1.0
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 320,
            height: 48,
            alpha: 240,
            dpi_scale: 1.0,
        }
    }
}

/// Scale dimensions based on DPI scale factor
fn scale_dimensions(width: i32, height: i32, dpi_scale: DpiScale) -> (i32, i32) {
    let scaled_width = (width as f64 * dpi_scale).round() as i32;
    let scaled_height = (height as f64 * dpi_scale).round() as i32;
    (scaled_width, scaled_height)
}

#[cfg(target_os = "windows")]
/// Get the DPI scale factor for a specific window
pub fn get_dpi_scale_for_window(hwnd: HWND) -> Result<DpiScale, String> {
    unsafe {
        let dpi = GetDpiForWindow(hwnd);
        if dpi == 0 {
            return Ok(1.0);
        }
        Ok(dpi as f64 / DEFAULT_DPI as f64)
    }
}

#[cfg(target_os = "windows")]
/// Get the DPI scale factor for a monitor
pub fn get_dpi_scale_for_monitor(hmonitor: HMONITOR) -> Result<DpiScale, String> {
    unsafe {
        let mut dpi_x: u32 = DEFAULT_DPI;
        let mut dpi_y: u32 = DEFAULT_DPI;

        let result = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        if result.is_err() {
            return Ok(1.0);
        }

        // Use the X DPI for scale calculation (typically same as Y for monitors)
        Ok(dpi_x as f64 / DEFAULT_DPI as f64)
    }
}

#[cfg(target_os = "windows")]
/// Get the monitor handle from a point (for determining which monitor the overlay is on)
pub fn get_monitor_from_point(x: i32, y: i32) -> Option<HMONITOR> {
    unsafe {
        let point = POINT { x, y };
        let hmonitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
        if hmonitor.is_invalid() {
            None
        } else {
            Some(hmonitor)
        }
    }
}

#[cfg(target_os = "windows")]
/// Get the DPI scale factor for the monitor at a specific point
pub fn get_dpi_scale_at_point(x: i32, y: i32) -> DpiScale {
    get_monitor_from_point(x, y)
        .and_then(|hmonitor| get_dpi_scale_for_monitor(hmonitor).ok())
        .unwrap_or(1.0)
}

#[cfg(target_os = "windows")]
/// Initialize the app as DPI-aware (should be called once at startup)
pub fn enable_dpi_awareness() -> Result<(), String> {
    unsafe {
        // SetProcessDpiAwarenessContext makes the app per-monitor DPI aware v2
        // This is the most modern DPI awareness mode
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
            .map_err(|e| format!("Failed to set DPI awareness: {}", e))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn create_overlay_window(config: &OverlayConfig) -> Result<HWND, String> {
    let class_name = windows::core::w!("VibeIslandOverlay");

    let wc = WNDCLASSW {
        hInstance: unsafe { GetModuleHandleW(None).map_err(|e| e.to_string())?.into() },
        lpszClassName: class_name,
        ..Default::default()
    };

    unsafe {
        RegisterClassW(&wc);

        let ex_style = WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE;
        let style = WS_POPUP;

        // Scale dimensions based on DPI
        let (scaled_width, scaled_height) = scale_dimensions(config.width, config.height, config.dpi_scale);

        let hwnd = CreateWindowExW(
            ex_style,
            class_name,
            windows::core::w!(""),
            style,
            config.x,
            config.y,
            scaled_width,
            scaled_height,
            None,
            None,
            wc.hInstance,
            None,
        ).map_err(|e| e.to_string())?;

        SetLayeredWindowAttributes(
            hwnd,
            COLORREF(0),
            config.alpha,
            LWA_ALPHA,
        ).map_err(|e| e.to_string())?;

        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        Ok(hwnd)
    }
}

#[cfg(target_os = "windows")]
pub fn set_interactive(hwnd: HWND, interactive: bool) -> Result<(), String> {
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let new_style = if interactive {
            ex_style & !(WS_EX_TRANSPARENT.0 as isize)
        } else {
            ex_style | (WS_EX_TRANSPARENT.0 as isize)
        };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn update_overlay_position(hwnd: HWND, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    // Get current DPI scale for the window
    let dpi_scale = get_dpi_scale_for_window(hwnd)?;
    let (scaled_width, scaled_height) = scale_dimensions(width, height, dpi_scale);

    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x, y, scaled_width, scaled_height,
            SWP_NOACTIVATE,
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
/// Update overlay position with explicit DPI scale (for handling DPI changes)
pub fn update_overlay_position_with_dpi(
    hwnd: HWND,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    dpi_scale: DpiScale,
) -> Result<(), String> {
    let (scaled_width, scaled_height) = scale_dimensions(width, height, dpi_scale);

    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x, y, scaled_width, scaled_height,
            SWP_NOACTIVATE,
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn destroy_overlay(hwnd: HWND) -> Result<(), String> {
    unsafe {
        DestroyWindow(hwnd).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn create_overlay_window(_config: &OverlayConfig) -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn set_interactive(_interactive: bool) -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn update_overlay_position(_x: i32, _y: i32, _width: i32, _height: i32) -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn update_overlay_position_with_dpi(
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
    _dpi_scale: DpiScale,
) -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn destroy_overlay() -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn get_dpi_scale_for_window() -> Result<DpiScale, String> {
    Ok(1.0)
}

#[cfg(not(target_os = "windows"))]
pub fn get_dpi_scale_at_point(_x: i32, _y: i32) -> DpiScale {
    1.0
}

#[cfg(not(target_os = "windows"))]
pub fn enable_dpi_awareness() -> Result<(), String> {
    Ok(())
}
