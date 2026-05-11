import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppTotal, HourlyData } from "../types";

export function useToday() {
  const [apps, setApps] = useState<AppTotal[]>([]);
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = async () => {
      const [nextApps, nextHourly] = await Promise.all([
        invoke<AppTotal[]>("get_today_totals"),
        invoke<HourlyData[]>("get_hourly_today")
      ]);

      setApps(nextApps);
      setHourly(nextHourly);
      setError(null);
      setLoading(false);
    };

    refresh().catch((err) => {
      console.error(err);
      setError(String(err));
      setLoading(false);
    });
    const interval = window.setInterval(() => {
      refresh().catch((err) => {
        console.error(err);
        setError(String(err));
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return { apps, hourly, error, loading };
}
