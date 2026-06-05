mod adapters;
mod agent_event;
mod agent_session;
mod approval_types;
mod audio;
mod claude_usage;
mod codex_hook_config;
mod command_analyzer;
mod commands;
mod config;
mod events;
mod hook_config;
mod hook_manifest;
mod hook_server;
mod logger;
mod overlay;
mod pipe_server;
mod process_watcher;
mod session_state;
mod session_store;
mod terminal_jump;
mod transcript_discovery;
mod window_focus;
mod window_manager;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable DPI awareness at startup (Windows only)
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = overlay::enable_dpi_awareness() {
            log::warn!("Failed to enable DPI awareness: {}", e);
        }
    }

    // Increase Windows timer resolution from ~15.6ms to ~1ms for smoother animations
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Media::timeBeginPeriod;
        unsafe {
            let _ = timeBeginPeriod(1);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Initialize Rust-side JSONL logger
            if let Err(e) = logger::init(app.handle()) {
                eprintln!("[ERROR] Failed to initialize JSONL logger: {}", e);
            }

            // Initialize SessionState (single source of truth for agent sessions)
            session_state::init(app.handle().clone());
            // Auto-discover transcript sessions on startup
            transcript_discovery::merge_into_state(&transcript_discovery::discover_sessions());

            // Position the main window at the top-center of the screen (Dynamic Island style)
            if let Some(window) = app.get_webview_window("main") {
                // Force WS_POPUP on the window to strip any residual WS_CAPTION / WS_THICKFRAME
                // that DWM may draw as a faint title bar on Windows 11 borderless windows.
                #[cfg(target_os = "windows")]
                {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
                    use windows::Win32::UI::Controls::MARGINS;
                    use windows::Win32::UI::WindowsAndMessaging::*;

                    if let Ok(hwnd_raw) = window.hwnd() {
                        let hwnd = HWND(hwnd_raw.0 as *mut _);
                        unsafe {
                            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                            let popup_only = style
                                & !((WS_CAPTION.0
                                    | WS_THICKFRAME.0
                                    | WS_SYSMENU.0
                                    | WS_MINIMIZEBOX.0
                                    | WS_MAXIMIZEBOX.0)
                                    as isize);
                            SetWindowLongPtrW(hwnd, GWL_STYLE, popup_only);

                            let margins = MARGINS {
                                cxLeftWidth: -1,
                                cxRightWidth: -1,
                                cyTopHeight: -1,
                                cyBottomHeight: -1,
                            };
                            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
                        }
                    }
                }

                if let Err(e) = window.set_zoom(1.0) {
                    log::warn!("Failed to reset WebView zoom: {}", e);
                }

                // Fix WebView2 DPR mismatch: set RasterizationScale to actual monitor DPI
                // so devicePixelRatio matches system DPI instead of WebView2's inflated value
                #[cfg(target_os = "windows")]
                {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller3;
                    use windows::Win32::Foundation::HWND;
                    use windows_core::Interface;

                    let dpi_scale = if let Ok(hwnd_raw) = window.hwnd() {
                        let hwnd = HWND(hwnd_raw.0 as *mut _);
                        overlay::get_dpi_scale_for_window(hwnd).unwrap_or(1.0)
                    } else {
                        1.0
                    };

                    if let Err(e) = window.with_webview(move |wv| {
                        let controller = wv.controller();
                        match controller.cast::<ICoreWebView2Controller3>() {
                            Ok(c3) => {
                                if let Err(e) = unsafe { c3.SetRasterizationScale(dpi_scale) } {
                                    log::warn!(
                                        "Failed to set WebView2 RasterizationScale to {}: {}",
                                        dpi_scale,
                                        e
                                    );
                                }
                                if let Err(e) =
                                    unsafe { c3.SetShouldDetectMonitorScaleChanges(false) }
                                {
                                    log::warn!(
                                        "Failed to disable WebView2 monitor scale detection: {}",
                                        e
                                    );
                                }
                                log::info!("WebView2 RasterizationScale set to {}", dpi_scale);
                            }
                            Err(e) => {
                                log::warn!("Failed to get ICoreWebView2Controller3: {}", e);
                            }
                        }
                    }) {
                        log::warn!("with_webview failed for DPI config: {}", e);
                    }
                }

                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let screen_width = monitor.size().width as i32;

                    // Use the ACTUAL window outer size for centering, not a hardcoded width.
                    let window_width = window.outer_size().map(|s| s.width as i32).unwrap_or(420);

                    // Read snap position preference from config
                    let snap_pos: window_manager::SnapPosition = {
                        let cfg = config::get_config();
                        match cfg.overlay.snap_position.as_str() {
                            "bottom" => window_manager::SnapPosition::Bottom,
                            _ => window_manager::SnapPosition::Top,
                        }
                    };

                    // Use window_manager to calculate snap position
                    if let Some(result) = window_manager::calculate_snap_position(
                        window_width,
                        60, // initial height (compact mode, approximate)
                        snap_pos,
                        None,
                        None,
                        None,
                    ) {
                        let _ = window.set_position(Position::Physical(PhysicalPosition {
                            x: result.x,
                            y: result.y,
                        }));
                        window_manager::set_current_snap_position(Some(snap_pos));
                    } else {
                        // Fallback: center horizontally at top of screen
                        let x = (screen_width - window_width) / 2;
                        let _ =
                            window.set_position(Position::Physical(PhysicalPosition { x, y: 8 }));
                    }
                }
            }

            // Prevent control-center window from being destroyed on close — hide instead
            if let Some(cc_window) = app.get_webview_window("control-center") {
                let w = cc_window.clone();
                cc_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // Start the named pipe server for receiving agent events
            #[cfg(target_os = "windows")]
            {
                match pipe_server::start_pipe_server(app.handle().clone()) {
                    Ok(()) => log::info!("Named pipe server started successfully"),
                    Err(e) => log::error!("Failed to start named pipe server: {}", e),
                }
            }

            // Start the HTTP hook server for Claude Code integration
            match hook_server::start_hook_server(app.handle().clone()) {
                Ok(()) => log::info!(
                    "Hook server started on port {}",
                    config::get_config().hook_server.port
                ),
                Err(e) => log::error!("Failed to start hook server: {}", e),
            }

            // Start the process watcher to detect agent processes and link PIDs to sessions
            match process_watcher::start_process_watcher(app.handle().clone()) {
                Ok(()) => log::info!("Process watcher started"),
                Err(e) => log::error!("Failed to start process watcher: {}", e),
            }

            // 启动周期性 JumpTarget 重新解析（每 30s 探测 Windows Terminal tab 信息）
            match process_watcher::start_jump_target_enricher() {
                Ok(()) => log::info!("JumpTarget enricher started"),
                Err(e) => log::error!("Failed to start JumpTarget enricher: {}", e),
            }

            // Auto-configure Claude Code hooks if needed
            match hook_config::auto_configure_hooks() {
                Ok(true) => log::info!("Claude Code hooks auto-configured"),
                Ok(false) => log::info!("Claude Code hooks already configured or manual mode"),
                Err(e) => log::warn!("Failed to auto-configure hooks: {}", e),
            }

            // Create tray menu items
            let show_hide = MenuItem::with_id(
                app,
                "toggle_visibility",
                "Show/Hide Overlay",
                true,
                None::<&str>,
            )?;

            // Hook config mode submenu
            let mode_auto = CheckMenuItem::with_id(
                app,
                "mode_auto",
                "Auto (keep on exit)",
                true,
                hook_config::get_stored_mode() == hook_config::HookConfigMode::Auto,
                None::<&str>,
            )?;
            let mode_cleanup = CheckMenuItem::with_id(
                app,
                "mode_cleanup",
                "Auto-cleanup (remove on exit)",
                true,
                hook_config::get_stored_mode() == hook_config::HookConfigMode::AutoCleanup,
                None::<&str>,
            )?;
            let mode_manual = CheckMenuItem::with_id(
                app,
                "mode_manual",
                "Manual",
                true,
                hook_config::get_stored_mode() == hook_config::HookConfigMode::Manual,
                None::<&str>,
            )?;

            let mode_submenu = Submenu::with_items(
                app,
                "Hook Config Mode",
                true,
                &[&mode_auto, &mode_cleanup, &mode_manual],
            )?;

            // Hook actions
            let install_hooks =
                MenuItem::with_id(app, "install_hooks", "Install Hooks", true, None::<&str>)?;
            let uninstall_hooks =
                MenuItem::with_id(app, "uninstall_hooks", "Remove Hooks", true, None::<&str>)?;

            let hooks_submenu = Submenu::with_items(
                app,
                "Hooks",
                true,
                &[&mode_submenu, &install_hooks, &uninstall_hooks],
            )?;

            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            // Build the menu
            let menu = Menu::with_items(app, &[&show_hide, &hooks_submenu, &quit])?;

            // Create system tray
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle_visibility" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "mode_auto" => {
                        let _ = hook_config::set_stored_mode(hook_config::HookConfigMode::Auto);
                        log::info!("Hook config mode set to: Auto");
                    }
                    "mode_cleanup" => {
                        let _ =
                            hook_config::set_stored_mode(hook_config::HookConfigMode::AutoCleanup);
                        log::info!("Hook config mode set to: AutoCleanup");
                    }
                    "mode_manual" => {
                        let _ = hook_config::set_stored_mode(hook_config::HookConfigMode::Manual);
                        log::info!("Hook config mode set to: Manual");
                    }
                    "install_hooks" => match hook_config::install_hooks() {
                        Ok(path) => log::info!("Hooks installed to: {}", path),
                        Err(e) => log::error!("Failed to install hooks: {}", e),
                    },
                    "uninstall_hooks" => match hook_config::uninstall_hooks() {
                        Ok(()) => log::info!("Hooks removed"),
                        Err(e) => log::error!("Failed to remove hooks: {}", e),
                    },
                    "quit" => {
                        // Stop servers before exit
                        let _ = hook_server::stop_hook_server();
                        #[cfg(target_os = "windows")]
                        let _ = pipe_server::stop_pipe_server();

                        // Auto-cleanup hooks if in auto-cleanup mode
                        let mode = hook_config::get_stored_mode();
                        if mode == hook_config::HookConfigMode::AutoCleanup {
                            let _ = hook_config::auto_cleanup_hooks(mode);
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_overlay,
            commands::set_overlay_interactive,
            commands::update_overlay,
            commands::destroy_overlay,
            commands::emit_test_event,
            commands::get_pipe_server_status,
            commands::start_pipe_server,
            commands::stop_pipe_server,
            commands::focus_session_window,
            commands::start_process_watcher,
            commands::stop_process_watcher,
            commands::get_process_watcher_status,
            commands::get_detected_processes,
            commands::set_process_watcher_config,
            commands::submit_approval_response,
            commands::get_dpi_scale,
            commands::get_dpi_scale_at_position,
            commands::update_overlay_with_dpi,
            commands::enable_dpi_awareness,
            commands::set_window_size,
            commands::set_window_interactive,
            commands::get_hook_server_status,
            commands::start_hook_server,
            commands::stop_hook_server,
            commands::get_hook_health,
            commands::get_hook_errors,
            commands::clear_hook_errors,
            commands::update_overlay_size,
            commands::check_hook_config,
            commands::install_hooks,
            commands::uninstall_hooks,
            commands::get_hook_config_status,
            commands::check_codex_hook_config,
            commands::install_codex_hooks,
            commands::uninstall_codex_hooks,
            commands::set_hook_config_mode,
            commands::get_hook_config_mode,
            commands::play_notification_sound,
            commands::get_notification_sounds,
            commands::get_app_config,
            commands::update_app_config,
            commands::reset_app_config,
            commands::reload_app_config,
            commands::simulate_session_start,
            commands::simulate_permission_request,
            commands::simulate_state_change,
            commands::simulate_session_end,
            commands::test_reset_sessions,
            commands::get_window_geometry,
            commands::save_sessions,
            commands::load_sessions,
            commands::get_session_store_path,
            commands::analyze_command,
            commands::flash_taskbar,
            commands::test_detect_terminal,
            commands::debug_sessions,
            commands::get_claude_usage,
            logger::log_entry,
            commands::discover_transcripts,
            commands::open_control_center,
            commands::snap_overlay,
            commands::smart_snap_overlay,
            commands::enumerate_monitors,
            commands::start_manual_drag,
            commands::move_overlay_drag,
            commands::end_manual_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
