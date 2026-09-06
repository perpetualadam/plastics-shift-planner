/** Rota resolution — CSV, repeating cycle, or blank calendar, with local overrides. */

import { ROTA_BY_DATE, type RotaEntry } from "./rotaData";
import {
  DEFAULT_AFTERS_SHIFT,
  DEFAULT_CYCLE,
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  clockHoursFromTemplate,
  kindLabel,
  templateForKind,
  type CycleConfig,
  type PrepStep,
  type RotaSource,
  type ShiftKind,
  type ShiftTemplate,
  type ShiftTemplates,
  type WorkingShiftKind,
} from "./shiftConfig";
import { applyHhmm, formatTimeRange, hoursBetween, sanitizeHhmm } from "./time";
import type { RotaOverrides } from "./storage";

export type { ShiftKind, WorkingShiftKind } from "./shiftConfig";

export type ShiftDay = {
  date: Date;
  kind: ShiftKind;
  /** Position within the legacy 7-day cycle label (kept for UI compatibility) */
  cycleDay: number;
  label: string;
  startHour: number | null;
  endHour: number | null;
  hours: number;
  /** Exact HH:MM when this is a working day */
  entry?: RotaEntry;
  /** True when localStorage override differs from the base schedule for this date */
  overridden?: boolean;
};

/** Settings slice used to resolve kinds and times. Optional everywhere — defaults match the baked CSV. */
export type RotaSettings = {
  dayShift?: ShiftTemplate;
  aftersShift?: ShiftTemplate;
  nightShift?: ShiftTemplate;
  rotaSource?: RotaSource;
  cycle?: CycleConfig;
  dayWakeTime?: string;
  aftersWakeTime?: string;
  nightWakeTime?: string;
  shiftClockHours?: number;
};

export const CYCLE_ANCHOR = new Date(2026, 0, 3);
export const CYCLE_LENGTH = 7;
export const DAY_SHIFT_HOURS = 12;
export const NIGHT_SHIFT_HOURS = 12;
export const SHIFT_NAME = "B Shift";

const DEFAULT_WARNINGS = ["17:00", "20:00"];

function dayTemplate(settings?: RotaSettings): ShiftTemplate {
  return settings?.dayShift ?? DEFAULT_DAY_SHIFT;
}

function aftersTemplate(settings?: RotaSettings): ShiftTemplate {
  return settings?.aftersShift ?? DEFAULT_AFTERS_SHIFT;
}

function nightTemplate(settings?: RotaSettings): ShiftTemplate {
  return settings?.nightShift ?? DEFAULT_NIGHT_SHIFT;
}

function templates(settings?: RotaSettings): ShiftTemplates {
  const day = { ...dayTemplate(settings) };
  const afters = { ...aftersTemplate(settings) };
  const night = { ...nightTemplate(settings) };
  if (settings?.dayWakeTime) day.wakeTime = sanitizeHhmm(settings.dayWakeTime, day.wakeTime);
  if (settings?.aftersWakeTime) afters.wakeTime = sanitizeHhmm(settings.aftersWakeTime, afters.wakeTime);
  if (settings?.nightWakeTime) night.wakeTime = sanitizeHhmm(settings.nightWakeTime, night.wakeTime);
  return { day, afters, night };
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const year = Number.isFinite(y) ? y : 1970;
  const month = Number.isFinite(m) ? m : 1;
  const day = Number.isFinite(d) ? d : 1;
  return new Date(year, month - 1, day);
}

function parseHour(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const [h] = sanitizeHhmm(hhmm, "").split(":").map(Number);
  return Number.isFinite(h) ? h : null;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function getCycleKind(date: Date, cycle?: CycleConfig): ShiftKind {
  const cfg = cycle ?? DEFAULT_CYCLE;
  const sequence = (cfg.sequence ?? []).filter(
    (k): k is ShiftKind => k === "day" || k === "afters" || k === "night" || k === "off",
  );
  if (sequence.length === 0) return "off";
  const anchor = parseDateKey(cfg.anchorDate || DEFAULT_CYCLE.anchorDate);
  const offset = daysBetween(anchor, date);
  const idx = ((offset % sequence.length) + sequence.length) % sequence.length;
  return sequence[idx];
}

/** Baked CSV kind only (ignores local edits and other rota sources). */
export function getCsvKind(date: Date): ShiftKind {
  const entry = ROTA_BY_DATE[toDateKey(date)];
  return entry?.kind ?? "off";
}

/** Kind from the selected rota source, before per-day overrides. */
export function getBaseKind(date: Date, settings?: RotaSettings): ShiftKind {
  const source = settings?.rotaSource ?? "csv";
  if (source === "manual") return "off";
  if (source === "cycle") return getCycleKind(date, settings?.cycle);
  return getCsvKind(date);
}

export function isRotaOverridden(date: Date, overrides?: RotaOverrides): boolean {
  return Boolean(overrides?.[toDateKey(date)]);
}

const KIND_CLOCK: Record<WorkingShiftKind, { start: string; end: string; wake: string }> = {
  day: { start: "06:00", end: "18:00", wake: "04:49" },
  afters: { start: "14:00", end: "22:00", wake: "12:49" },
  night: { start: "18:00", end: "06:00", wake: "16:49" },
};

function entryFromTemplate(
  dateKey: string,
  kind: WorkingShiftKind,
  template: ShiftTemplate,
): RotaEntry {
  const steps = template.prepSteps ?? [];
  const clock = KIND_CLOCK[kind];
  const wake = sanitizeHhmm(template.wakeTime, clock.wake);
  return {
    date: dateKey,
    kind,
    start: sanitizeHhmm(template.start, clock.start),
    end: sanitizeHhmm(template.end, clock.end),
    previousDayWarnings: [...DEFAULT_WARNINGS],
    morningDogFeed: kind === "day" ? wake : null,
    afternoonDogFeed: kind === "day" ? null : wake,
    getDressed: steps[1]?.time ?? null,
    leaveForWork: steps[2]?.time ?? null,
    targetArrival: steps[3]?.time ?? null,
  };
}

/** Default day/afters/night template used when adding a shift that is not in the CSV. */
export function makeDefaultRotaEntry(
  dateKey: string,
  kind: WorkingShiftKind,
  settings?: RotaSettings,
): RotaEntry {
  const t = templates(settings);
  return entryFromTemplate(dateKey, kind, templateForKind(kind, t));
}

function overlayTemplate(entry: RotaEntry, template: ShiftTemplate): RotaEntry {
  const generated = entryFromTemplate(entry.date, entry.kind, template);
  return {
    ...entry,
    start: generated.start,
    end: generated.end,
    morningDogFeed: generated.morningDogFeed,
    afternoonDogFeed: generated.afternoonDogFeed,
    getDressed: generated.getDressed,
    leaveForWork: generated.leaveForWork,
    targetArrival: generated.targetArrival,
  };
}

export function getRotaEntry(
  date: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): RotaEntry | undefined {
  const key = toDateKey(date);
  const override = overrides?.[key];
  const baseKind = getBaseKind(date, settings);
  const kind: ShiftKind = override?.kind ?? baseKind;
  if (kind === "off") return undefined;

  const t = templates(settings);
  const template = templateForKind(kind, t);
  const csv = ROTA_BY_DATE[key];
  if (csv && csv.kind === kind && (settings?.rotaSource ?? "csv") === "csv") {
    return overlayTemplate(csv, template);
  }
  return makeDefaultRotaEntry(key, kind, settings);
}

/** Legacy helper — CSV schedule is not a fixed 7-day cycle. */
export function getCycleDay(date: Date, overrides?: RotaOverrides, settings?: RotaSettings): number {
  const entry = getRotaEntry(date, overrides, settings);
  if (!entry) return 4;
  return entry.kind === "day" ? 0 : entry.kind === "afters" ? 1 : 2;
}

export function getShiftForDate(
  date: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): ShiftDay {
  const day = startOfLocalDay(date);
  const entry = getRotaEntry(day, overrides, settings);
  const overridden = isRotaOverridden(day, overrides);
  const t = templates(settings);
  const fallbackClock = Number(settings?.shiftClockHours);
  const clockFallback = Number.isFinite(fallbackClock) && fallbackClock > 0 ? fallbackClock : 12;

  if (!entry) {
    return {
      date: day,
      kind: "off",
      cycleDay: 4,
      label: "Off",
      startHour: null,
      endHour: null,
      hours: 0,
      overridden,
    };
  }

  const template = templateForKind(entry.kind, t);
  const hours = hoursBetween(entry.start, entry.end) || clockHoursFromTemplate(template, clockFallback);
  const cycleDay = entry.kind === "day" ? 0 : entry.kind === "afters" ? 1 : 2;
  const fallbackStart = parseHour(KIND_CLOCK[entry.kind].start) ?? 6;
  const fallbackEnd = parseHour(KIND_CLOCK[entry.kind].end) ?? 18;

  return {
    date: day,
    kind: entry.kind,
    cycleDay,
    label: template.label || kindLabel(entry.kind),
    startHour: parseHour(entry.start) ?? fallbackStart,
    endHour: parseHour(entry.end) ?? fallbackEnd,
    hours,
    entry,
    overridden,
  };
}

export function formatShiftTime(shift: ShiftDay): string {
  if (shift.kind === "off") return "Rest day";
  if (shift.entry?.start && shift.entry?.end) {
    return formatTimeRange(shift.entry.start, shift.entry.end);
  }
  if (shift.kind === "day") return "06:00 – 18:00";
  if (shift.kind === "afters") return "14:00 – 22:00";
  if (shift.kind === "night") return "18:00 – 06:00";
  return "Rest day";
}

export function getShiftStart(
  date: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): Date | null {
  const shift = getShiftForDate(date, overrides, settings);
  if (shift.kind === "off" || shift.startHour === null) return null;
  const hhmm = shift.entry?.start ?? `${shift.startHour}:00`;
  return applyHhmm(startOfLocalDay(date), hhmm);
}

export function getShiftEnd(
  date: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): Date | null {
  const shift = getShiftForDate(date, overrides, settings);
  if (shift.kind === "off") return null;
  const start = getShiftStart(date, overrides, settings);
  const hhmm = shift.entry?.end ?? (shift.endHour !== null ? `${shift.endHour}:00` : "18:00");
  const end = applyHhmm(startOfLocalDay(date), hhmm);
  if (start && end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

/** Resolve wake time: editable HH:MM override, else template/CSV wake, else lead minutes. */
export function getWakeTime(
  date: Date,
  leadMinutes: number,
  wakeTimeOverride?: string | null,
  rotaOverrides?: RotaOverrides,
  settings?: RotaSettings,
): Date | null {
  const entry = getRotaEntry(date, rotaOverrides, settings);
  if (!entry && !wakeTimeOverride) return null;

  const csvWake =
    entry?.kind === "day"
      ? entry.morningDogFeed
      : entry?.kind === "afters" || entry?.kind === "night"
        ? entry.afternoonDogFeed
        : null;

  const wakeHhmm = (wakeTimeOverride?.trim() || csvWake || "").trim();
  if (wakeHhmm) {
    const wake = applyHhmm(startOfLocalDay(date), wakeHhmm);
    return Number.isNaN(wake.getTime()) ? null : wake;
  }

  const start = getShiftStart(date, rotaOverrides, settings);
  if (!start) return null;
  const lead = Number.isFinite(leadMinutes) ? leadMinutes : 0;
  return new Date(start.getTime() - Math.max(0, lead) * 60 * 1000);
}

export function getPrepTimes(
  date: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): {
  dogFeed: string | null;
  getDressed: string | null;
  leaveForWork: string | null;
  targetArrival: string | null;
  previousDayWarnings: string[];
  steps: PrepStep[];
} | null {
  const entry = getRotaEntry(date, overrides, settings);
  if (!entry) return null;
  const t = templates(settings);
  const template = templateForKind(entry.kind, t);
  const steps = (template.prepSteps ?? []).filter((s) => s.label && s.time);
  return {
    dogFeed: entry.kind === "day" ? entry.morningDogFeed : entry.afternoonDogFeed,
    getDressed: entry.getDressed,
    leaveForWork: entry.leaveForWork,
    targetArrival: entry.targetArrival,
    previousDayWarnings: entry.previousDayWarnings,
    steps,
  };
}

export function getMonthShifts(
  year: number,
  month: number,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): ShiftDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: ShiftDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(getShiftForDate(new Date(year, month, d), overrides, settings));
  }
  return out;
}

export function getUpcomingShifts(
  from: Date,
  count: number,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): ShiftDay[] {
  const out: ShiftDay[] = [];
  let cursor = startOfLocalDay(from);
  let guard = 0;
  const safeCount = Number.isFinite(count) ? Math.min(Math.max(0, count), 60) : 6;
  while (out.length < safeCount && guard < 400) {
    const shift = getShiftForDate(cursor, overrides, settings);
    if (shift.kind !== "off") out.push(shift);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    guard++;
  }
  return out;
}

export function getNextWorkingShift(
  from: Date = new Date(),
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): ShiftDay | null {
  const now = from;
  let cursor = startOfLocalDay(now);
  for (let i = 0; i < 20; i++) {
    const shift = getShiftForDate(cursor, overrides, settings);
    if (shift.kind !== "off") {
      const start = getShiftStart(cursor, overrides, settings);
      const end = getShiftEnd(cursor, overrides, settings);
      if (start && start.getTime() > now.getTime()) return shift;
      if (i === 0 && start && end && now.getTime() < end.getTime()) return shift;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return null;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function countWorkDaysInRange(
  start: Date,
  end: Date,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): { days: number; afters: number; nights: number; off: number; hours: number } {
  let days = 0;
  let afters = 0;
  let nights = 0;
  let off = 0;
  let hours = 0;
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  if (cursor.getTime() > last.getTime()) return { days, afters, nights, off, hours };
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 800) {
    const s = getShiftForDate(cursor, overrides, settings);
    if (s.kind === "day") {
      days++;
      hours += s.hours;
    } else if (s.kind === "afters") {
      afters++;
      hours += s.hours;
    } else if (s.kind === "night") {
      nights++;
      hours += s.hours;
    } else {
      off++;
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return { days, afters, nights, off, hours };
}

export function cycleLegend(settings?: RotaSettings): { kind: ShiftKind; days: number; label: string }[] {
  const t = templates(settings);
  return [
    { kind: "day", days: 2, label: t.day.label || "Day shifts" },
    { kind: "afters", days: 2, label: t.afters.label || "Afters" },
    { kind: "night", days: 2, label: t.night.label || "Night shifts" },
    { kind: "off", days: 3, label: "Off days" },
  ];
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function addDays(d: Date, n: number): Date {
  const out = startOfLocalDay(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Day before a working shift (for reminder scheduling). */
export function getReminderDates(
  from: Date,
  aheadDays = 60,
  overrides?: RotaOverrides,
  settings?: RotaSettings,
): Date[] {
  const dates: Date[] = [];
  let cursor = startOfLocalDay(from);
  const limit = Number.isFinite(aheadDays) ? Math.min(Math.max(0, aheadDays), 120) : 60;
  for (let i = 0; i < limit; i++) {
    const tomorrow = addDays(cursor, 1);
    const shift = getShiftForDate(tomorrow, overrides, settings);
    if (shift.kind !== "off") dates.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * If `kind` matches the base schedule, clear the override; otherwise store it.
 * Returns the next overrides map (does not mutate).
 */
export function applyRotaKind(
  overrides: RotaOverrides,
  date: Date,
  kind: ShiftKind,
  settings?: RotaSettings,
): RotaOverrides {
  const key = toDateKey(date);
  const base = getBaseKind(date, settings);
  const next = { ...overrides };
  if (kind === base) {
    delete next[key];
  } else {
    next[key] = { kind };
  }
  return next;
}

export function rotaSourceLabel(source: RotaSource | undefined): string {
  if (source === "cycle") return "repeating pattern";
  if (source === "manual") return "blank calendar";
  return "built-in rota";
}
