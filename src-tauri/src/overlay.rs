#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::LibraryLoader::GetModuleHandleW;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OverlayConfig {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub alpha: u8,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 320,
            height: 48,
            alpha: 240,
        }
    }
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

        let hwnd = CreateWindowExW(
            ex_style,
            class_name,
            windows::core::w!(""),
            style,
            config.x,
            config.y,
            config.width,
            config.height,
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
    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x, y, width, height,
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
pub fn destroy_overlay() -> Result<(), String> {
    Err("Overlay is only supported on Windows".into())
}
