use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub hotkey: String,
    pub blur_percent: u8,
    pub material: String,
    pub exe_labels: HashMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "control+shift+Space".into(),
            blur_percent: 100,
            material: "mica".into(),
            exe_labels: default_exe_labels(),
        }
    }
}

pub fn default_exe_labels() -> HashMap<String, String> {
    [
        ("javaw.exe", "Minecraft"),
        ("pythonw.exe", "Python App"),
        ("python.exe", "Python"),
        ("cmd.exe", "Command Prompt"),
        ("explorer.exe", "File Explorer"),
        ("whatsapp.exe", "WhatsApp"),
        ("whatsapp.root.exe", "WhatsApp"),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppTotal {
    pub app_identity: String,
    pub app_name: String,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HourlyData {
    pub hour: u32,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeekDay {
    pub date: String,
    pub total: i64,
    pub apps: Vec<AppTotal>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeekData {
    pub days: Vec<WeekDay>,
    pub apps: Vec<AppTotal>,
    pub week_total: i64,
    pub current_week_average: f64,
    pub previous_week_average: f64,
    pub top_app: Option<AppTotal>,
}
