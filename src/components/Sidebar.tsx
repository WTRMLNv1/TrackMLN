import trackmlnLogo from "../../assets/trackmln.svg";

const tabs = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "goals", label: "Goals" },
  { id: "settings", label: "Settings" }
] as const;

type SidebarProps = {
  activeTab: string;
  onChange: (tab: "today" | "week" | "goals" | "settings") => void;
};

export function Sidebar({ activeTab, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-row">
          <h1>TrackMLN</h1>
        </div>
        <p className="sidebar__studio">A Melogne Studio app.</p>
      </div>

      <nav className="sidebar__nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`sidebar__tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span>Version</span>
        <strong>v1.2.1-snapshot.1</strong>
      </div>
    </aside>
  );
}
