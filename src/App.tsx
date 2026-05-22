import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Today } from "./components/Today";
import { Week } from "./components/Week";
import { Goals } from "./components/Goals";
import { Settings } from "./components/Settings";
import { WarnWindow } from "./components/WarnWindow";
import { AnnoyWindow } from "./components/AnnoyWindow";
import { useDashboardScale } from "./hooks/useDashboardScale";
import type { AppSettings } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "control+shift+Space",
  blurPercent: 10,
  material: "mica",
  exeLabels: {}
};

const appWindow = getCurrentWindow();

function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
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
    document.documentElement.style.setProperty("--blur-fraction", `${blurPercent / 100}`);
  }, [blurPercent]);

  return { settings, setSettings };
}

function DashboardApp() {
  const [activeTab, setActiveTab] = useState<"today" | "week" | "goals" | "settings">("today");
  const { settings, setSettings } = useAppSettings();
  const { baseHeight, baseWidth, containerRef, scale } = useDashboardScale();

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
            {activeTab === "goals" ? <Goals /> : null}
            {activeTab === "settings" ? (
              <Settings settings={settings} onSettingsChange={setSettings} />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  if (appWindow.label === "warn") {
    return <WarnWindow />;
  }

  if (appWindow.label === "annoy") {
    return <AnnoyWindow />;
  }

  return <DashboardApp />;
}
