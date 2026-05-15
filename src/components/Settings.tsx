import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { AppSettings } from "../types";

type SettingsProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
};

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight"
]);

export function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSavingHotkey, setIsSavingHotkey] = useState(false);
  const [isSavingBlur, setIsSavingBlur] = useState(false);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [storageLocation, setStorageLocation] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);

  // Debug: Log settings changes
  useEffect(() => {
    console.log("[Settings] settings prop changed:", settings);
    console.log("[Settings] blurPercent value:", settings.blurPercent);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    void invoke<string>("get_storage_location")
      .then((location) => {
        if (!cancelled) {
          setStorageLocation(location);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageLocation(`Unavailable (${String(error)})`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const shortcut = buildShortcut(event);
      if (!shortcut) {
        setMessage("Press a non-modifier key to finish recording.");
        return;
      }

      setIsRecording(false);
      setIsSavingHotkey(true);
      setMessage(null);

      void invoke<AppSettings>("set_hotkey", { hotkey: shortcut })
        .then((nextSettings) => {
          onSettingsChange(nextSettings);
          setMessage("Shortcut updated.");
        })
        .catch((error) => {
          setMessage(String(error));
        })
        .finally(() => {
          setIsSavingHotkey(false);
        });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isRecording, onSettingsChange]);

  const handleResetHotkey = () => {
    setIsRecording(false);
    setIsSavingHotkey(true);
    setMessage(null);

    void invoke<AppSettings>("reset_hotkey")
      .then((nextSettings) => {
        onSettingsChange(nextSettings);
        setIsRecording(false);
        setMessage("Shortcut reset to default.");
      })
      .catch((error) => {
        setMessage(String(error));
      })
      .finally(() => {
        setIsSavingHotkey(false);
      });
  };

  const handleBlurChange = (value: number) => {
    console.log("[Settings] handleBlurChange - slider value:", value);
    onSettingsChange({
      ...settings,
      blurPercent: value
    });
  };

  const commitBlurChange = (value: number) => {
    console.log("[Settings] commitBlurChange - committing blur value:", value);
    setIsSavingBlur(true);
    setMessage(null);

    void invoke<AppSettings>("set_blur_percent", { blurPercent: value })
      .then((nextSettings) => {
        console.log("[Settings] set_blur_percent response:", nextSettings);
        onSettingsChange(nextSettings);
      })
      .catch((error) => {
        setMessage(String(error));
      })
      .finally(() => {
        setIsSavingBlur(false);
      });
  };

  const handleResetBlur = () => {
    setIsSavingBlur(true);
    setMessage(null);

    void invoke<AppSettings>("reset_blur_percent")
      .then((nextSettings) => {
        onSettingsChange(nextSettings);
        setMessage("Blur reset to default.");
      })
      .catch((error) => {
        setMessage(String(error));
      })
      .finally(() => {
        setIsSavingBlur(false);
      });
  };

  const handleMaterialChange = (material: AppSettings["material"]) => {
    onSettingsChange({
      ...settings,
      material
    });
    setIsSavingMaterial(true);
    setMessage(null);

    void invoke<AppSettings>("set_material", { material })
      .then((nextSettings) => {
        onSettingsChange(nextSettings);
        setMessage(`Material updated to ${material === "mica" ? "Mica" : "Liquid Glass"}.`);
      })
      .catch((error) => {
        setMessage(String(error));
      })
      .finally(() => {
        setIsSavingMaterial(false);
      });
  };

  return (
    <section className="settings-layout">
      <article className="glass-card settings-card">
        <div className="card-header">
          <span className="card-kicker">Settings</span>
          <h2>Overlay Controls</h2>
        </div>

        <div className="settings-grid">
          <section className="settings-panel">
            <div className="settings-panel__header">
              <h3>Toggle shortcut</h3>
              <p>Choose the global keybind that opens and closes TrackMLN.</p>
            </div>

            <div className="settings-action-row">
              <button
                className={`settings-button settings-button--primary${isRecording ? " is-armed" : ""}`}
                disabled={isSavingHotkey}
                onClick={() => {
                  setMessage(null);
                  setIsRecording(true);
                }}
                type="button"
              >
                {isRecording ? "Press any key..." : formatShortcut(settings.hotkey)}
              </button>

              <button
                className="settings-button"
                disabled={isSavingHotkey}
                onClick={handleResetHotkey}
                type="button"
              >
                Reset to default
              </button>
            </div>

            <p className="settings-note">
              {isRecording
                ? "Recording is active. The next non-modifier key press will be saved."
                : "Current default: Ctrl + Shift + Space"}
            </p>
          </section>

          <section className="settings-panel">
            <div className="settings-panel__header">
              <h3>Background blur</h3>
              <p>Adjust how soft the glass panels look behind the dashboard.</p>
            </div>

            <div className="settings-slider-row">
              <input
                aria-label="Background blur percentage"
                className="settings-slider"
                disabled={isSavingBlur}
                max={100}
                min={0}
                onChange={(event) => handleBlurChange(Number(event.target.value))}
                onBlur={(event) => commitBlurChange(Number(event.target.value))}
                onMouseUp={(event) => commitBlurChange(Number((event.target as HTMLInputElement).value))}
                onTouchEnd={(event) => commitBlurChange(Number((event.target as HTMLInputElement).value))}
                type="range"
                value={settings.blurPercent}
              />
              <span className="settings-slider__value">{settings.blurPercent}%</span>
            </div>

            <div className="settings-action-row">
              <button
                className="settings-button"
                disabled={isSavingBlur}
                onClick={handleResetBlur}
                type="button"
              >
                Reset to default
              </button>
            </div>

            <p className="settings-note">
              The blur slider now adjusts card, panel, button, and list surface softness together.
            </p>
          </section>

          <section className="settings-panel">
            <div className="settings-panel__header">
              <h3>Material mode</h3>
              <p>Switch the overlay between a lighter Mica surface and deeper Liquid Glass effects.</p>
            </div>

            <div className="settings-action-row">
              <button
                className={`settings-button${settings.material === "mica" ? " is-active" : ""}`}
                disabled={isSavingMaterial}
                onClick={() => handleMaterialChange("mica")}
                type="button"
              >
                Mica
              </button>

              <button
                className={`settings-button${settings.material === "liquid" ? " is-active" : ""}`}
                disabled={isSavingMaterial}
                onClick={() => handleMaterialChange("liquid")}
                type="button"
              >
                Liquid Glass
              </button>
            </div>

            <p className="settings-note">
              Mica uses less GPU power. Liquid Glass uses stronger blur/depth effects.
            </p>
          </section>

        </div>

        <p className="settings-storage">
          Data is stored in <span title={storageLocation || "Loading storage location..."}>{storageLocation || "Loading storage location..."}</span>
        </p>

        {message ? <p className="settings-status">{message}</p> : null}
      </article>
    </section>
  );
}

function buildShortcut(event: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("control");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }
  if (event.metaKey) {
    parts.push("super");
  }

  parts.push(event.code);
  return parts.join("+");
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((token) => formatShortcutToken(token))
    .join(" + ");
}

function formatShortcutToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  const aliases: Record<string, string> = {
    alt: "Alt",
    control: "Ctrl",
    shift: "Shift",
    super: "Win",
    space: "Space",
    escape: "Esc",
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right"
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  if (/^key[a-z]$/i.test(token)) {
    return token.slice(-1).toUpperCase();
  }

  if (/^digit\d$/i.test(token)) {
    return token.slice(-1);
  }

  if (/^numpad\d$/i.test(token)) {
    return `Num ${token.slice(-1)}`;
  }

  return token.replace(/([a-z])([A-Z])/g, "$1 $2");
}
