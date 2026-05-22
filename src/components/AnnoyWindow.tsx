import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { GoalAlertPayload } from "../types";
import { formatLongDuration } from "../utils/format";

const appWindow = getCurrentWindow();
const DISMISS_DELAY_SECONDS = 5;

export function AnnoyWindow() {
  const [alert, setAlert] = useState<GoalAlertPayload | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [instanceKey, setInstanceKey] = useState(0);
  const unlockAtRef = useRef<number | null>(null);
  const lastAlertAtRef = useRef(0);
  const lastGoalIdRef = useRef<number | null>(null);
  const [drifted, setDrifted] = useState(false);
  const [snoozeReady, setSnoozeReady] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;

    void listen<GoalAlertPayload>("annoy-alert", (event) => {
      const now = Date.now();
      const sameGoal = lastGoalIdRef.current === event.payload.goalId;
      const shouldResetLock = !sameGoal || now - lastAlertAtRef.current > 1500;

      lastGoalIdRef.current = event.payload.goalId;
      lastAlertAtRef.current = now;
      setAlert(event.payload);
      setBusy(false);

      if (shouldResetLock) {
        unlockAtRef.current = now + DISMISS_DELAY_SECONDS * 1000;
        setCountdown(DISMISS_DELAY_SECONDS);
      }

      setInstanceKey((value) => value + 1);
    })
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch((error) => {
        console.error("Failed to subscribe to annoy alerts", error);
      });

    return () => {
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!alert) {
      return;
    }

    const updateCountdown = () => {
      const unlockAt = unlockAtRef.current;
      if (!unlockAt) {
        setCountdown(0);
        return;
      }

      const remainingMs = Math.max(0, unlockAt - Date.now());
      setCountdown(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();
    const interval = window.setInterval(() => {
      updateCountdown();
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [alert]);

  useEffect(() => {
    if (!alert) return;
    setDrifted(false);
    setSnoozeReady(false);
    const t = window.setTimeout(() => setSnoozeReady(true), 3000 + Math.random() * 2000);
    return () => window.clearTimeout(t);
  }, [alert, instanceKey]);

  const dismiss = async () => {
    await appWindow.hide();
  };

  const snooze = async () => {
    if (!alert) {
      return;
    }

    const SNOOZE_DURATIONS = [5, 3, 1];
    const snoozeMinutes = SNOOZE_DURATIONS[Math.min(alert?.snoozeCount ?? 0, SNOOZE_DURATIONS.length - 1)];

    setBusy(true);
    try {
      await invoke("snooze_goal", { goalId: alert.goalId, minutes: snoozeMinutes });
      unlockAtRef.current = null;
      await appWindow.hide();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="annoy-shell">
      <div className="annoy-shell__flash" key={instanceKey} />
      <section className="annoy-screen glass-card">
        <span className="annoy-screen__kicker">Annoy</span>
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
              <h1>{alert ? msg.heading(alert.label) : "Limit reached."}</h1>
              <p className="annoy-screen__lead">
                {alert
                  ? `You are at ${formatLongDuration(alert.totalSeconds)}. The hard threshold was ${formatLongDuration(alert.thresholdSeconds)}.`
                  : "You crossed a goal threshold."}
              </p>
              <p className="annoy-screen__lead">{msg.sub}</p>
              <p className="annoy-screen__lead">
                This screen will keep coming back every {alert?.repeatMinutes ?? 10} minutes until you stop or snooze it.
              </p>
              <div className="annoy-screen__actions">
                {showSnooze && (
                  <button
                    className="settings-button settings-button--accent"
                    disabled={busy || !snoozeReady}
                    onClick={() => void snooze()}
                    onMouseEnter={() => {
                      if (!drifted && (alert?.snoozeCount ?? 0) > 0) setDrifted(true);
                    }}
                    style={drifted ? { transform: "translate(8px, -4px)", transition: "transform 0.15s ease" } : {}}
                    type="button"
                  >
                    Snooze {snoozeMinutes} min
                  </button>
                )}
                <button className="settings-button" disabled={busy || countdown > 0} onClick={() => void dismiss()} type="button">
                  {countdown > 0 ? `Dismiss in ${countdown}s` : "Dismiss"}
                </button>
              </div>
            </>
          );
        })()}

        <div className="annoy-screen__actions">
          <button className="settings-button settings-button--accent" disabled={busy} onClick={() => void snooze()} type="button">
            Snooze 5 min
          </button>
          <button className="settings-button" disabled={busy || countdown > 0} onClick={() => void dismiss()} type="button">
            {countdown > 0 ? `Dismiss in ${countdown}s` : "Dismiss"}
          </button>
        </div>
      </section>
    </main>
  );
}
