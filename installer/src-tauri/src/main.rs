#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager, WebviewWindow};

const TRACKMLN_EXE_BYTES: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "\\assets\\app\\TrackMLN.exe"));

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallOptions {
    delete_installer_after_finish: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    install_dir: String,
    installed_exe: String,
    shortcut_path: String,
    startup_key: String,
    self_delete_scheduled: bool,
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![install])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_window_glass(&window);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running installer application");
}

#[tauri::command]
fn install(app: AppHandle, options: InstallOptions) -> Result<InstallResult, String> {
    let _ = app;

    let appdata_dir = resolve_appdata_dir()?;
    let install_dir = appdata_dir.join("TrackMLN");
    let installed_exe = install_dir.join("TrackMLN.exe");

    fs::create_dir_all(&install_dir)
        .map_err(|error| format!("failed to create install directory: {error}"))?;
    write_embedded_executable(&installed_exe)?;

    if !installed_exe.exists() {
        return Err(format!(
            "installed app executable was not found after writing the embedded payload into {}",
            install_dir.display()
        ));
    }

    let shortcut_path = create_start_menu_shortcut(&installed_exe)?;
    write_startup_registry_key(&installed_exe)?;
    launch_installed_app(&installed_exe)?;

    let self_delete_scheduled = if options.delete_installer_after_finish {
        schedule_self_delete()?;
        true
    } else {
        false
    };

    Ok(InstallResult {
        install_dir: install_dir.display().to_string(),
        installed_exe: installed_exe.display().to_string(),
        shortcut_path: shortcut_path.display().to_string(),
        startup_key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\TrackMLN"
            .to_string(),
        self_delete_scheduled,
    })
}

fn write_embedded_executable(destination: &Path) -> Result<(), String> {
    fs::write(destination, TRACKMLN_EXE_BYTES).map_err(|error| {
        format!(
            "failed to write embedded TrackMLN executable to {}: {error}",
            destination.display()
        )
    })
}

fn resolve_appdata_dir() -> Result<PathBuf, String> {
    env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "APPDATA environment variable is not available".to_string())
}

fn create_start_menu_shortcut(installed_exe: &Path) -> Result<PathBuf, String> {
    let appdata = resolve_appdata_dir()?;
    let programs_dir = appdata.join("Microsoft\\Windows\\Start Menu\\Programs");
    fs::create_dir_all(&programs_dir)
        .map_err(|error| format!("failed to create Start Menu programs directory: {error}"))?;

    let shortcut_path = programs_dir.join("TrackMLN.lnk");
    let working_dir = installed_exe
        .parent()
        .ok_or_else(|| "installed executable has no parent directory".to_string())?;

    let command = format!(
        "$shell = New-Object -ComObject WScript.Shell; \
         $shortcut = $shell.CreateShortcut('{shortcut}'); \
         $shortcut.TargetPath = '{target}'; \
         $shortcut.WorkingDirectory = '{working}'; \
         $shortcut.IconLocation = '{target},0'; \
         $shortcut.Save()",
        shortcut = escape_powershell_single_quoted(&shortcut_path.display().to_string()),
        target = escape_powershell_single_quoted(&installed_exe.display().to_string()),
        working = escape_powershell_single_quoted(&working_dir.display().to_string()),
    );

    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &command,
        ])
        .status()
        .map_err(|error| format!("failed to run PowerShell for shortcut creation: {error}"))?;

    if !status.success() {
        return Err("PowerShell failed while creating the Start Menu shortcut".to_string());
    }

    Ok(shortcut_path)
}

fn write_startup_registry_key(installed_exe: &Path) -> Result<(), String> {
    let value = format!("\"{}\"", installed_exe.display());
    let status = Command::new("reg")
        .args([
            "add",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            "TrackMLN",
            "/t",
            "REG_SZ",
            "/d",
            &value,
            "/f",
        ])
        .status()
        .map_err(|error| format!("failed to launch reg.exe: {error}"))?;

    if !status.success() {
        return Err("reg.exe failed while writing the startup registry key".to_string());
    }

    Ok(())
}

fn launch_installed_app(installed_exe: &Path) -> Result<(), String> {
    Command::new(installed_exe)
        .spawn()
        .map_err(|error| format!("failed to launch installed app: {error}"))?;
    Ok(())
}

fn schedule_self_delete() -> Result<(), String> {
    let current_exe = env::current_exe()
        .map_err(|error| format!("failed to locate installer executable: {error}"))?;
    let current_exe_str = current_exe.display().to_string();
    let command = format!(
        "ping 127.0.0.1 -n 3 > nul && del /f /q \"{}\"",
        current_exe_str.replace('"', "\"\"")
    );

    Command::new("cmd")
        .args(["/C", &command])
        .spawn()
        .map_err(|error| format!("failed to schedule installer self-delete: {error}"))?;

    Ok(())
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn apply_window_glass(window: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        if window_vibrancy::apply_mica(window, Some(true)).is_err() {
            let _ = window_vibrancy::apply_blur(window, Some((18, 18, 18, 120)));
        }
    }
}
