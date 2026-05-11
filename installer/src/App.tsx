import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type InstallResult = {
  installDir: string;
  installedExe: string;
  shortcutPath: string;
  startupKey: string;
  selfDeleteScheduled: boolean;
};

export default function App() {
  const appWindow = getCurrentWindow();
  const [deleteInstaller, setDeleteInstaller] = useState(true);
  const [status, setStatus] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const installPath = "%APPDATA%\\TrackMLN\\TrackMLN.exe";

  const copyInstallPath = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(installPath);
        return;
      }
    } catch {
      // Fall back to the hidden textarea flow below when clipboard access is unavailable.
    }

    const copyTarget = document.createElement("textarea");
    copyTarget.value = installPath;
    copyTarget.style.position = "fixed";
    copyTarget.style.opacity = "0";
    document.body.appendChild(copyTarget);
    copyTarget.select();
    document.execCommand("copy");
    document.body.removeChild(copyTarget);
  };

  const handleWindowAction = async (action: "minimize" | "close") => {
    try {
      if (action === "minimize") {
        await appWindow.minimize();
        return;
      }

      await appWindow.close();
    } catch (windowError) {
      setStatus("error");
      setError(
        `Window ${action} failed. Rebuild or restart the Tauri app so updated window permissions are picked up. ${
          windowError instanceof Error ? windowError.message : String(windowError)
        }`
      );
    }
  };

  const handleDragStart = async () => {
    try {
      await appWindow.startDragging();
    } catch (dragError) {
      setStatus("error");
      setError(
        `Window dragging failed. Rebuild or restart the Tauri app so updated window permissions are picked up. ${
          dragError instanceof Error ? dragError.message : String(dragError)
        }`
      );
    }
  };

  const handleInstall = async () => {
    setStatus("installing");
    setError(null);

    try {
      const installResult = await invoke<InstallResult>("install", {
        options: { deleteInstallerAfterFinish: deleteInstaller }
      });

      setResult(installResult);
      setStatus("done");

      if (installResult.selfDeleteScheduled) {
        window.setTimeout(() => {
          void appWindow.close();
        }, 1200);
      }
    } catch (installError) {
      setStatus("error");
      setError(installError instanceof Error ? installError.message : String(installError));
    }
  };

  return (
    <main className="installer-shell">
      <div className="installer-shell__backdrop" />

      <section className="installer-window">
        <header className="titlebar">
          <div className="titlebar__drag-region" data-tauri-drag-region onMouseDown={() => void handleDragStart()}>
            <span className="titlebar__eyebrow">TrackMLN setup</span>
            <strong>Installer</strong>
          </div>

          <div className="titlebar__actions">
            <button onClick={() => void handleWindowAction("minimize")} type="button">
              Minimize
            </button>
            <button onClick={() => void handleWindowAction("close")} type="button">
              Close
            </button>
          </div>
        </header>

        <div className="installer-layout">
          <aside className="glass-card installer-sidebar">
            <span className="sidebar__eyebrow">Focus overlay</span>
            <h1>TrackMLN</h1>
            <p>The same glassy desktop feel, now packaged as a one-click installer.</p>

            <div className="sidebar-panel">
              <span>What this installer does</span>
              <ul>
                <li>Copies the bundled app into your roaming app data folder</li>
                <li>Creates a Start Menu shortcut</li>
                <li>Adds TrackMLN to Windows startup</li>
                <li>Launches the app immediately after install</li>
              </ul>
            </div>
          </aside>

          <section className="glass-card installer-card">
            <div className="card-header">
              <span className="card-kicker">Ready</span>
              <h2>Install TrackMLN</h2>
              <p>
                This installer uses the prebuilt TrackMLN executable bundled inside the setup app,
                so the actual install is just a quick local copy and registration step.
              </p>
            </div>

            <div className="detail-grid">
              <article className="detail-tile detail-tile--wide">
                <span>Destination</span>
                <div className="path-row">
                  <textarea
                    aria-label="Install destination path"
                    className="path-field"
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    rows={2}
                    value={installPath}
                  />
                  <button className="copy-action" onClick={() => void copyInstallPath()} type="button">
                    Copy
                  </button>
                </div>
              </article>

              <article className="detail-tile">
                <span>Shortcut</span>
                <strong>Start Menu entry</strong>
              </article>

              <article className="detail-tile">
                <span>Startup</span>
                <strong>Enabled for current user</strong>
              </article>
            </div>

            <label className="installer-option">
              <input
                checked={deleteInstaller}
                onChange={(event) => setDeleteInstaller(event.target.checked)}
                type="checkbox"
              />
              <span>Delete installer after finishing</span>
            </label>

            <div className={`actions ${status === "error" && error ? "actions--with-status" : ""}`}>
              <button
                className="primary-action"
                disabled={status === "installing"}
                onClick={handleInstall}
                type="button"
              >
                {status === "installing" ? "Installing..." : "Install now"}
              </button>

              {status === "error" && error ? (
                <div className="status-panel status-panel--error status-panel--inline">
                  <strong>Installation failed.</strong>
                  <p className="status-panel__message">{error}</p>
                </div>
              ) : null}
            </div>

            {status === "done" && result ? (
              <div className="status-panel status-panel--success">
                <strong>Installation complete.</strong>
                <p className="status-panel__message">
                  TrackMLN has been launched from <code>{result.installedExe}</code>.
                </p>
                <p className="status-panel__message">
                  {result.selfDeleteScheduled
                    ? "The installer will close and remove itself."
                    : "The installer is staying in place because self-delete is turned off."}
                </p>
              </div>
            ) : null}

          </section>
        </div>
      </section>
    </main>
  );
}
