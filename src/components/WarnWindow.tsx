import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { GoalAlertPayload } from "../types";
import { formatLongDuration } from "../utils/format";

const appWindow = getCurrentWindow();
const AUTO_HIDE_MS = 5000;

export function WarnWindow() {
  const [alert, setAlert] = useState<GoalAlertPayload | null>(null);
  const [instanceKey, setInstanceKey] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;

    void listen<GoalAlertPayload>("warn-alert", (event) => {
      setAlert(event.payload);
      setInstanceKey((value) => value + 1);
      setVisible(true);
    })
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch((error) => {
        console.error("Failed to subscribe to warn alerts", error);
      });

    return () => {
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      dismiss();
    }, AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [visible, instanceKey]);

  function dismiss() {
    setVisible(false);
    void appWindow.hide();
  }

  if (!visible) {
    return <main className="warn-shell" />;
  }

  return (
    <main className="warn-shell">
      <section className="warn-toast glass-card" key={instanceKey}>
        <button
          className="warn-toast__close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
        <span className="warn-toast__kicker">Warn</span>
        <h2>{alert?.label ?? "Limit warning"}</h2>
        <p>
          {alert
            ? `You just crossed ${formatLongDuration(alert.thresholdSeconds)}. You're now at ${formatLongDuration(alert.totalSeconds)} today.`
            : "Watching for limits..."}
        </p>
      </section>
    </main>
  );
}
