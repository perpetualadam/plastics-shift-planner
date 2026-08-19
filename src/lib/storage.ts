import { toDateKey } from "./rota";

export type AlarmSoundId =
  | "pulse"
  | "radar"
  | "chime"
  | "buzzer"
  | "gentle"
  | "siren";

export type AppSettings = {
  hourlyRate: number;
  overtimeMultiplier: number;
  nightPremium: number;
  currency: string;
  wakeLeadMinutes: number;
  dayWakeLeadMinutes: number;
  nightWakeLeadMinutes: number;
  alarmSound: AlarmSoundId;
  alarmVolume: number;
  remindersEnabled: boolean;
  reminderTimes: string[]; // "17:00", "20:00"
  wakeAlarmsEnabled: boolean;
  shiftName: string;
  plantName: string;
};

export type OvertimeEntry = {
  id: string;
  dateKey: string;
  hours: number;
  note: string;
  rateOverride?: number;
  createdAt: string;
};

export type DayNote = {
  dateKey: string;
  text: string;
};

export type PayAdjustment = {
  id: string;
  dateKey: string;
  label: string;
  amount: number;
};

export type AppData = {
  settings: AppSettings;
  overtime: OvertimeEntry[];
  notes: DayNote[];
  adjustments: PayAdjustment[];
  notificationPermissionAsked: boolean;
  installedHintDismissed: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  hourlyRate: 18.5,
  overtimeMultiplier: 1.5,
  nightPremium: 0,
  currency: "GBP",
  wakeLeadMinutes: 90,
  dayWakeLeadMinutes: 90,
  nightWakeLeadMinutes: 90,
  alarmSound: "pulse",
  alarmVolume: 0.85,
  remindersEnabled: true,
  reminderTimes: ["17:00", "20:00"],
  wakeAlarmsEnabled: true,
  shiftName: "B Shift",
  plantName: "Plastics",
};

const STORAGE_KEY = "plastics-b-shift-planner-v1";

export function loadData(): AppData {
  if (typeof window === "undefined") {
    return {
      settings: DEFAULT_SETTINGS,
      overtime: [],
      notes: [],
      adjustments: [],
      notificationPermissionAsked: false,
      installedHintDismissed: false,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        settings: DEFAULT_SETTINGS,
        overtime: [],
        notes: [],
        adjustments: [],
        notificationPermissionAsked: false,
        installedHintDismissed: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      overtime: parsed.overtime ?? [],
      notes: parsed.notes ?? [],
      adjustments: parsed.adjustments ?? [],
      notificationPermissionAsked: parsed.notificationPermissionAsked ?? false,
      installedHintDismissed: parsed.installedHintDismissed ?? false,
    };
  } catch {
    return {
      settings: DEFAULT_SETTINGS,
      overtime: [],
      notes: [],
      adjustments: [],
      notificationPermissionAsked: false,
      installedHintDismissed: false,
    };
  }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("shift-data-changed"));
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getNote(data: AppData, date: Date): string {
  const key = toDateKey(date);
  return data.notes.find((n) => n.dateKey === key)?.text ?? "";
}

export function setNote(data: AppData, date: Date, text: string): AppData {
  const key = toDateKey(date);
  const notes = data.notes.filter((n) => n.dateKey !== key);
  if (text.trim()) notes.push({ dateKey: key, text: text.trim() });
  return { ...data, notes };
}

export function overtimeForMonth(
  data: AppData,
  year: number,
  month: number,
): OvertimeEntry[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return data.overtime.filter((o) => o.dateKey.startsWith(prefix));
}

export function exportBackup(data: AppData): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importBackup(json: string): AppData {
  const parsed = JSON.parse(json) as { data?: AppData } | AppData;
  const data = "data" in parsed && parsed.data ? parsed.data : (parsed as AppData);
  return {
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    overtime: data.overtime ?? [],
    notes: data.notes ?? [],
    adjustments: data.adjustments ?? [],
    notificationPermissionAsked: data.notificationPermissionAsked ?? false,
    installedHintDismissed: data.installedHintDismissed ?? false,
  };
}
