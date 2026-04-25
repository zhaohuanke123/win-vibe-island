mod overlay;
mod commands;
mod events;
mod mock;
mod pipe_server;
mod process_watcher;
mod window_focus;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            // Start the named pipe server for receiving agent events
            #[cfg(target_os = "windows")]
            {
                match pipe_server::start_pipe_server(app.handle().clone()) {
                    Ok(()) => log::info!("Named pipe server started successfully"),
                    Err(e) => log::error!("Failed to start named pipe server: {}", e),
                }
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
            commands::toggle_demo_mode,
            commands::set_demo_config,
            commands::get_demo_config_status,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}