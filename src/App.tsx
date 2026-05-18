import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Today } from "./components/Today";
import { Week } from "./components/Week";
import { Settings } from "./components/Settings";
import { useDashboardScale } from "./hooks/useDashboardScale";
import type { AppSettings } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "control+shift+Space",
  blurPercent: 10,
  material: "mica",
  exeLabels: {}
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"today" | "week" | "settings">("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const { baseHeight, baseWidth, containerRef, scale } = useDashboardScale();
  const blurPercent = Math.max(0, Math.min(100, settings.blurPercent));

  useEffect(() => {
    let cancelled = false;

    void invoke<AppSettings>("get_settings")
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
        }
      })
      .catch((error) => {
        console.error("Failed to load settings", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.material = settings.material;
  }, [settings.material]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--blur-fraction", `${blurPercent / 100}`);
  }, [blurPercent]);

  return (
    <main className="app-shell">
      <div className="app-shell__backdrop" />
      <div className="app-shell__viewport" ref={containerRef}>
        <div
          className="dashboard-surface"
          style={{
            height: `${baseHeight}px`,
            transform: `translate(-50%, -50%) scale(${scale})`,
            width: `${baseWidth}px`
          }}
        >
          <Sidebar activeTab={activeTab} onChange={setActiveTab} />

          <section className="content-frame">
            {activeTab === "today" ? <Today /> : null}
            {activeTab === "week" ? <Week /> : null}
            {activeTab === "settings" ? (
              <Settings settings={settings} onSettingsChange={setSettings} />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
