use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use chrono::{DateTime, Local};
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow,
    GetMessageW, GetWindowThreadProcessId, MSG, RegisterClassW,
    WINDOW_EX_STYLE, WNDCLASSW, WS_OVERLAPPEDWINDOW,
};
use windows::Win32::System::Power::{
    RegisterPowerSettingNotification, POWERBROADCAST_SETTING,
};
use windows::Win32::System::SystemServices::GUID_MONITOR_POWER_ON;

use crate::db::{self, SharedDb};

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const MAX_SESSION_GAP: Duration = Duration::from_secs(4);

// Shared flag — true = screen is on, false = screen is off
static SCREEN_ON: AtomicBool = AtomicBool::new(true);

pub fn start_tracker(db: SharedDb, settings_path: PathBuf) {
    // Spin up the power monitor on its own thread (needs its own message loop)
    thread::spawn(|| {
        run_power_monitor();
    });

    thread::spawn(move || {
        let mut tracker = Tracker::new(db, settings_path);
        tracker.run();
    });
}

// ── Power monitor ────────────────────────────────────────────────────────────

fn run_power_monitor() {
    unsafe {
        // Register a minimal hidden window class just to receive messages
        let class_name: Vec<u16> = "ScreenMonitor\0".encode_utf16().collect();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(power_wnd_proc),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&wc);

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR::null(),
            WS_OVERLAPPEDWINDOW,
            0, 0, 0, 0,
            None,
            None,
            None,
            None,
        );

        let hwnd = match hwnd {
            Ok(h) => h,
            Err(_) => return,
        };

        // Subscribe to monitor power events
        RegisterPowerSettingNotification(
            windows::Win32::Foundation::HANDLE(hwnd.0),
            &GUID_MONITOR_POWER_ON,
            windows::Win32::UI::WindowsAndMessaging::REGISTER_NOTIFICATION_FLAGS(0),
        )
        .ok();

        // Standard Win32 message loop
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn power_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    const WM_POWERBROADCAST: u32 = 0x0218;
    const PBT_POWERSETTINGCHANGE: usize = 0x8013;

    if msg == WM_POWERBROADCAST && wparam.0 == PBT_POWERSETTINGCHANGE {
        let setting = &*(lparam.0 as *const POWERBROADCAST_SETTING);
        if setting.PowerSetting == GUID_MONITOR_POWER_ON {
            // Data is a DWORD: 0 = off, 1 = on, 2 = dimmed (treat dimmed as on)
            let state = *(setting.Data.as_ptr() as *const u32);
            let is_on = state != 0;
            SCREEN_ON.store(is_on, Ordering::Relaxed);
        }
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

// ── Tracker ──────────────────────────────────────────────────────────────────

struct Tracker {
    db: SharedDb,
    settings_path: PathBuf,
    current_exe: Option<String>,
    current_app: Option<String>,
    session_start: Option<DateTime<Local>>,
    last_tick: Instant,
    notified: HashSet<String>,
}

impl Tracker {
    fn new(db: SharedDb, settings_path: PathBuf) -> Self {
        Self {
            db,
            settings_path,
            current_exe: None,
            current_app: None,
            session_start: None,
            last_tick: Instant::now(),
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
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_tick);

        // Gap too large = laptop was asleep or suspended
        if elapsed > MAX_SESSION_GAP {
            self.flush_current()?;
        }

        self.last_tick = now;

        // Screen is off — flush whatever was running and skip this tick
        if !SCREEN_ON.load(Ordering::Relaxed) {
            self.flush_current()?;
            return Ok(());
        }

        let (exe, app_name) = get_active_window(&self.settings_path);

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

// ── Win32 helpers ─────────────────────────────────────────────────────────────

fn get_active_window(settings_path: &Path) -> (String, String) {
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
            let app_name = friendly_app_name(&exe, settings_path);
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

fn friendly_app_name(exe: &str, settings_path: &Path) -> String {
    if let Some(label) = load_exe_label(exe, settings_path) {
        return label;
    }

    match exe {
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

fn load_exe_label(exe: &str, settings_path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(settings_path).ok()?;
    let settings: crate::models::AppSettings = serde_json::from_str(&text).ok()?;

    // Try an exact key lookup first
    if let Some(v) = settings.exe_labels.get(exe) {
        return Some(v.clone());
    }

    // Normalize for case-insensitive matching and be tolerant of missing/extra ".exe" suffix
    let target = exe.to_lowercase();
    let target_no_ext = target.trim_end_matches(".exe");

    for (k, v) in settings.exe_labels.iter() {
        let key = k.to_lowercase();
        let key_no_ext = key.trim_end_matches(".exe");

        if key == target || key_no_ext == target_no_ext || key == target_no_ext || key_no_ext == target {
            return Some(v.clone());
        }
    }

    None
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}