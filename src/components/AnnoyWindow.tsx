import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { GoalAlertPayload } from "../types";
import { formatLongDuration } from "../utils/format";

const appWindow = getCurrentWindow();

const DISMISS_DELAY_SECONDS = 5;
const SNOOZE_DURATIONS = [5, 3, 1];
const MESSAGES = [
  { heading: (l: string) => `${l} is officially a problem.`, sub: "You crossed your threshold." },
  { heading: (_: string) => `Still here?`,                   sub: "Okay so you snoozed. Bold." },
  { heading: (_: string) => `Genuinely impressive.`,         sub: "This is snooze #3." },
  { heading: (_: string) => `No more snoozes.`,              sub: "Touch grass." },
];

export function AnnoyWindow() {
  const [alert, setAlert] = useState<GoalAlertPayload | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [instanceKey, setInstanceKey] = useState(0);
  const [drifted, setDrifted] = useState(false);
  const [snoozeReady, setSnoozeReady] = useState(false);
  const unlockAtRef = useRef<number | null>(null);
  const lastAlertAtRef = useRef(0);
  const lastGoalIdRef = useRef<number | null>(null);

  const snoozeCount = alert?.snoozeCount ?? 0;
  const snoozeMinutes = SNOOZE_DURATIONS[Math.min(snoozeCount, SNOOZE_DURATIONS.length - 1)];
  const showSnooze = snoozeCount < SNOOZE_DURATIONS.length;
  const msg = MESSAGES[Math.min(snoozeCount, MESSAGES.length - 1)];

  useEffect(() => {
    let dispose: (() => void) | undefined;

    const showAlert = (payload: GoalAlertPayload) => {
      const now = Date.now();
      const sameGoal = lastGoalIdRef.current === payload.goalId;
      const shouldResetLock = !sameGoal || now - lastAlertAtRef.current > 1500;

      lastGoalIdRef.current = payload.goalId;
      lastAlertAtRef.current = now;
      setAlert(payload);
      setBusy(false);

      if (shouldResetLock) {
        unlockAtRef.current = now + DISMISS_DELAY_SECONDS * 1000;
        setCountdown(DISMISS_DELAY_SECONDS);
      }

      setInstanceKey((v) => v + 1);
    };

    void invoke<GoalAlertPayload | null>("get_pending_alert", { label: "annoy" })
      .then((payload) => {
        if (payload) {
          showAlert(payload);
        }
      })
      .catch((error) => { console.error("Failed to fetch pending annoy alert", error); });

    void listen<GoalAlertPayload>("annoy-alert", (event) => {
      showAlert(event.payload);
    })
      .then((unlisten) => { dispose = unlisten; })
      .catch((error) => { console.error("Failed to subscribe to annoy alerts", error); });

    return () => { dispose?.(); };
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (!alert) return;

    const tick = () => {
      const unlockAt = unlockAtRef.current;
      if (!unlockAt) { setCountdown(0); return; }
      setCountdown(Math.ceil(Math.max(0, unlockAt - Date.now()) / 1000));
    };

    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [alert]);

  // Snooze-ready delay
  useEffect(() => {
    if (!alert) return;
    setDrifted(false);
    setSnoozeReady(false);
    const t = window.setTimeout(() => setSnoozeReady(true), 3000 + Math.random() * 2000);
    return () => window.clearTimeout(t);
  }, [alert, instanceKey]);

  const hide = async () => {
    try {
      await appWindow.hide();
    } catch (e) {
      console.error("Failed to hide window", e);
    }
  };

  const dismiss = () => {
    void invoke("clear_pending_alert", { label: "annoy" }).catch((error) => {
      console.error("Failed to clear pending annoy alert", error);
    });
    void hide();
  };

  const snooze = async () => {
    if (!alert) return;
    setBusy(true);
    try {
      await invoke("snooze_goal", { goalId: alert.goalId, minutes: snoozeMinutes });
      await invoke("clear_pending_alert", { label: "annoy" });
      unlockAtRef.current = null;
      await hide();
    } finally {
      setBusy(false);
    }
  };

  // Don't render content until an alert arrives — but keep the shell so
  // Tauri doesn't show a gray rectangle on first open
  if (!alert) {
    return <main className="annoy-shell" />;
  }

  return (
    <main className="annoy-shell">
      <div className="annoy-shell__flash" key={instanceKey} />
      <section className="annoy-screen glass-card">
        <span className="annoy-screen__kicker">Annoy</span>

        <h1>{msg.heading(alert.label)}</h1>

        <p className="annoy-screen__lead">
          You are at {formatLongDuration(alert.totalSeconds)}. The hard threshold was {formatLongDuration(alert.thresholdSeconds)}.
        </p>
        <p className="annoy-screen__lead">{msg.sub}</p>
        <p className="annoy-screen__lead">
          This screen will keep coming back every {alert.repeatMinutes ?? 10} minutes until you stop or snooze it.
        </p>

        <div className="annoy-screen__actions">
          {showSnooze && (
            <button
              className="settings-button settings-button--accent"
              disabled={busy || !snoozeReady}
              onClick={() => void snooze()}
              onMouseEnter={() => { if (!drifted && snoozeCount > 0) setDrifted(true); }}
              style={drifted ? { transform: "translate(8px, -4px)", transition: "transform 0.15s ease" } : {}}
              type="button"
            >
              Snooze {snoozeMinutes} min
            </button>
          )}
          <button
            className="settings-button"
            disabled={busy || countdown > 0}
            onClick={dismiss}
            type="button"
          >
            {countdown > 0 ? `Dismiss in ${countdown}s` : "Dismiss"}
          </button>
        </div>
      </section>
    </main>
  );
}
