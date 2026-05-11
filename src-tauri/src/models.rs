use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub hotkey: String,
    pub blur_percent: u8,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "control+shift+Space".into(),
            blur_percent: 100,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppTotal {
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
