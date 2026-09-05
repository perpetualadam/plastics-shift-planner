import { toDateKey } from "./rota";
import {
  DEFAULT_CYCLE,
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  isRotaSource,
  sanitizeCycle,
  sanitizeShiftTemplate,
  type CycleConfig,
  type RotaSource,
  type ShiftTemplate,
} from "./shiftConfig";
import {
  finiteNumber,
  hoursBetween as clockHoursBetween,
  isValidHhmm,
  sanitizeCurrency,
  sanitizeHhmm,
  sanitizeLiveText,
} from "./time";

export type { CycleConfig, PrepStep, RotaSource, ShiftTemplate } from "./shiftConfig";

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
  /** Editable wake clock times (HH:MM). Kept in sync with day/night templates. */
  dayWakeTime: string;
  nightWakeTime: string;
  /** First rota day that counts for pay (YYYY-MM-DD). */
  workStartDate: string;
  /** Clock hours on site per shift (fallback when template times are invalid). */
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
  /** Day-shift times, label, and prep checklist. */
  dayShift: ShiftTemplate;
  /** Night-shift times, label, and prep checklist. */
  nightShift: ShiftTemplate;
  /** Which calendar fills working days: baked CSV, repeating cycle, or blank. */
  rotaSource: RotaSource;
  cycle: CycleConfig;
  /** Monthly attendance bonus. Set amount to 0 or disable if your workplace has none. */
  attendanceBonusEnabled: boolean;
  attendanceBonusAmount: number;
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

/** Per-day override of the baked CSV rota (day / night / off). */
export type RotaOverride = {
  kind: "day" | "night" | "off";
};

export type RotaOverrides = Record<string, RotaOverride>;

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

/** Reasons that can void the monthly attendance bonus. */
export type AttendanceBonusLossReason =
  | "late"
  | "clock_out_early"
  | "absence"
  | "other";

export type AttendanceBonusLossStatus = "active" | "expired";

export type AttendanceBonusLoss = {
  id: string;
  /** Calendar month this loss applies to, e.g. "2026-08". */
  monthKey: string;
  reason: AttendanceBonusLossReason;
  /** Optional date of the incident (YYYY-MM-DD). */
  dateKey?: string;
  note?: string;
  /** Active losses void the bonus; expired ones are kept for history only. */
  status: AttendanceBonusLossStatus;
  createdAt: string;
};

/** Default monthly attendance bonus when settings omit an amount. */
export const ATTENDANCE_BONUS_AMOUNT = 200;

const ALARM_SOUNDS: AlarmSoundId[] = [
  "pulse",
  "radar",
  "chime",
  "buzzer",
  "gentle",
  "siren",
];

export const ATTENDANCE_BONUS_REASON_OPTIONS: {
  id: AttendanceBonusLossReason;
  label: string;
}[] = [
  { id: "late", label: "Late" },
  { id: "clock_out_early", label: "Clock out early" },
  { id: "absence", label: "Absence" },
  { id: "other", label: "Other" },
];

export function attendanceBonusReasonLabel(reason: AttendanceBonusLossReason): string {
  return ATTENDANCE_BONUS_REASON_OPTIONS.find((o) => o.id === reason)?.label ?? reason;
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export type AppData = {
  settings: AppSettings;
  overtime: OvertimeEntry[];
  notes: DayNote[];
  adjustments: PayAdjustment[];
  extraWork: ExtraWorkEntry[];
  attendanceBonusLosses: AttendanceBonusLoss[];
  /** Local edits on top of the CSV rota, keyed by YYYY-MM-DD. */
  rotaOverrides: RotaOverrides;
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
  dayShift: {
    ...DEFAULT_DAY_SHIFT,
    prepSteps: DEFAULT_DAY_SHIFT.prepSteps.map((s) => ({ ...s })),
  },
  nightShift: {
    ...DEFAULT_NIGHT_SHIFT,
    prepSteps: DEFAULT_NIGHT_SHIFT.prepSteps.map((s) => ({ ...s })),
  },
  rotaSource: "csv",
  cycle: { ...DEFAULT_CYCLE, sequence: [...DEFAULT_CYCLE.sequence] },
  attendanceBonusEnabled: true,
  attendanceBonusAmount: ATTENDANCE_BONUS_AMOUNT,
};

function cloneTemplate(template: ShiftTemplate): ShiftTemplate {
  return { ...template, prepSteps: template.prepSteps.map((s) => ({ ...s })) };
}

function sanitizeReminderTimes(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : DEFAULT_SETTINGS.reminderTimes;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of source) {
    if (!isValidHhmm(item)) continue;
    const time = sanitizeHhmm(item);
    if (seen.has(time)) continue;
    seen.add(time);
    out.push(time);
    if (out.length >= 8) break;
  }
  return out.length > 0 ? out.sort() : [...DEFAULT_SETTINGS.reminderTimes];
}

function sanitizeWorkStartDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return DEFAULT_SETTINGS.workStartDate;
}

export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const incoming = raw && typeof raw === "object" ? raw : {};
  const dayShift = sanitizeShiftTemplate(incoming.dayShift, DEFAULT_DAY_SHIFT);
  const nightShift = sanitizeShiftTemplate(incoming.nightShift, DEFAULT_NIGHT_SHIFT);

  const dayWakeTime = isValidHhmm(incoming.dayWakeTime)
    ? sanitizeHhmm(incoming.dayWakeTime)
    : dayShift.wakeTime;
  const nightWakeTime = isValidHhmm(incoming.nightWakeTime)
    ? sanitizeHhmm(incoming.nightWakeTime)
    : nightShift.wakeTime;

  dayShift.wakeTime = dayWakeTime;
  nightShift.wakeTime = nightWakeTime;

  const alarmSound = ALARM_SOUNDS.includes(incoming.alarmSound as AlarmSoundId)
    ? (incoming.alarmSound as AlarmSoundId)
    : DEFAULT_SETTINGS.alarmSound;

  const shiftClockHours = finiteNumber(incoming.shiftClockHours, 12, 0.25, 24);
  const paidHoursPerShift = finiteNumber(
    incoming.paidHoursPerShift,
    DEFAULT_SETTINGS.paidHoursPerShift,
    0,
    24,
  );

  return {
    hourlyRate: finiteNumber(incoming.hourlyRate, DEFAULT_SETTINGS.hourlyRate, 0, 10_000),
    overtimeMultiplier: finiteNumber(
      incoming.overtimeMultiplier,
      DEFAULT_SETTINGS.overtimeMultiplier,
      1,
      10,
    ),
    nightPremium: finiteNumber(incoming.nightPremium, DEFAULT_SETTINGS.nightPremium, 0, 10_000),
    currency: sanitizeCurrency(incoming.currency, DEFAULT_SETTINGS.currency),
    wakeLeadMinutes: finiteNumber(incoming.wakeLeadMinutes, 71, 0, 24 * 60),
    dayWakeLeadMinutes: finiteNumber(incoming.dayWakeLeadMinutes, 71, 0, 24 * 60),
    nightWakeLeadMinutes: finiteNumber(incoming.nightWakeLeadMinutes, 71, 0, 24 * 60),
    dayWakeTime,
    nightWakeTime,
    workStartDate: sanitizeWorkStartDate(incoming.workStartDate),
    shiftClockHours,
    paidHoursPerShift: Math.min(paidHoursPerShift, shiftClockHours),
    breakMinutes: finiteNumber(incoming.breakMinutes, 30, 0, 240),
    breakPaid: incoming.breakPaid === true,
    alarmSound,
    alarmVolume: finiteNumber(incoming.alarmVolume, 0.85, 0.05, 1),
    remindersEnabled: incoming.remindersEnabled !== false,
    reminderTimes: sanitizeReminderTimes(incoming.reminderTimes),
    wakeAlarmsEnabled: incoming.wakeAlarmsEnabled !== false,
    shiftName: sanitizeLiveText(incoming.shiftName, 48, DEFAULT_SETTINGS.shiftName),
    plantName: sanitizeLiveText(incoming.plantName, 48, DEFAULT_SETTINGS.plantName),
    dayShift,
    nightShift,
    rotaSource: isRotaSource(incoming.rotaSource) ? incoming.rotaSource : "csv",
    cycle: sanitizeCycle(incoming.cycle),
    attendanceBonusEnabled: incoming.attendanceBonusEnabled !== false,
    attendanceBonusAmount: finiteNumber(
      incoming.attendanceBonusAmount,
      ATTENDANCE_BONUS_AMOUNT,
      0,
      100_000,
    ),
  };
}

export function attendanceBonusAmountOf(settings: {
  attendanceBonusEnabled?: boolean;
  attendanceBonusAmount?: number;
}): number {
  if (settings.attendanceBonusEnabled === false) return 0;
  const n = Number(settings.attendanceBonusAmount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function cloneDefaultSettings(): AppSettings {
  const s = normalizeSettings(DEFAULT_SETTINGS);
  return {
    ...s,
    dayShift: cloneTemplate(s.dayShift),
    nightShift: cloneTemplate(s.nightShift),
    cycle: { ...s.cycle, sequence: [...s.cycle.sequence] },
    reminderTimes: [...s.reminderTimes],
  };
}

export const CSV_DEFAULT_WAKE = {
  day: "04:49",
  night: "16:49",
} as const;

/**
 * Payable induction / training — Mon 18 Aug 2026, 09:00–18:00 (9h).
 * Not on the B-shift CSV rota; first CSV shift is still Thu 20 Aug.
 */
export const DEFAULT_EXTRA_WORK: ExtraWorkEntry[] = [
  {
    id: "induction-2026-08-18",
    dateKey: "2026-08-18",
    label: "Induction / training",
    start: "09:00",
    end: "18:00",
    clockHours: 9,
    paidHours: 9,
    note: "Induction and training 09:00–18:00",
  },
];

function hoursBetween(start: string, end: string): number {
  return clockHoursBetween(start, end);
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

function normalizeRotaOverrides(raw: unknown): RotaOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: RotaOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const kind =
      value && typeof value === "object" && "kind" in value
        ? (value as { kind?: string }).kind
        : typeof value === "string"
          ? value
          : null;
    if (kind === "day" || kind === "night" || kind === "off") {
      out[key] = { kind };
    }
  }
  return out;
}

function emptyData(): AppData {
  return {
    settings: cloneDefaultSettings(),
    overtime: [],
    notes: [],
    adjustments: [],
    extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
    attendanceBonusLosses: [],
    rotaOverrides: {},
    notificationPermissionAsked: false,
    installedHintDismissed: false,
  };
}

function normalizeLoss(raw: Partial<AttendanceBonusLoss>): AttendanceBonusLoss | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.monthKey !== "string") return null;
  const reason = (raw.reason ?? "other") as AttendanceBonusLossReason;
  const status: AttendanceBonusLossStatus = raw.status === "expired" ? "expired" : "active";
  return {
    id: raw.id,
    monthKey: raw.monthKey,
    reason: ATTENDANCE_BONUS_REASON_OPTIONS.some((o) => o.id === reason) ? reason : "other",
    dateKey: typeof raw.dateKey === "string" ? raw.dateKey : undefined,
    note: typeof raw.note === "string" ? raw.note : undefined,
    status,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeData(parsed: Partial<AppData>): AppData {
  const losses = (parsed.attendanceBonusLosses ?? [])
    .map((l) => normalizeLoss(l as Partial<AttendanceBonusLoss>))
    .filter((l): l is AttendanceBonusLoss => l !== null);

  const hasExtraKey = Object.prototype.hasOwnProperty.call(parsed, "extraWork");
  const stored = parsed.extraWork ?? [];
  // Fresh installs, or installs emptied by the mistaken wipe → seed induction extra day
  const extraWork =
    !hasExtraKey || stored.length === 0
      ? DEFAULT_EXTRA_WORK.map((e) => ({ ...e }))
      : stored;

  return {
    settings: normalizeSettings(parsed.settings),
    overtime: Array.isArray(parsed.overtime) ? parsed.overtime : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    extraWork,
    attendanceBonusLosses: losses,
    rotaOverrides: normalizeRotaOverrides(parsed.rotaOverrides),
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

export function attendanceBonusLossesForMonth(
  data: AppData,
  year: number,
  month: number,
): AttendanceBonusLoss[] {
  const key = monthKeyFromParts(year, month);
  return (data.attendanceBonusLosses ?? [])
    .filter((l) => l.monthKey === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** True when any active loss voids the £200 bonus for that month. */
export function hasActiveAttendanceBonusLoss(
  data: AppData,
  year: number,
  month: number,
): boolean {
  const key = monthKeyFromParts(year, month);
  return (data.attendanceBonusLosses ?? []).some(
    (l) => l.monthKey === key && l.status === "active",
  );
}

export function exportBackup(data: AppData): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importBackup(json: string): AppData {
  const parsed = JSON.parse(json) as { data?: AppData } | AppData;
  const data = "data" in parsed && parsed.data ? parsed.data : (parsed as AppData);
  return normalizeData(data);
}
