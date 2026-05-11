export type AppTotal = {
  app_name: string;
  total: number;
};

export type AppSettings = {
  hotkey: string;
  blurPercent: number;
};

export type HourlyData = {
  hour: number;
  total: number;
};

export type WeekDay = {
  date: string;
  total: number;
  apps: AppTotal[];
};

export type WeekData = {
  days: WeekDay[];
  apps: AppTotal[];
  week_total: number;
  current_week_average: number;
  previous_week_average: number;
  top_app: AppTotal | null;
};
