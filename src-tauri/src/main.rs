#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_names;
mod commands;
mod db;
mod models;
mod settings;
mod tracker;

use app_names::{default_cache_path, AppNameResolver};
use db::{default_db_path, open_shared_database, SharedDb};
use models::AppSettings;
use settings::{default_settings_path, load_settings, save_settings, DEFAULT_HOTKEY};
use std::error::Error;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window, WindowEvent,
};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub struct AppState {
    pub db: SharedDb,
    pub settings: Arc<Mutex<AppSettings>>,
    pub settings_path: PathBuf,
    pub app_name_resolver: Arc<Mutex<AppNameResolver>>,
    pub limit_runtime: Arc<Mutex<tracker::LimitRuntime>>,
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_today_totals,
            commands::get_week_dashboard,
            commands::get_hourly_today,
            commands::get_goals,
            commands::get_goal_candidates,
            commands::get_settings,
            commands::get_storage_location,
            commands::save_goal,
            commands::delete_goal,
            commands::snooze_goal,
            commands::set_hotkey,
            commands::reset_hotkey,
            commands::set_blur_percent,
            commands::reset_blur_percent,
            commands::set_material,
            commands::reset_material,
            commands::set_exe_labels,
        ])
        .on_window_event(handle_window_event)
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db = open_shared_database(default_db_path(&data_dir))
                .expect("failed to initialize database");
            let settings_path = default_settings_path(&data_dir);
            let mut settings = load_settings(&settings_path).expect("failed to load settings");
            let settings_state = Arc::new(Mutex::new(settings.clone()));
            let resolver = Arc::new(Mutex::new(
                AppNameResolver::new(default_cache_path(&data_dir), settings.exe_labels.clone())
                    .expect("failed to initialize app name resolver"),
            ));
            let limit_runtime = Arc::new(Mutex::new(tracker::LimitRuntime::default()));
            let tracker_db = db.clone();
            let main_window = app
                .get_webview_window("main")
                .expect("main window should exist");

            #[cfg(desktop)]
            {
                if settings.hotkey.parse::<tauri_plugin_global_shortcut::Shortcut>().is_err() {
                    settings.hotkey = DEFAULT_HOTKEY.into();
                    save_settings(&settings_path, &settings).expect("failed to repair settings");
                }
            }

            app.manage(AppState {
                db,
                settings: settings_state.clone(),
                settings_path: settings_path.clone(),
                app_name_resolver: resolver.clone(),
                limit_runtime: limit_runtime.clone(),
            });
            apply_window_glass(&main_window);
            configure_main_window(&main_window)?;
            setup_tray(app.handle())?;
            let _ = main_window.hide();
            setup_global_shortcut(app.handle(), &settings.hotkey)?;
            tracker::start_tracker(tracker_db, resolver, limit_runtime, app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(desktop)]
fn setup_global_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), Box<dyn Error>> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            })
            .build(),
    )?;

    app.global_shortcut().register(shortcut)?;
    Ok(())
}

#[cfg(not(desktop))]
fn setup_global_shortcut(_app: &AppHandle, _shortcut: &str) -> Result<(), Box<dyn Error>> {
    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let is_visible = window.is_visible().unwrap_or(false);
    let is_minimized = window.is_minimized().unwrap_or(false);

    if is_visible && !is_minimized {
        let _ = window.hide();
    } else {
        let _ = configure_main_window(&window);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.minimize();
        }
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            let _ = configure_window(window);
        }
        _ => {}
    }
}

fn configure_main_window(window: &WebviewWindow) -> Result<(), Box<dyn Error>> {
    if let Some(monitor) = window.current_monitor()? {
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();

        window.set_position(PhysicalPosition::new(
            monitor_position.x,
            monitor_position.y,
        ))?;
        window.set_size(PhysicalSize::new(monitor_size.width, monitor_size.height))?;
    }

    window.set_fullscreen(true)?;
    window.set_resizable(false)?;
    Ok(())
}

fn configure_window(window: &Window) -> Result<(), Box<dyn Error>> {
    if let Some(monitor) = window.current_monitor()? {
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();

        window.set_position(PhysicalPosition::new(
            monitor_position.x,
            monitor_position.y,
        ))?;
        window.set_size(PhysicalSize::new(monitor_size.width, monitor_size.height))?;
    }

    window.set_fullscreen(true)?;
    window.set_resizable(false)?;
    Ok(())
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let open = MenuItemBuilder::with_id("open", "Open").build(app)?;
    let close = MenuItemBuilder::with_id("close", "Close").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &close]).build()?;
    let tray_icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;
    let app_handle = app.clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => toggle_main_window(app),
            "close" => {
                let state = app.state::<AppState>();
                if let Ok(mut resolver) = state.app_name_resolver.lock() {
                    let _ = resolver.save_if_dirty();
                }
                app_handle.exit(0);
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
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn apply_window_glass(window: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        if window_vibrancy::apply_mica(window, Some(true)).is_err() {
            let _ = window_vibrancy::apply_blur(window, Some((18, 18, 18, 120)));
        }
    }
}
