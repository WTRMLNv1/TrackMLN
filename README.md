# TrackMLN

![Version](https://img.shields.io/badge/version-1.1.0-brightgreen) ![Platform](https://img.shields.io/badge/platform-Windows-blue) ![License](https://img.shields.io/badge/license-source--available-lightgrey)

TrackMLN is a Windows desktop app for lightweight screen-time tracking.

It runs as a Tauri app with a React frontend, watches the currently focused window, logs usage locally, and shows the data in a full-screen glass-style dashboard you can toggle with a global shortcut.

> ⚠️ Windows only. (Because I don't have MacOS or Linux 🥀. I won't download Linux for 1 single repo)

## What It Does

- Tracks the active foreground app once per second
- Stores session history locally in SQLite (your data stays on your machine, not my problem)
- Shows a `Today` dashboard with:
  - total tracked time
  - most-used apps
  - hourly usage bars
- Shows a `Week` dashboard with:
  - weekly totals
  - most-used apps across the last 7 days
  - daily usage trend vs current and previous week averages
  - per-day app breakdown
- `Settings` screen for changing the global shortcut and adjusting glass blur/opacity strength
- Two visual modes: **Mica** (default — minimalist, zero GPU) and **Liquid Glass** (more depth and animation, negligibly low GPU)
- Runs from the system tray, show/hide with a hotkey (`Ctrl + Shift + Space` by default)
- Comes with a separate installer app so you don't have to deal with any of that yourself

## How to Download

Just want it now? Download the latest installer directly [here](https://github.com/WTRMLNv1/TrackMLN/releases/download/v1.1.0/trackmln-installer-v1.1.0.exe).

Or grab it from the [Releases](https://github.com/WTRMLNv1/TrackMLN/releases) page — look for `trackmln-installer-v1.x.x.exe` in the Assets section.

> ⚠️ Do **not** install `trackmln-main-v1.x.x.exe` — it's not intended for normal use and won't show up as an app without manual setup.

After downloading:

1. Run the installer
2. If Windows SmartScreen appears, click `More info` → `Run anyway`
   *(The app isn't code-signed yet — this is expected)*
3. Finish setup

The installer will:
- install TrackMLN into your local app data folder
- create a Start Menu shortcut
- add TrackMLN to Windows startup
- launch the app automatically after install

To disable auto-startup: `Settings → Apps → Startup Apps → TrackMLN → Off`

> ⚠️ Not recommended — you'll have to launch it manually every time, which kind of defeats the purpose.

## What's New

### v1.1.0
- Blur slider now works — adjusts opacity and blur of cards and sidebar
- Added **Mica** and **Liquid Glass** visual modes (switchable in Settings)
- Fixed hourly chart hover jumping to the wrong time
- Fixed scrollbar mismatch
- Fixed data display inconsistency

### v1.0.1
- Fixed sleep time being logged as screen time
- Fixed record sleep time tracking

### v1.0.0
- Initial release

## Screenshots

<p align="center">
  <img src="https://github.com/WTRMLNv1/TrackMLN/raw/main/github-assets/daily.png" width="700" />
</p>

<p align="center">
  <img src="https://github.com/WTRMLNv1/TrackMLN/raw/main/github-assets/weekly.png" width="700" />
</p>

<p align="center">
  <img src="https://github.com/WTRMLNv1/TrackMLN/raw/main/github-assets/settings.png" width="700" />
</p>

<p align="center">
  <img src="https://github.com/WTRMLNv1/TrackMLN/raw/main/github-assets/installer.png" width="700" />
</p>

<p align="center">
  <img src="https://github.com/WTRMLNv1/TrackMLN/raw/main/github-assets/mogging%20peppa.jpeg" width="30" />
</p>

## Current Scope

TrackMLN is intentionally local and simple for now.

- All data stays on your machine — no accounts, no cloud sync
- Windows-only because the tracker uses Windows APIs to read the active foreground process
- There's already a `goals` table and limit checks in the backend, but the UI for managing goals isn't exposed yet — it'll get there, i hope

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
├─ installer/               Separate Tauri app that installs TrackMLN
│  ├─ src/                  Installer frontend
│  └─ src-tauri/            Installer backend
```

## How Tracking Works

The Rust backend polls the active foreground window every second. When the focused executable changes, it writes the previous session to the local database with the app name, start time, and end time.

Some executable names get normalized into friendlier labels:

- `javaw.exe` → `Minecraft`
- `explorer.exe` → `File Explorer`
- `whatsapp.exe` → `WhatsApp`

More normalizations coming — this list will eventually be editable in Settings.

Idle and unknown windows are filtered out of the dashboard views.

## Known Bugs

No known bugs as of v1.1.0. If something breaks, [open an issue](https://github.com/WTRMLNv1/TrackMLN/issues).

## Local Data

TrackMLN stores everything in the Tauri app data directory:

- `trackmln.db` — session history and goals
- `settings.json` — global shortcut and blur percentage

## Default Behavior

- Default toggle shortcut: `Ctrl + Shift + Space`
- The main window starts hidden
- Closing the window hides it instead of quitting — use the tray icon to exit fully

## Planned

- Editable app name normalizations
- In-app goal editing UI (backend already has it, UI doesn't yet)
- Notifications and limit enforcement (same deal)

## Known Limitations

- Windows-only (will make macOS if you buy me a MacBook to test it on ;))
- No cloud sync

## Development

### Requirements

- Windows
- Node.js + npm
- Rust toolchain
- Tauri prerequisites for Windows

### Install dependencies

From the project root:

```powershell
npm install
```

The installer reuses the root `node_modules`, so you usually don't need a second install inside `installer/`.

### Run the main app in dev mode

```powershell
npm run tauri:dev
```

This starts the Vite dev server on `http://localhost:1420` and the Tauri desktop app.

> Note: If you run a debug binary directly without the dev server running, it'll probably break. Use a release build or the installer for normal behavior.

### Build the main app

```powershell
npm run tauri:build
```

## Installer

The `installer/` folder is a separate Tauri app that:

- Copies the bundled app to `%APPDATA%\TrackMLN\TrackMLN.exe`
- Creates a Start Menu shortcut
- Adds TrackMLN to Windows startup for the current user
- Launches the app after setup

### Build the installer

Build the main app first, then the installer.

```powershell
# Step 1 — build the main app
npm run tauri:build

# Step 2 — build the installer
cd installer
npm run tauri:build
```

The installer build automatically copies the main app executable into `installer/src-tauri/assets/trackmln.exe` — no manual copying needed.

## Notes for Contributors

- The repo ignores generated binaries, build folders, and the bundled installer payload
- The installer source is tracked, but the embedded `trackmln.exe` is not

## License

Source-available — free for non-commercial use.
See [LICENSE](./LICENSE) for full terms.
(idk what its called ive only heard of MIT :/)

---

Made with 💚, Debugged with 😭 by [WTRMLN](https://github.com/WTRMLNv1)
