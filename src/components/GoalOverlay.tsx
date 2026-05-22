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
  const [drifted, setDrifted] = useState(false);
  const [snoozeReady, setSnoozeReady] = useState(false);

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

  useEffect(() => {
    if (!alert) return;
    setDrifted(false);
    setSnoozeReady(false);
    const t = window.setTimeout(() => setSnoozeReady(true), 3000 + Math.random() * 2000);
    return () => window.clearTimeout(t);
  }, [alert]);

  if (!alert) {
    return null;
  }

  const handleSnooze = async () => {
    if (!alert) return;
    const SNOOZE_DURATIONS = [5, 3, 1];
    const snoozeMinutes = SNOOZE_DURATIONS[Math.min(alert?.snoozeCount ?? 0, SNOOZE_DURATIONS.length - 1)];

    setBusy(true);
    try {
      await invoke("snooze_goal", { goalId: alert.goalId, minutes: snoozeMinutes });
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
        {(() => {
          const SNOOZE_DURATIONS = [5, 3, 1];
          const snoozeMinutes = SNOOZE_DURATIONS[Math.min(alert?.snoozeCount ?? 0, SNOOZE_DURATIONS.length - 1)];
          const showSnooze = (alert?.snoozeCount ?? 0) < SNOOZE_DURATIONS.length;
          const MESSAGES = [
            { heading: (l: string) => `${l} is officially a problem.`, sub: "You crossed your threshold." },
            { heading: (_: string) => `Still here?`,                    sub: "Okay so you snoozed. Bold." },
            { heading: (_: string) => `Genuinely impressive.`,          sub: "This is snooze #3." },
            { heading: (_: string) => `No more snoozes.`,               sub: "Touch grass." },
          ];
          const msg = MESSAGES[Math.min(alert?.snoozeCount ?? 0, MESSAGES.length - 1)];

          return (
            <>
              <h2>{msg.heading(alert.label)}</h2>
              <p className="goal-overlay__copy">
                You are at {formatLongDuration(alert.totalSeconds)} and the annoying threshold was {" "}
                {formatLongDuration(alert.thresholdSeconds)}.
              </p>
              <p className="goal-overlay__copy">{msg.sub}</p>
              <p className="goal-overlay__copy">
                Tray reminders will keep coming every {alert.repeatMinutes} minutes until you stop or snooze it.
              </p>

              <div className="goal-overlay__actions">
                {showSnooze && (
                  <button
                    className="settings-button settings-button--accent"
                    disabled={busy || !snoozeReady}
                    onClick={() => void handleSnooze()}
                    onMouseEnter={() => {
                      if (!drifted && (alert?.snoozeCount ?? 0) > 0) setDrifted(true);
                    }}
                    style={drifted ? { transform: "translate(8px, -4px)", transition: "transform 0.15s ease" } : {}}
                    type="button"
                  >
                    Snooze {snoozeMinutes} min
                  </button>
                )}
                <button className="settings-button" disabled={countdown > 0 || busy} onClick={onClose} type="button">
                  {countdown > 0 ? `Dismiss in ${countdown}s` : "Dismiss"}
                </button>
              </div>
            </>
          );
        })()}
      </article>
    </div>
  );
}
