use std::collections::HashMap;

use tauri::State;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::app_names::looks_like_exe_path;
use crate::db;
use crate::models::{AppSettings, AppTotal, HourlyData, WeekData};
use crate::settings;
use crate::AppState;

#[tauri::command]
pub fn get_today_totals(state: State<AppState>) -> Result<Vec<AppTotal>, String> {
    let connection = state.db.lock().map_err(|err| err.to_string())?;
    let apps = db::get_today_totals(&connection).map_err(|err| err.to_string())?;
    let mut resolver = state
        .app_name_resolver
        .lock()
        .map_err(|err| err.to_string())?;
    Ok(apps
        .into_iter()
        .map(|app| present_app_total(&mut resolver, app))
        .collect())
}

#[tauri::command]
pub fn get_week_dashboard(state: State<AppState>) -> Result<WeekData, String> {
    let connection = state.db.lock().map_err(|err| err.to_string())?;
    let mut data = db::get_week_dashboard(&connection).map_err(|err| err.to_string())?;
    let mut resolver = state
        .app_name_resolver
        .lock()
        .map_err(|err| err.to_string())?;

    data.apps = data
        .apps
        .into_iter()
        .map(|app| present_app_total(&mut resolver, app))
        .collect();
    data.top_app = data
        .top_app
        .map(|app| present_app_total(&mut resolver, app));
    data.days = data
        .days
        .into_iter()
        .map(|mut day| {
            day.apps = day
                .apps
                .into_iter()
                .map(|app| present_app_total(&mut resolver, app))
                .collect();
            day
        })
        .collect();

    Ok(data)
}

#[tauri::command]
pub fn get_hourly_today(state: State<AppState>) -> Result<Vec<HourlyData>, String> {
    let connection = state.db.lock().map_err(|err| err.to_string())?;
    db::get_hourly_today(&connection).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|err| err.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn get_storage_location(state: State<AppState>) -> Result<String, String> {
    let location = state
        .settings_path
        .parent()
        .unwrap_or(state.settings_path.as_path())
        .to_string_lossy()
        .into_owned();
    Ok(location)
}

#[tauri::command]
pub fn set_blur_percent(state: State<AppState>, blur_percent: u8) -> Result<AppSettings, String> {
    let mut settings_value = state.settings.lock().map_err(|err| err.to_string())?;
    settings_value.blur_percent = blur_percent.min(settings::MAX_BLUR_PERCENT);
    settings::save_settings(&state.settings_path, &settings_value)?;
    Ok(settings_value.clone())
}

#[tauri::command]
pub fn reset_blur_percent(state: State<AppState>) -> Result<AppSettings, String> {
    set_blur_percent(state, settings::DEFAULT_BLUR_PERCENT)
}

#[tauri::command]
pub fn set_material(state: State<AppState>, material: String) -> Result<AppSettings, String> {
    let mut settings_value = state.settings.lock().map_err(|err| err.to_string())?;
    settings_value.material = settings::normalize_material(&material).into();
    settings::save_settings(&state.settings_path, &settings_value)?;
    Ok(settings_value.clone())
}

#[tauri::command]
pub fn reset_material(state: State<AppState>) -> Result<AppSettings, String> {
    set_material(state, settings::DEFAULT_MATERIAL.into())
}

#[tauri::command]
pub fn set_exe_labels(state: State<AppState>, exe_labels: HashMap<String, String>) -> Result<AppSettings, String> {
    let mut settings_value = state.settings.lock().map_err(|err| err.to_string())?;
    settings_value.exe_labels = settings::normalize_exe_labels(exe_labels);
    {
        let mut resolver = state
            .app_name_resolver
            .lock()
            .map_err(|err| err.to_string())?;
        resolver.set_user_exe_names(settings_value.exe_labels.clone());
    }
    settings::save_settings(&state.settings_path, &settings_value)?;
    Ok(settings_value.clone())
}

#[tauri::command]
pub fn set_hotkey(app: tauri::AppHandle, state: State<AppState>, hotkey: String) -> Result<AppSettings, String> {
    update_hotkey(app, state, hotkey)
}

#[tauri::command]
pub fn reset_hotkey(app: tauri::AppHandle, state: State<AppState>) -> Result<AppSettings, String> {
    update_hotkey(app, state, settings::DEFAULT_HOTKEY.into())
}

fn update_hotkey(app: tauri::AppHandle, state: State<AppState>, hotkey: String) -> Result<AppSettings, String> {
    #[cfg(not(desktop))]
    {
        let _ = app;
        let _ = state;
        let _ = hotkey;
        return Err("Global shortcuts are not supported on this platform".into());
    }

    #[cfg(desktop)]
    {
        let parsed = Shortcut::try_from(hotkey.as_str()).map_err(|err| err.to_string())?;
        let normalized = parsed.into_string();

        let mut settings_value = state.settings.lock().map_err(|err| err.to_string())?;
        if settings_value.hotkey == normalized {
            return Ok(settings_value.clone());
        }

        app.global_shortcut()
            .register(parsed)
            .map_err(|err| format!("Failed to register shortcut: {err}"))?;

        if let Err(err) = app.global_shortcut().unregister(settings_value.hotkey.as_str()) {
            let _ = app.global_shortcut().unregister(parsed);
            return Err(format!("Failed to remove previous shortcut: {err}"));
        }

        let previous_hotkey = settings_value.hotkey.clone();
        settings_value.hotkey = normalized;

        if let Err(err) = settings::save_settings(&state.settings_path, &settings_value) {
            let _ = app.global_shortcut().register(previous_hotkey.as_str());
            let _ = app.global_shortcut().unregister(parsed);
            settings_value.hotkey = previous_hotkey;
            return Err(err);
        }

        Ok(settings_value.clone())
    }
}

fn present_app_total(
    resolver: &mut crate::app_names::AppNameResolver,
    mut app: AppTotal,
) -> AppTotal {
    if looks_like_exe_path(&app.app_identity) || app.app_identity == "idle" || app.app_identity == "unknown" {
        app.app_name = resolver.resolve_app_name(&app.app_identity).app_name;
    }
    app
}
