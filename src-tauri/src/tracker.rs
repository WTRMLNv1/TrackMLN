use std::collections::HashSet;
use std::path::Path;
use std::thread;
use std::time::Duration;

use chrono::{DateTime, Local};
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use crate::db::{self, SharedDb};

const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub fn start_tracker(db: SharedDb) {
    thread::spawn(move || {
        let mut tracker = Tracker::new(db);
        tracker.run();
    });
}

struct Tracker {
    db: SharedDb,
    current_exe: Option<String>,
    current_app: Option<String>,
    session_start: Option<DateTime<Local>>,
    notified: HashSet<String>,
}

impl Tracker {
    fn new(db: SharedDb) -> Self {
        Self {
            db,
            current_exe: None,
            current_app: None,
            session_start: None,
            notified: HashSet::new(),
        }
    }

    fn run(&mut self) {
        loop {
            if let Err(err) = self.tick() {
                eprintln!("tracker tick failed: {err}");
            }
            thread::sleep(POLL_INTERVAL);
        }
    }

    fn tick(&mut self) -> Result<(), String> {
        let (exe, app_name) = get_active_window();

        if self.current_exe.as_deref() != Some(exe.as_str()) {
            self.flush_current()?;
            self.current_exe = Some(exe.clone());
            self.current_app = Some(app_name.clone());
            self.session_start = Some(Local::now());
        }

        self.check_limit(&app_name)?;
        Ok(())
    }

    fn flush_current(&mut self) -> Result<(), String> {
        let Some(app_name) = self.current_app.clone() else {
            self.current_exe = None;
            self.session_start = None;
            return Ok(());
        };
        let Some(start) = self.session_start else {
            self.current_exe = None;
            self.current_app = None;
            return Ok(());
        };

        let end = Local::now();
        let connection = self.db.lock().map_err(|err| err.to_string())?;
        db::log_session(&connection, &app_name, start, end).map_err(|err| err.to_string())?;

        self.current_exe = None;
        self.current_app = None;
        self.session_start = None;
        Ok(())
    }

    fn check_limit(&mut self, app_name: &str) -> Result<(), String> {
        if self.notified.contains(app_name) {
            return Ok(());
        }

        let connection = self.db.lock().map_err(|err| err.to_string())?;
        let Some(limit) = db::get_goal(&connection, app_name).map_err(|err| err.to_string())? else {
            return Ok(());
        };
        let total = db::get_today_total_for(&connection, app_name).map_err(|err| err.to_string())?;
        if total >= limit {
            self.notified.insert(app_name.to_string());
        }
        Ok(())
    }
}

fn get_active_window() -> (String, String) {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd == HWND(std::ptr::null_mut()) {
        return ("idle".into(), "Idle".into());
    }

    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }

    if process_id == 0 {
        return ("unknown".into(), "Unknown".into());
    }

    match process_exe_name(process_id) {
        Some(exe) => {
            let app_name = friendly_app_name(&exe);
            (exe, app_name)
        }
        None => ("unknown".into(), "Unknown".into()),
    }
}

fn process_exe_name(process_id: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()? };
    let mut size = 260u32;
    let mut buffer = vec![0u16; size as usize];

    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
    };

    unsafe {
        let _ = CloseHandle(handle);
    }

    if result.is_err() {
        return None;
    }

    let path = String::from_utf16_lossy(&buffer[..size as usize]);
    Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_lowercase())
}

fn friendly_app_name(exe: &str) -> String {
    match exe {
        "javaw.exe" => "Minecraft".into(),
        "pythonw.exe" => "Python App".into(),
        "python.exe" => "Python".into(),
        "cmd.exe" => "Command Prompt".into(),
        "explorer.exe" => "File Explorer".into(),
        "whatsapp.exe" | "whatsapp.root.exe" => "WhatsApp".into(),
        "unknown" => "Unknown".into(),
        "idle" => "Idle".into(),
        other => other
            .trim_end_matches(".exe")
            .split(['-', '_', ' '])
            .filter(|part| !part.is_empty())
            .map(capitalize)
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}
