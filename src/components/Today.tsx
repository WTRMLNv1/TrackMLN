import { useState } from "react";
import { useToday } from "../hooks/useToday";
import { formatDuration, formatHour, formatLongDuration } from "../utils/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function Today() {
  const [animateBars, setAnimateBars] = useState(true);
  const { apps, hourly, error, loading } = useToday();
  const total = apps.reduce((sum, app) => sum + app.total, 0);
  const topApp = apps[0] ?? null;

  // Fill all 24 hours so recharts index === hour value.
  // Without this, sparse data from Rust (only active hours)
  // causes the tooltip to map to the wrong hour.
  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    total: hourly.find((e) => e.hour === i)?.total ?? 0
  }));

  return (
    <section className="today-layout">
      <article className="glass-card stats-card">
        <div className="card-header">
          <span className="card-kicker">Today</span>
          <h2>Live Session Snapshot</h2>
        </div>

        <div className="stats-list">
          <div className="stat-row">
            <span>Total screen time</span>
            <strong>{formatLongDuration(total)}</strong>
          </div>
          <div className="stat-row">
            <span>Most used app</span>
            <strong>
              {topApp ? `${topApp.app_name} (${formatDuration(topApp.total)})` : "None yet"}
            </strong>
          </div>
          <div className="stat-row">
            <span>Tracker status</span>
            <strong>{loading ? "Refreshing..." : "Live"}</strong>
          </div>
        </div>

        <p className="card-footnote">
          {error ? error : "Live view based on today's tracked sessions."}
        </p>
      </article>

      <article className="glass-card apps-card">
        <div className="card-header">
          <span className="card-kicker">Apps</span>
          <h2>Most Used Today</h2>
        </div>

        <div className="ranked-list">
          {apps.length === 0 ? (
            <div className="empty-state">No tracked app activity yet.</div>
          ) : (
            apps.map((app, index) => {
              const width = total > 0 ? Math.max(12, (app.total / total) * 100) : 0;
              return (
                <div className="ranked-row" key={app.app_identity}>
                  <span className="ranked-row__index">{index + 1}</span>
                  <span className="ranked-row__name">{app.app_name}</span>
                  <div className="ranked-row__track">
                    <div className="ranked-row__fill" style={{ width: `${width}%` }} />
                  </div>
                  <span className="ranked-row__value">{formatDuration(app.total)}</span>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="glass-card chart-card">
        <div className="card-header">
          <span className="card-kicker">Hourly</span>
          <h2>Usage Through the Day</h2>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={(hour) => formatHour(hour)}
                tick={{ fill: "#b8bec7", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#8b929c", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${Math.round(value / 60)}m`}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  background: "rgba(16, 18, 24, 0.92)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14
                }}
                labelFormatter={(hour) => formatHour(Number(hour))}
                formatter={(value) => [formatDuration(Number(value)), "Usage"]}
              />
              <Bar
                dataKey="total"
                fill="url(#todayBars)"
                radius={[10, 10, 0, 0]}
                isAnimationActive={animateBars}
                animationBegin={0}
                animationDuration={700}
                animationEasing="ease-out"
                onAnimationEnd={() => setAnimateBars(false)}
              />
              <defs>
                <linearGradient id="todayBars" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d9ddd1" />
                  <stop offset="100%" stopColor="#87a2a0" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
