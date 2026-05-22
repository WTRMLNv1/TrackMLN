import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { GoalAlertPayload } from "../types";
import { formatLongDuration } from "../utils/format";

const appWindow = getCurrentWindow();
const AUTO_HIDE_MS = 8000;

export function WarnWindow() {
  const [alert, setAlert] = useState<GoalAlertPayload | null>(null);
  const [instanceKey, setInstanceKey] = useState(0);

  useEffect(() => {
    let dispose: (() => void) | undefined;

    void listen<GoalAlertPayload>("warn-alert", (event) => {
      setAlert(event.payload);
      setInstanceKey((value) => value + 1);
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
    if (!alert) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void appWindow.hide();
    }, AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [alert, instanceKey]);

  return (
    <main className="warn-shell">
      <section className="warn-toast glass-card" key={instanceKey}>
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
