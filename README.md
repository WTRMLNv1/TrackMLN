# TrackMLN

TrackMLN is a Windows desktop app for lightweight screen-time tracking.

It runs as a Tauri app with a React frontend, watches the currently focused window, logs usage locally, and shows the data in a full-screen glass-style dashboard that you can toggle with a global shortcut.

## What It Does

- Tracks the active foreground app once per second.
- Stores session history locally in SQLite.
- Shows a `Today` dashboard with:
  - total tracked time
  - most-used apps
  - hourly usage bars
- Shows a `Week` dashboard with:
  - weekly totals
  - most-used apps across the last 7 days
  - daily usage trend vs current and previous week averages
  - per-day app breakdown
- Includes a `Settings` screen for:
  - changing the global shortcut
  - adjusting the glass blur strength
- Runs from the system tray and can be shown or hidden with a hotkey.
- Includes a separate installer app that packages and installs the main app for Windows.

## Current Scope

TrackMLN currently focuses on local tracking and dashboarding.

- Data is stored only on the local machine.
- There is no account system or cloud sync.
- The app is currently Windows-only because the tracking code uses Windows APIs to read the active foreground process.
- The codebase already contains a `goals` table and tracker-side limit checks, but full goal management is not exposed in the current UI yet.

## Tech Stack

- Tauri 2
- React 18
- TypeScript
- Vite
- Rust
- SQLite via `rusqlite`
- Recharts

## Project Structure

```text
.
├─ src/                     React UI for the main TrackMLN app
├─ src-tauri/               Rust backend for the main app
├─ installer/               Separate Tauri app used to install TrackMLN
│  ├─ src/                  Installer frontend
│  └─ src-tauri/            Installer backend
└─ legacy-python/           Older code kept out of the active app flow
```

## How Tracking Works

The Rust tracker polls the active foreground window every second.

When the focused executable changes, the previous session is written to the local database with:

- app name
- start time
- end time

Some executable names are normalized into friendlier labels such as:

- `javaw.exe` -> `Minecraft`
- `explorer.exe` -> `File Explorer`
- `whatsapp.exe` -> `WhatsApp`

Idle and unknown windows are filtered out of the main dashboard views.

## Known Bugs

A few bugs are known and will be fixed shortly

1. Scrollbar looks... questionable
2. Sometimes the time achieves negative space time and shows screen time in one hour as more than one hour
3. Registers sleeping laptop time as screen time
4. Hover goes back a few hours in the hourly chart

## Local Data

TrackMLN stores its local files in the app data directory used by Tauri.

The app creates and maintains:

- `trackmln.db`
- `settings.json`

The database contains at least:

- `sessions`
- `goals`

The settings file currently stores:

- global shortcut
- blur percentage

## Default Behavior

- Default toggle shortcut: `Ctrl + Shift + Space`
- The main window starts hidden
- The app adds a tray icon
- Closing the window minimizes/hides it instead of fully exiting

## Development

### Requirements

- Windows
- Node.js and npm
- Rust toolchain
- Tauri prerequisites for Windows

### Install dependencies

From the project root:

```powershell
npm install
```

The installer project reuses the root `node_modules`, so you usually do not need a second install inside `installer`.

### Run the main app in dev mode

From the project root:

```powershell
npm run tauri:dev
```

This starts:

- the Vite dev server on `http://localhost:1420`
- the Tauri desktop app

Important:
If you run a debug/dev binary directly, it may still expect the dev server to be running. For normal packaged behavior, use a release build or the installer.

### Build the main app

From the project root:

```powershell
npm run tauri:build
```

## Installer

The `installer/` folder contains a separate Tauri app that installs TrackMLN by:

- copying the bundled app into `%APPDATA%\TrackMLN\TrackMLN.exe`
- creating a Start Menu shortcut
- adding the app to Windows startup for the current user
- launching the installed app after setup

### Build the installer

Build the main app first, then the installer.

1. Build the main app release binary:

```powershell
npm run tauri:build
```

2. Build the installer:

```powershell
cd installer
npm run tauri:build
```

The installer build now automatically copies the main app release executable into:

```text
installer/src-tauri/assets/trackmln.exe
```

So you do not need to copy that file by hand anymore.

## Notes For Contributors

- The repo intentionally ignores generated binaries, build folders, and the bundled installer payload.
- The installer source is tracked, but the embedded `trackmln.exe` is not.
- `legacy-python/` is preserved as old reference code and is not part of the active app.

## Known Limitations

- Windows-only tracking implementation
- No cloud sync
- No full in-app goal editing UI yet
- No notifications or enforcement flow when limits are exceeded yet

## License

No license has been added yet.

---

Made with 💚, Debugged with 😭 by [WTRMLN](github.com/WTRMLNv1)
