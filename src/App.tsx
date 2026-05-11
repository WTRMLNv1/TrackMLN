import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, type CSSProperties } from "react";
import { Sidebar } from "./components/Sidebar";
import { Today } from "./components/Today";
import { Week } from "./components/Week";
import { Settings } from "./components/Settings";
import { useDashboardScale } from "./hooks/useDashboardScale";
import type { AppSettings } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "control+shift+Space",
  blurPercent: 100
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"today" | "week" | "settings">("today");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const { baseHeight, baseWidth, containerRef, scale } = useDashboardScale();

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

  return (
    <main
      className="app-shell"
      style={
        {
          "--glass-blur": `${Math.round((34 * settings.blurPercent) / 100)}px`
        } as CSSProperties
      }
    >
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
