use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use chrono::{DateTime, Local};
use crate::app_names::{AppNameResolver, ResolvedApp};
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

pub fn start_tracker(db: SharedDb, app_name_resolver: Arc<Mutex<AppNameResolver>>) {
    // Spin up the power monitor on its own thread (needs its own message loop)
    thread::spawn(|| {
        run_power_monitor();
    });

    thread::spawn(move || {
        let mut tracker = Tracker::new(db, app_name_resolver);
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
    app_name_resolver: Arc<Mutex<AppNameResolver>>,
    current_identity: Option<String>,
    current_exe_name: Option<String>,
    current_app: Option<String>,
    session_start: Option<DateTime<Local>>,
    last_tick: Instant,
    notified: HashSet<String>,
}

impl Tracker {
    fn new(db: SharedDb, app_name_resolver: Arc<Mutex<AppNameResolver>>) -> Self {
        Self {
            db,
            app_name_resolver,
            current_identity: None,
            current_exe_name: None,
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

        let resolved = get_active_window(&self.app_name_resolver);

        if self.current_identity.as_deref() != Some(resolved.identity.as_str()) {
            self.flush_current()?;
            self.current_identity = Some(resolved.identity.clone());
            self.current_exe_name = Some(resolved.exe_name.clone());
            self.current_app = Some(resolved.app_name.clone());
            self.session_start = Some(Local::now());
        }

        self.check_limit(&resolved.app_name)?;
        self
            .app_name_resolver
            .lock()
            .map_err(|err| err.to_string())?
            .flush_if_due()?;
        Ok(())
    }

    fn flush_current(&mut self) -> Result<(), String> {
        let Some(app_name) = self.current_app.clone() else {
            self.current_identity = None;
            self.current_exe_name = None;
            self.session_start = None;
            return Ok(());
        };
        let Some(start) = self.session_start else {
            self.current_identity = None;
            self.current_exe_name = None;
            self.current_app = None;
            return Ok(());
        };

        let end = Local::now();
        let connection = self.db.lock().map_err(|err| err.to_string())?;
        db::log_session(
            &connection,
            self.current_identity.as_deref(),
            self.current_exe_name.as_deref(),
            &app_name,
            start,
            end,
        )
        .map_err(|err| err.to_string())?;

        self.current_identity = None;
        self.current_exe_name = None;
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

fn get_active_window(app_name_resolver: &Arc<Mutex<AppNameResolver>>) -> ResolvedApp {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd == HWND(std::ptr::null_mut()) {
        return ResolvedApp {
            identity: "idle".into(),
            exe_name: "idle".into(),
            app_name: "Idle".into(),
        };
    }

    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }

    if process_id == 0 {
        return ResolvedApp {
            identity: "unknown".into(),
            exe_name: "unknown".into(),
            app_name: "Unknown".into(),
        };
    }

    match process_exe_path(process_id) {
        Some(path) => app_name_resolver
            .lock()
            .map(|mut resolver| resolver.resolve_app_name(&path))
            .unwrap_or_else(|_| ResolvedApp {
                identity: "unknown".into(),
                exe_name: "unknown".into(),
                app_name: "Unknown".into(),
            }),
        None => ResolvedApp {
            identity: "unknown".into(),
            exe_name: "unknown".into(),
            app_name: "Unknown".into(),
        },
    }
}

fn process_exe_path(process_id: u32) -> Option<String> {
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

    Some(String::from_utf16_lossy(&buffer[..size as usize]))
}
