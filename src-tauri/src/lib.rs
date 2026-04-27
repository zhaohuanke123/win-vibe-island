mod overlay;
mod commands;
mod events;
mod pipe_server;
mod process_watcher;
mod window_focus;
mod hook_server;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Position, PhysicalPosition,
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

    tauri::Builder::default()
        .setup(|app| {
            // Initialize log plugin in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Position the main window at the top-center of the screen (Dynamic Island style)
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let screen_width = monitor.size().width as i32;
                    // Use a smaller initial width that fits the content
                    let window_width = 240;

                    // Center horizontally at top of screen
                    let x = (screen_width - window_width) / 2;
                    let _ = window.set_position(Position::Physical(PhysicalPosition { x, y: 8 }));
                }
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
                Ok(()) => log::info!("Hook server started on port 7878"),
                Err(e) => log::error!("Failed to start hook server: {}", e),
            }

            // Create tray menu items
            let show_hide = MenuItem::with_id(app, "toggle_visibility", "Show/Hide Overlay", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            // Build the menu
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

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
                    "quit" => {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}