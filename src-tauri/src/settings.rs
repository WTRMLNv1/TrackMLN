use std::path::{Path, PathBuf};

use crate::models::AppSettings;

pub const DEFAULT_HOTKEY: &str = "control+shift+Space";
pub const DEFAULT_BLUR_PERCENT: u8 = 100;
pub const MAX_BLUR_PERCENT: u8 = 100;
pub const DEFAULT_MATERIAL: &str = "mica";

pub fn default_settings_path(base_dir: impl AsRef<Path>) -> PathBuf {
    base_dir.as_ref().join("settings.json")
}

pub fn load_settings(path: impl AsRef<Path>) -> Result<AppSettings, String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    if !path.exists() {
        let settings = AppSettings::default();
        save_settings(path, &settings)?;
        return Ok(settings);
    }

    let raw = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    if raw.trim().is_empty() {
        let settings = AppSettings::default();
        save_settings(path, &settings)?;
        return Ok(settings);
    }

    let settings = serde_json::from_str::<AppSettings>(&raw).map_err(|err| err.to_string())?;
    Ok(normalize_settings(settings))
}

pub fn save_settings(path: impl AsRef<Path>, settings: &AppSettings) -> Result<(), String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let normalized = normalize_settings(settings.clone());
    let raw = serde_json::to_string_pretty(&normalized).map_err(|err| err.to_string())?;
    std::fs::write(path, raw).map_err(|err| err.to_string())
}

pub fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    if settings.hotkey.trim().is_empty() {
        settings.hotkey = DEFAULT_HOTKEY.into();
    } else {
        settings.hotkey = settings.hotkey.trim().to_string();
    }

    settings.blur_percent = settings.blur_percent.min(MAX_BLUR_PERCENT);
    settings.material = normalize_material(&settings.material).into();
    settings
}

pub fn normalize_material(material: &str) -> &'static str {
    match material.trim().to_lowercase().as_str() {
        "mica" => "mica",
        "liquid" => "liquid",
        _ => DEFAULT_MATERIAL,
    }
}
