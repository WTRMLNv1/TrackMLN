import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WeekData } from "../types";

export function useWeek() {
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = () => {
      invoke<WeekData>("get_week_dashboard")
        .then((response) => {
          setData(response);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError(String(err));
          setLoading(false);
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, []);

  return { data, error, loading };
}
