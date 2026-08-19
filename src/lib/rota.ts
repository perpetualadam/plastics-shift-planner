/** Plastics B-Shift rota — 2 days / 2 nights / 3 off (7-day cycle) */

export type ShiftKind = "day" | "night" | "off";

export type ShiftDay = {
  date: Date;
  kind: ShiftKind;
  /** Position within the 7-day cycle (0–6) */
  cycleDay: number;
  label: string;
  startHour: number | null;
  endHour: number | null;
  hours: number;
};

/**
 * Anchor: first Day shift of a cycle.
 * From Plastics 2026 rota (yellow B): Jan 3–4 days, Jan 5–6 nights, then 3 off.
 */
export const CYCLE_ANCHOR = new Date(2026, 0, 3);
export const CYCLE_LENGTH = 7;
export const DAY_SHIFT_HOURS = 12;
export const NIGHT_SHIFT_HOURS = 12;
export const SHIFT_NAME = "B Shift";

const CYCLE_PATTERN: ShiftKind[] = [
  "day",
  "day",
  "night",
  "night",
  "off",
  "off",
  "off",
];

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays(a: Date, b: Date): number {
  const ms = startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getCycleDay(date: Date): number {
  const delta = diffDays(date, CYCLE_ANCHOR);
  return ((delta % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
}

export function getShiftForDate(date: Date): ShiftDay {
  const cycleDay = getCycleDay(date);
  const kind = CYCLE_PATTERN[cycleDay];
  const day = startOfLocalDay(date);

  if (kind === "day") {
    return {
      date: day,
      kind,
      cycleDay,
      label: "Day shift",
      startHour: 6,
      endHour: 18,
      hours: DAY_SHIFT_HOURS,
    };
  }
  if (kind === "night") {
    return {
      date: day,
      kind,
      cycleDay,
      label: "Night shift",
      startHour: 18,
      endHour: 6,
      hours: NIGHT_SHIFT_HOURS,
    };
  }
  return {
    date: day,
    kind: "off",
    cycleDay,
    label: "Off",
    startHour: null,
    endHour: null,
    hours: 0,
  };
}

export function formatShiftTime(shift: ShiftDay): string {
  if (shift.kind === "day") return "06:00 – 18:00";
  if (shift.kind === "night") return "18:00 – 06:00";
  return "Rest day";
}

export function getShiftStart(date: Date): Date | null {
  const shift = getShiftForDate(date);
  if (shift.kind === "off" || shift.startHour === null) return null;
  const start = startOfLocalDay(date);
  start.setHours(shift.startHour, 0, 0, 0);
  return start;
}

export function getShiftEnd(date: Date): Date | null {
  const shift = getShiftForDate(date);
  if (shift.kind === "off") return null;
  const day = startOfLocalDay(date);
  if (shift.kind === "day") {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0, 0);
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 6, 0, 0, 0);
}

export function getWakeTime(date: Date, leadMinutes: number): Date | null {
  const start = getShiftStart(date);
  if (!start) return null;
  return new Date(start.getTime() - leadMinutes * 60 * 1000);
}

export function getMonthShifts(year: number, month: number): ShiftDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: ShiftDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(getShiftForDate(new Date(year, month, d)));
  }
  return out;
}

export function getUpcomingShifts(from: Date, count: number): ShiftDay[] {
  const out: ShiftDay[] = [];
  let cursor = startOfLocalDay(from);
  let guard = 0;
  while (out.length < count && guard < 400) {
    const shift = getShiftForDate(cursor);
    if (shift.kind !== "off") out.push(shift);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    guard++;
  }
  return out;
}

export function getNextWorkingShift(from: Date = new Date()): ShiftDay | null {
  const now = from;
  let cursor = startOfLocalDay(now);
  for (let i = 0; i < 20; i++) {
    const shift = getShiftForDate(cursor);
    if (shift.kind !== "off") {
      const start = getShiftStart(cursor);
      const end = getShiftEnd(cursor);
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
): { days: number; nights: number; off: number; hours: number } {
  let days = 0;
  let nights = 0;
  let off = 0;
  let hours = 0;
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  while (cursor.getTime() <= last.getTime()) {
    const s = getShiftForDate(cursor);
    if (s.kind === "day") {
      days++;
      hours += s.hours;
    } else if (s.kind === "night") {
      nights++;
      hours += s.hours;
    } else {
      off++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { days, nights, off, hours };
}

export function cycleLegend(): { kind: ShiftKind; days: number; label: string }[] {
  return [
    { kind: "day", days: 2, label: "2 day shifts" },
    { kind: "night", days: 2, label: "2 night shifts" },
    { kind: "off", days: 3, label: "3 days off" },
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
export function getReminderDates(from: Date, aheadDays = 60): Date[] {
  const dates: Date[] = [];
  let cursor = startOfLocalDay(from);
  for (let i = 0; i < aheadDays; i++) {
    const tomorrow = addDays(cursor, 1);
    const shift = getShiftForDate(tomorrow);
    if (shift.kind !== "off") dates.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}
