import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { AppSelect } from "./AppSelect";
import type { Goal, GoalCandidate, GoalDraft } from "../types";
import { formatLongDuration } from "../utils/format";

const EMPTY_DRAFT: GoalDraft = {
  targetKind: "app",
  targetValue: "",
  warnSeconds: null,
  annoySeconds: null
};

function parseHoursToSeconds(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 3600);
}

function formatSecondsToHours(value: number | null): string {
  if (!value || value <= 0) {
    return "";
  }

  return (value / 3600).toFixed(value % 3600 === 0 ? 0 : 1);
}

export function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [candidates, setCandidates] = useState<GoalCandidate[]>([]);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [warnHours, setWarnHours] = useState("");
  const [annoyHours, setAnnoyHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<Goal[]>("get_goals"),
      invoke<GoalCandidate[]>("get_goal_candidates")
    ])
      .then(([nextGoals, nextCandidates]) => {
        setGoals(nextGoals);
        setCandidates(nextCandidates);
        setLoading(false);
      })
      .catch((nextError) => {
        console.error(nextError);
        setError(String(nextError));
        setLoading(false);
      });
  }, []);

  const availableCandidates = useMemo(
    () => candidates.filter((candidate) => !goals.some((goal) => goal.targetValue === candidate.appIdentity && goal.id !== draft.id)),
    [candidates, draft.id, goals]
  );

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setWarnHours("");
    setAnnoyHours("");
    setError(null);
  };

  const submit = async () => {
    const nextDraft: GoalDraft = {
      ...draft,
      warnSeconds: parseHoursToSeconds(warnHours),
      annoySeconds: parseHoursToSeconds(annoyHours)
    };

    if (nextDraft.targetKind === "app" && !nextDraft.targetValue) {
      setError("Pick an app first.");
      return;
    }

    if (!nextDraft.warnSeconds && !nextDraft.annoySeconds) {
      setError("Add at least one threshold.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nextGoals = await invoke<Goal[]>("save_goal", { draft: nextDraft });
      setGoals(nextGoals);
      resetDraft();
    } catch (nextError) {
      console.error(nextError);
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (goal: Goal) => {
    setDraft({
      id: goal.id,
      targetKind: goal.targetKind,
      targetValue: goal.targetValue,
      warnSeconds: goal.warnSeconds,
      annoySeconds: goal.annoySeconds
    });
    setWarnHours(formatSecondsToHours(goal.warnSeconds));
    setAnnoyHours(formatSecondsToHours(goal.annoySeconds));
    setError(null);
  };

  const removeGoal = async (goalId: number) => {
    setSaving(true);
    try {
      const nextGoals = await invoke<Goal[]>("delete_goal", { goalId });
      setGoals(nextGoals);
      if (draft.id === goalId) {
        resetDraft();
      }
    } catch (nextError) {
      console.error(nextError);
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="goals-layout">
      <article className="glass-card goals-card">
        <div className="card-header">
          <span className="card-kicker">Goals</span>
          <h2>Limits & Nudges</h2>
        </div>

        <div className="goals-grid">
          <section className="goals-panel">
            <div className="goals-panel__header">
              <h3>Active limits</h3>
              <p>Warn once, then escalate into the annoying overlay if you keep going.</p>
            </div>

            <div className="goals-list">
              {loading ? <div className="empty-state">Loading goals...</div> : null}
              {!loading && goals.length === 0 ? (
                <div className="empty-state">No limits yet. Add one on the right.</div>
              ) : null}
              {goals.map((goal) => (
                <article className="goal-row" key={goal.id}>
                  <div>
                    <strong>{goal.label}</strong>
                    <p>
                      {goal.warnSeconds ? `Warn at ${formatLongDuration(goal.warnSeconds)}.` : "No warn threshold."}{" "}
                      {goal.annoySeconds ? `Annoy at ${formatLongDuration(goal.annoySeconds)}.` : "No annoy threshold."}
                    </p>
                  </div>
                  <div className="goal-row__actions">
                    <button className="settings-button" disabled={saving} onClick={() => startEditing(goal)} type="button">
                      Edit
                    </button>
                    <button
                      className="settings-button settings-button--danger"
                      disabled={saving}
                      onClick={() => void removeGoal(goal.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="goals-panel">
            <div className="goals-panel__header">
              <h3>{draft.id ? "Edit limit" : "Add a limit"}</h3>
              <p>Each threshold is optional, but you need at least one.</p>
            </div>

            <div className="goals-toggle-row">
              <button
                className={`settings-button${draft.targetKind === "app" ? " is-active" : ""}`}
                onClick={() => setDraft((current) => ({ ...current, targetKind: "app", targetValue: current.targetKind === "app" ? current.targetValue : "" }))}
                type="button"
              >
                Per app
              </button>
              <button
                className={`settings-button${draft.targetKind === "total" ? " is-active" : ""}`}
                onClick={() => setDraft((current) => ({ ...current, targetKind: "total", targetValue: "__total__" }))}
                type="button"
              >
                Total time
              </button>
            </div>

            {draft.targetKind === "app" ? (
              <label className="settings-field">
                <span>App</span>
                <AppSelect
                  options={availableCandidates.map((c) => ({ value: c.appIdentity, label: c.appName, sublabel: formatLongDuration(c.totalSeconds) }))}
                  value={draft.targetValue}
                  onChange={(val) => setDraft((current) => ({ ...current, targetValue: val }))}
                  placeholder="Choose a tracked app"
                />
              </label>
            ) : null}

            <div className="goals-threshold-grid">
              <label className="settings-field">
                <span>Warn at (hours)</span>
                <input
                  className="goals-input"
                  inputMode="decimal"
                  onChange={(event) => setWarnHours(event.target.value)}
                  placeholder="1.5"
                  value={warnHours}
                />
              </label>
              <label className="settings-field">
                <span>Annoy at (hours)</span>
                <input
                  className="goals-input"
                  inputMode="decimal"
                  onChange={(event) => setAnnoyHours(event.target.value)}
                  placeholder="2"
                  value={annoyHours}
                />
              </label>
            </div>

            {error ? <p className="settings-status">{error}</p> : null}

            <div className="settings-action-row">
              <button className="settings-button settings-button--accent" disabled={saving} onClick={() => void submit()} type="button">
                {saving ? "Saving..." : draft.id ? "Save limit" : "Add limit"}
              </button>
              <button className="settings-button" disabled={saving} onClick={resetDraft} type="button">
                Clear
              </button>
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}
