import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { GoalAlertPayload } from "../types";
import { formatLongDuration } from "../utils/format";

type GoalOverlayProps = {
  alert: GoalAlertPayload | null;
  onClose: () => void;
};

const DISMISS_DELAY_SECONDS = 5;

export function GoalOverlay({ alert, onClose }: GoalOverlayProps) {
  const [countdown, setCountdown] = useState(DISMISS_DELAY_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!alert) {
      return;
    }

    setCountdown(DISMISS_DELAY_SECONDS);
    const interval = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [alert]);

  if (!alert) {
    return null;
  }

  const handleSnooze = async () => {
    setBusy(true);
    try {
      await invoke("snooze_goal", { goalId: alert.goalId });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="goal-overlay">
      <div className="goal-overlay__backdrop" />
      <article className="goal-overlay__card glass-card">
        <span className="card-kicker">Limit reached</span>
        <h2>{alert.label} is over the line</h2>
        <p className="goal-overlay__copy">
          You are at {formatLongDuration(alert.totalSeconds)} and the annoying threshold was{" "}
          {formatLongDuration(alert.thresholdSeconds)}.
        </p>
        <p className="goal-overlay__copy">
          Tray reminders will keep coming every {alert.repeatMinutes} minutes until you stop or snooze it.
        </p>

        <div className="goal-overlay__actions">
          <button className="settings-button settings-button--accent" disabled={busy} onClick={() => void handleSnooze()} type="button">
            Snooze 5 min
          </button>
          <button className="settings-button" disabled={countdown > 0 || busy} onClick={onClose} type="button">
            {countdown > 0 ? `Dismiss in ${countdown}s` : "Dismiss"}
          </button>
        </div>
      </article>
    </div>
  );
}
