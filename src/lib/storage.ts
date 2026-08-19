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
  /** Editable wake clock times (HH:MM). Defaults match CSV dog-feed alarms. */
  dayWakeTime: string;
  nightWakeTime: string;
  /** First real shift (excludes induction / earlier CSV days from pay). */
  workStartDate: string;
  /** Clock hours on site per shift (usually 12). */
  shiftClockHours: number;
  /** Hours paid per shift (editable; unpaid break = clock − paid). */
  paidHoursPerShift: number;
  /** Break length per shift in minutes (meal / rest). */
  breakMinutes: number;
  /** When false, break time is unpaid and deducted from paid hours. */
  breakPaid: boolean;
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

export type ExtraWorkEntry = {
  id: string;
  dateKey: string;
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM
  /** Clock hours on site; if omitted, derived from start/end. */
  clockHours?: number;
  /** Paid hours; defaults to clock hours (fully payable). */
  paidHours?: number;
  note?: string;
};

export type AppData = {
  settings: AppSettings;
  overtime: OvertimeEntry[];
  notes: DayNote[];
  adjustments: PayAdjustment[];
  extraWork: ExtraWorkEntry[];
  notificationPermissionAsked: boolean;
  installedHintDismissed: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  hourlyRate: 18.5,
  overtimeMultiplier: 1.5,
  nightPremium: 0,
  currency: "GBP",
  wakeLeadMinutes: 71,
  dayWakeLeadMinutes: 71,
  nightWakeLeadMinutes: 71,
  dayWakeTime: "04:49",
  nightWakeTime: "16:49",
  workStartDate: "2026-08-20",
  shiftClockHours: 12,
  paidHoursPerShift: 11.5,
  breakMinutes: 30,
  breakPaid: false,
  alarmSound: "pulse",
  alarmVolume: 0.85,
  remindersEnabled: true,
  reminderTimes: ["17:00", "20:00"],
  wakeAlarmsEnabled: true,
  shiftName: "B Shift",
  plantName: "Plastics",
};

export const CSV_DEFAULT_WAKE = {
  day: "04:49",
  night: "16:49",
} as const;

/** Default payable induction — 18 Aug 2026, 09:00–18:00 (9h). */
export const DEFAULT_EXTRA_WORK: ExtraWorkEntry[] = [
  {
    id: "induction-2026-08-18",
    dateKey: "2026-08-18",
    label: "Induction",
    start: "09:00",
    end: "18:00",
    clockHours: 9,
    paidHours: 9,
    note: "Payable induction day",
  },
];

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

export function extraWorkClockHours(entry: ExtraWorkEntry): number {
  if (typeof entry.clockHours === "number" && Number.isFinite(entry.clockHours)) {
    return Math.max(0, entry.clockHours);
  }
  return hoursBetween(entry.start, entry.end);
}

export function extraWorkPaidHours(entry: ExtraWorkEntry): number {
  if (typeof entry.paidHours === "number" && Number.isFinite(entry.paidHours)) {
    return Math.max(0, entry.paidHours);
  }
  return extraWorkClockHours(entry);
}

function emptyData(): AppData {
  return {
    settings: DEFAULT_SETTINGS,
    overtime: [],
    notes: [],
    adjustments: [],
    extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
    notificationPermissionAsked: false,
    installedHintDismissed: false,
  };
}

function normalizeData(parsed: Partial<AppData>): AppData {
  const hasExtraKey = Object.prototype.hasOwnProperty.call(parsed, "extraWork");
  return {
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    overtime: parsed.overtime ?? [],
    notes: parsed.notes ?? [],
    adjustments: parsed.adjustments ?? [],
    // Seed induction only when older installs never had this field
    extraWork: hasExtraKey
      ? (parsed.extraWork ?? [])
      : DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
    notificationPermissionAsked: parsed.notificationPermissionAsked ?? false,
    installedHintDismissed: parsed.installedHintDismissed ?? false,
  };
}

const STORAGE_KEY = "plastics-b-shift-planner-v1";

export function loadData(): AppData {
  if (typeof window === "undefined") {
    return emptyData();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return normalizeData(parsed);
  } catch {
    return emptyData();
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
  return normalizeData(data);
}
