use tauri::State;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::db;
use crate::models::{AppSettings, AppTotal, HourlyData, WeekData};
use crate::settings;
use crate::AppState;

#[tauri::command]
pub fn get_today_totals(state: State<AppState>) -> Result<Vec<AppTotal>, String> {
    let connection = state.db.lock().map_err(|err| err.to_string())?;
    db::get_today_totals(&connection).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_week_dashboard(state: State<AppState>) -> Result<WeekData, String> {
    let connection = state.db.lock().map_err(|err| err.to_string())?;
    db::get_week_dashboard(&connection).map_err(|err| err.to_string())
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
