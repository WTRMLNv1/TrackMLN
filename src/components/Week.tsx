import { useState } from "react";
import { useWeek } from "../hooks/useWeek";
import { formatDayLabel, formatDuration, formatLongDuration } from "../utils/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function Week() {
  const [animateBars, setAnimateBars] = useState(true);
  const { data, error, loading } = useWeek();

  if (!data) {
    return (
      <section className="week-layout">
        <article className="glass-card week-summary-card">
          <div className="empty-state">{loading ? "Loading weekly data..." : error ?? "No weekly data yet."}</div>
        </article>
      </section>
    );
  }

  const dayChartData = data.days.map((day) => ({
    ...day,
    label: formatDayLabel(day.date),
    avgThis: Math.round(data.current_week_average),
    avgLast: Math.round(data.previous_week_average)
  }));
  const selectedDay = data.days[data.days.length - 1] ?? null;

  return (
    <section className="week-layout">
      <article className="glass-card week-summary-card">
        <div className="card-header">
          <span className="card-kicker">Week</span>
          <h2>Weekly Snapshot</h2>
        </div>

        <div className="stats-list">
          <div className="stat-row">
            <span>Total screen time</span>
            <strong>{formatLongDuration(data.week_total)}</strong>
          </div>
          <div className="stat-row">
            <span>Most used app</span>
            <strong>
              {data.top_app ? `${data.top_app.app_name} (${formatDuration(data.top_app.total)})` : "None"}
            </strong>
          </div>
        </div>
      </article>

      <article className="glass-card week-apps-card">
        <div className="card-header">
          <span className="card-kicker">Apps</span>
          <h2>Most Used This Week</h2>
        </div>

        <div className="ranked-list">
          {data.apps.length === 0 ? (
            <div className="empty-state">No weekly app activity yet.</div>
          ) : (
            data.apps.map((app, index) => {
              const width =
                data.week_total > 0 ? Math.max(12, (app.total / data.week_total) * 100) : 0;
              return (
                <div className="ranked-row ranked-row--week" key={app.app_name}>
                  <span className="ranked-row__index">{index + 1}</span>
                  <span className="ranked-row__name">{app.app_name}</span>
                  <div className="ranked-row__track">
                    <div className="ranked-row__fill ranked-row__fill--week" style={{ width: `${width}%` }} />
                  </div>
                  <span className="ranked-row__value">{formatDuration(app.total)}</span>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="glass-card week-chart-card">
        <div className="card-header">
          <span className="card-kicker">Trend</span>
          <h2>Daily Usage vs Averages</h2>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayChartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#c5cad3", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8b929c", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${Math.round(value / 3600)}h`}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  background: "rgba(16, 18, 24, 0.92)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14
                }}
                formatter={(value, name) => [
                  formatDuration(Number(value)),
                  String(name) === "total"
                    ? "Day total"
                    : String(name) === "avgThis"
                      ? "This week avg"
                      : "Last week avg"
                ]}
              />
              <Bar
                dataKey="total"
                fill="url(#weekBars)"
                radius={[12, 12, 0, 0]}
                isAnimationActive={animateBars}
                animationBegin={0}
                animationDuration={700}
                animationEasing="ease-out"
                onAnimationEnd={() => setAnimateBars(false)}
              />
              <Line dataKey="avgThis" stroke="#d88e9d" dot={false} strokeWidth={2} />
              <Line dataKey="avgLast" stroke="#bfd3bf" dot={false} strokeWidth={2} />
              <defs>
                <linearGradient id="weekBars" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d6c7a6" />
                  <stop offset="100%" stopColor="#89a785" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="glass-card week-distribution-card">
        <div className="card-header">
          <span className="card-kicker">Distribution</span>
          <h2>{selectedDay ? `Apps on ${formatDayLabel(selectedDay.date)}` : "Selected Day"}</h2>
        </div>

        <div className="distribution-list">
          {selectedDay && selectedDay.apps.length > 0 ? (
            selectedDay.apps.map((app, index) => {
              const width =
                selectedDay.total > 0 ? Math.max(8, (app.total / selectedDay.total) * 100) : 0;
              return (
                <div className="distribution-row" key={`${selectedDay.date}-${app.app_name}`}>
                  <div className="distribution-row__label">
                    <span
                      className="distribution-row__dot"
                      style={{ background: distributionColors[index % distributionColors.length] }}
                    />
                    <span>{app.app_name}</span>
                  </div>
                  <div className="distribution-row__track">
                    <div
                      className="distribution-row__fill"
                      style={{
                        width: `${width}%`,
                        background: distributionColors[index % distributionColors.length]
                      }}
                    />
                  </div>
                  <span className="distribution-row__value">{formatDuration(app.total)}</span>
                </div>
              );
            })
          ) : (
            <div className="empty-state">No app usage logged for the selected day.</div>
          )}
        </div>
      </article>
    </section>
  );
}

const distributionColors = [
  "#d5bc96",
  "#c88e98",
  "#84b8d2",
  "#86b46f",
  "#d0bc56",
  "#9c70b6"
];
