import { invoke } from "@tauri-apps/api/core";
import { animate, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import editIcon from "../../assets/edit.svg";
import deleteIcon from "../../assets/delete.svg";
import type { AppSettings } from "../types";

type SettingsProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
};

type ModalView = "none" | "labels" | "editor";
type EditorMode = "add" | "edit";
type UndoState = {
  key: string;
  value: string;
} | null;
type MorphState = {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: string;
  backgroundColor: string;
} | null;

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

const MORPH_DURATION = 0.28;
const MORPH_EASE = [0.645, 0.045, 0.355, 1] as const;
export function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSavingHotkey, setIsSavingHotkey] = useState(false);
  const [isSavingBlur, setIsSavingBlur] = useState(false);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [isSavingExeLabels, setIsSavingExeLabels] = useState(false);
  const [storageLocation, setStorageLocation] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [modalView, setModalView] = useState<ModalView>("none");
  const [morphState, setMorphState] = useState<MorphState>(null);
  const [labelsDraft, setLabelsDraft] = useState<Record<string, string>>({});
  const [editorMode, setEditorMode] = useState<EditorMode>("add");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [exeInput, setExeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [isMorphingFromManage, setIsMorphingFromManage] = useState(false);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const morphRef = useRef<HTMLDivElement | null>(null);
  const labelButtonRef = useRef<HTMLButtonElement | null>(null);
  const labelsModalCardRef = useRef<HTMLDivElement | null>(null);
  const editorModalCardRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorInputRef = useRef<HTMLInputElement | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLabelsDraft(settings.exeLabels);
  }, [settings.exeLabels]);

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

  useEffect(() => {
    if (modalView === "editor") {
      window.setTimeout(() => editorInputRef.current?.focus(), 30);
    }
  }, [modalView]);

  useEffect(() => {
    if (!undoVisible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
      if (!isUndoShortcut || !undoState || isSavingExeLabels) {
        return;
      }

      event.preventDefault();
      void handleUndoDelete();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [undoState, undoVisible, isSavingExeLabels]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const sortedLabels = Object.entries(labelsDraft).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

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
    onSettingsChange({
      ...settings,
      blurPercent: value
    });
  };

  const commitBlurChange = (value: number) => {
    setIsSavingBlur(true);
    setMessage(null);

    void invoke<AppSettings>("set_blur_percent", { blurPercent: value })
      .then((nextSettings) => {
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

  const persistExeLabels = async (
    nextExeLabels: Record<string, string>,
    successMessage?: string
  ) => {
    setIsSavingExeLabels(true);
    setMessage(null);

    try {
      const nextSettings = await invoke<AppSettings>("set_exe_labels", { exeLabels: nextExeLabels });
      onSettingsChange(nextSettings);
      setLabelsDraft(nextSettings.exeLabels);
      if (successMessage) {
        setMessage(successMessage);
      }
      return nextSettings;
    } catch (error) {
      setMessage(String(error));
      throw error;
    } finally {
      setIsSavingExeLabels(false);
    }
  };

  const clearUndoBanner = () => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoVisible(false);
    setUndoState(null);
  };

  const showUndoBanner = (key: string, value: string) => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
    }

    setUndoState({ key, value });
    setUndoVisible(true);
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoVisible(false);
      window.setTimeout(() => {
        setUndoState(null);
      }, 260);
      undoTimeoutRef.current = null;
    }, 4000);
  };

  const handleUndoDelete = async () => {
    if (!undoState) {
      return;
    }

    const restored = {
      ...labelsDraft,
      [undoState.key]: undoState.value
    };

    clearUndoBanner();
    await persistExeLabels(restored, "Deletion undone.");
  };

  const runMorph = (
    source: HTMLElement,
    target: HTMLElement,
    onComplete: () => void,
    onStart?: () => void
  ) => {
    const scene = sceneRef.current;
    if (!scene) {
      onComplete();
      return;
    }

    const sceneRect = scene.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const sourceStyle = window.getComputedStyle(source);
    const targetStyle = window.getComputedStyle(target);

    setMorphState({
      left: sourceRect.left - sceneRect.left,
      top: sourceRect.top - sceneRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      borderRadius: sourceStyle.borderRadius,
      backgroundColor: sourceStyle.backgroundColor
    });
    onStart?.();

    requestAnimationFrame(() => {
      const element = morphRef.current;
      if (!element) {
        onComplete();
        return;
      }

      void animate(
        element,
        {
          left: targetRect.left - sceneRect.left,
          top: targetRect.top - sceneRect.top,
          width: targetRect.width,
          height: targetRect.height,
          borderRadius: targetStyle.borderRadius,
          backgroundColor: targetStyle.backgroundColor
        },
        {
          duration: MORPH_DURATION,
          ease: MORPH_EASE,
          onComplete: () => {
            setMorphState(null);
            setIsMorphingFromManage(false);
            onComplete();
          }
        }
      );
    });
  };

  const openLabelsModal = () => {
    if (!labelButtonRef.current || !labelsModalCardRef.current || morphState || modalView !== "none") {
      return;
    }

    runMorph(
      labelButtonRef.current,
      labelsModalCardRef.current,
      () => {
        setModalView("labels");
      },
      () => {
        setIsMorphingFromManage(true);
      }
    );
  };

  const openAddEditor = () => {
    if (!addButtonRef.current || !editorModalCardRef.current || morphState) {
      return;
    }

    setEditorMode("add");
    setEditingKey(null);
    setExeInput("");
    setNameInput("");
    setEditorError(null);
    setModalView("none");

    runMorph(addButtonRef.current, editorModalCardRef.current, () => {
      setModalView("editor");
    });
  };

  const openEditEditor = (key: string, value: string, source: HTMLButtonElement | null) => {
    if (!source || !editorModalCardRef.current || morphState) {
      return;
    }

    setEditorMode("edit");
    setEditingKey(key);
    setExeInput(key);
    setNameInput(value);
    setEditorError(null);
    setModalView("none");

    runMorph(source, editorModalCardRef.current, () => {
      setModalView("editor");
    });
  };

  const closeAllModals = () => {
    setModalView("none");
    setEditorError(null);
  };

  const closeEditorToLabels = () => {
    setModalView("labels");
    setEditorError(null);
  };

  const handleDeleteLabel = async (key: string) => {
    const previousValue = labelsDraft[key];
    const nextLabels = { ...labelsDraft };
    delete nextLabels[key];
    setLabelsDraft(nextLabels);

    try {
      await persistExeLabels(nextLabels);
      showUndoBanner(key, previousValue);
    } catch {
      setLabelsDraft(settings.exeLabels);
    }
  };

  const handleSubmitEditor = async () => {
    const normalizedKey = exeInput.trim().toLowerCase();
    const normalizedValue = nameInput.trim();

    if (!normalizedKey) {
      setEditorError("Enter the .exe filename.");
      return;
    }

    if (!normalizedValue) {
      setEditorError("Enter the label name.");
      return;
    }

    const candidateLabels = { ...labelsDraft };
    const duplicateKey = Object.keys(candidateLabels).find(
      (key) => key.toLowerCase() === normalizedKey && key !== editingKey
    );

    if (duplicateKey) {
      setEditorError("That .exe name already exists.");
      return;
    }

    if (editingKey && editingKey !== normalizedKey) {
      delete candidateLabels[editingKey];
    }

    candidateLabels[normalizedKey] = normalizedValue;

    try {
      await persistExeLabels(
        candidateLabels,
        editorMode === "add" ? "Exe label added." : "Exe label updated."
      );
      setModalView("labels");
      setEditorError(null);
    } catch {
      return;
    }
  };

  return (
    <section className="settings-layout" ref={sceneRef}>
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
                onBlur={(event) => commitBlurChange(Number(event.target.value))}
                onChange={(event) => handleBlurChange(Number(event.target.value))}
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

        <div className="settings-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              ref={labelButtonRef}
              className={`settings-button settings-button--accent settings-button--manage${isMorphingFromManage ? " is-hidden-for-morph" : ""}`}
              disabled={isSavingExeLabels || modalView !== "none" || morphState !== null}
              onClick={openLabelsModal}
              type="button"
            >
              Manage Exe Labels
            </button>
            {message ? <p className="settings-status" style={{ margin: 0 }}>{message}</p> : null}
          </div>

          <p className="settings-storage">
            Data is stored in{" "}
            <span title={storageLocation || "Loading storage location..."}>
              {storageLocation || "Loading storage location..."}
            </span>
          </p>
        </div>

        <div className="settings-modal-anchor" aria-hidden="true">
          <div className="settings-modal-card settings-modal-card--labels" ref={labelsModalCardRef} />
          <div className="settings-modal-card settings-modal-card--editor" ref={editorModalCardRef} />
        </div>
      </article>

      {morphState ? (
        <motion.div
          ref={morphRef}
          className="settings-morph"
          style={morphState}
        />
      ) : null}

      {undoState ? (
        <motion.div
          animate={{ opacity: undoVisible ? 1 : 0, y: undoVisible ? 0 : -28 }}
          className="settings-undo-toast"
          initial={{ opacity: 0, y: -28 }}
          transition={{ duration: 0.24, ease: MORPH_EASE }}
        >
          <span>Successfully deleted!</span>
          <button
            className="settings-undo-toast__button"
            disabled={isSavingExeLabels}
            onClick={() => {
              void handleUndoDelete();
            }}
            type="button"
          >
            Undo
          </button>
        </motion.div>
      ) : null}

      {modalView === "labels" ? (
        <div
          className="settings-modal-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAllModals();
            }
          }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="settings-modal settings-modal--labels glass-card"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ duration: 0.18, ease: MORPH_EASE }}
          >
            <div className="settings-modal__header">
              <div>
                <span className="card-kicker">Exe Labels</span>
                <h3>Friendly app names</h3>
              </div>
              <button className="settings-modal__close" onClick={closeAllModals} type="button">
                Close
              </button>
            </div>

            <div className="settings-label-list">
              {sortedLabels.length > 0 ? (
                sortedLabels.map(([key, value]) => (
                  <ExeLabelCard
                    key={key}
                    exeName={key}
                    isBusy={isSavingExeLabels}
                    label={value}
                    onDelete={() => {
                      void handleDeleteLabel(key);
                    }}
                    onEdit={(button) => openEditEditor(key, value, button)}
                  />
                ))
              ) : (
                <div className="settings-empty-state">No exe labels yet. Add one to customize names.</div>
              )}
            </div>

            <div className="settings-modal__footer">
              <button
                ref={addButtonRef}
                className="settings-button settings-button--accent settings-modal__add"
                disabled={isSavingExeLabels || morphState !== null}
                onClick={openAddEditor}
                type="button"
              >
                Add
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {modalView === "editor" ? (
        <div
          className="settings-modal-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditorToLabels();
            }
          }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="settings-modal settings-modal--editor glass-card"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ duration: 0.18, ease: MORPH_EASE }}
          >
            <div className="settings-modal__header">
              <div>
                <span className="card-kicker">Exe Labels</span>
                <h3>{editorMode === "add" ? "Add exe label" : "Edit exe label"}</h3>
              </div>
            </div>

            <div className="settings-form">
              <label className="settings-field">
                <span>Display name</span>
                <input
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Minecraft"
                  type="text"
                  value={nameInput}
                />
              </label>

              <label className="settings-field">
                <span>Executable name</span>
                <input
                  ref={editorInputRef}
                  onChange={(event) => setExeInput(event.target.value)}
                  placeholder="javaw.exe"
                  type="text"
                  value={exeInput}
                />
              </label>

              {editorError ? <p className="settings-form__error">{editorError}</p> : null}
            </div>

            <div className="settings-modal__actions">
              <button className="settings-button" disabled={isSavingExeLabels} onClick={closeEditorToLabels} type="button">
                Cancel
              </button>
              <button
                className="settings-button settings-button--accent"
                disabled={isSavingExeLabels}
                onClick={() => {
                  void handleSubmitEditor();
                }}
                type="button"
              >
                Submit
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </section>
  );
}

type ExeLabelCardProps = {
  exeName: string;
  label: string;
  isBusy: boolean;
  onEdit: (button: HTMLButtonElement | null) => void;
  onDelete: () => void;
};

function ExeLabelCard({ exeName, label, isBusy, onEdit, onDelete }: ExeLabelCardProps) {
  const editButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <article className="settings-label-card distribution-row">
      <div className="settings-label-card__copy">
        <span className="settings-label-card__title">{label}</span>
        <span className="settings-label-card__subtitle">{exeName}</span>
      </div>

      <div className="settings-label-card__actions">
        <button
          ref={editButtonRef}
          aria-label={`Edit ${exeName}`}
          className="settings-icon-button"
          disabled={isBusy}
          onClick={() => onEdit(editButtonRef.current)}
          type="button"
        >
          <img alt="" src={editIcon} />
        </button>

        <button
          aria-label={`Delete ${exeName}`}
          className="settings-icon-button settings-icon-button--danger"
          disabled={isBusy}
          onClick={onDelete}
          type="button"
        >
          <img alt="" src={deleteIcon} />
        </button>
      </div>
    </article>
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

  parts.push(normalizeKey(event));

  return parts.join("+");
}

function normalizeKey(event: KeyboardEvent): string {
  if (event.code.startsWith("Key") || event.code.startsWith("Digit")) {
    return event.code.slice(event.code.startsWith("Key") ? 3 : 5);
  }

  switch (event.code) {
    case "Space":
      return "Space";
    case "Backquote":
      return "`";
    case "Minus":
      return "-";
    case "Equal":
      return "=";
    case "BracketLeft":
      return "[";
    case "BracketRight":
      return "]";
    case "Backslash":
      return "\\";
    case "Semicolon":
      return ";";
    case "Quote":
      return "'";
    case "Comma":
      return ",";
    case "Period":
      return ".";
    case "Slash":
      return "/";
    default:
      return event.key.length === 1 ? event.key.toUpperCase() : event.key;
  }
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => {
      switch (part) {
        case "control":
          return "Ctrl";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        case "super":
          return "Win";
        case "Space":
          return "Space";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(" + ");
}
