export type AppTotal = {
  app_identity: string;
  app_name: string;
  total: number;
};

export type AppSettings = {
  hotkey: string;
  blurPercent: number;
  material: "mica" | "liquid";
  exeLabels: Record<string, string>;
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
