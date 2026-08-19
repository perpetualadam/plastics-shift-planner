import {
  countWorkDaysInRange,
  parseDateKey,
  startOfLocalDay,
  toDateKey,
  getShiftForDate,
  type ShiftKind,
} from "./rota";
import { ROTA_DATES } from "./rotaData";
import type { AppData, AppSettings, OvertimeEntry, PayAdjustment } from "./storage";

export type PayBreakdown = {
  scheduledDays: number;
  scheduledNights: number;
  /** Clock hours on site (includes unpaid break time). */
  scheduledHours: number;
  /** Hours that attract base pay after break rules. */
  paidHours: number;
  unpaidBreakHours: number;
  breakMinutes: number;
  breakPaid: boolean;
  basePay: number;
  nightPremiumPay: number;
  overtimeHours: number;
  overtimePay: number;
  adjustments: number;
  total: number;
  effectiveHourly: number;
};

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
  };
}

export function clockHoursPerShift(settings: AppSettings): number {
  const h = Number(settings.shiftClockHours);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

/** Paid hours for one completed day or night shift (user-editable). */
export function paidHoursPerShift(settings: AppSettings): number {
  const clock = clockHoursPerShift(settings);
  const paid = Number(settings.paidHoursPerShift);
  if (!Number.isFinite(paid)) return Math.max(0, clock);
  return Math.max(0, Math.min(clock, paid));
}

/** Unpaid break hours deducted from one shift (0 when breaks are paid). */
export function unpaidBreakHoursPerShift(settings: AppSettings): number {
  if (settings.breakPaid) return 0;
  return Math.max(0, clockHoursPerShift(settings) - paidHoursPerShift(settings));
}

/** Sync paid hours from break length when user toggles break settings. */
export function paidHoursFromBreak(settings: Pick<AppSettings, "shiftClockHours" | "breakMinutes" | "breakPaid">): number {
  const clock = clockHoursPerShift(settings as AppSettings);
  if (settings.breakPaid) return clock;
  const mins = Math.max(0, settings.breakMinutes || 0);
  return Math.max(0, clock - mins / 60);
}

function clampRangeToWorkStart(
  settings: AppSettings,
  start: Date,
  end: Date,
): { start: Date; end: Date } | null {
  const workStart = settings.workStartDate
    ? startOfLocalDay(parseDateKey(settings.workStartDate))
    : null;
  let from = startOfLocalDay(start);
  const to = startOfLocalDay(end);
  if (workStart && workStart.getTime() > from.getTime()) from = workStart;
  if (from.getTime() > to.getTime()) return null;
  return { start: from, end: to };
}

export function calculatePay(data: AppData, start: Date, end: Date): PayBreakdown {
  const { settings } = data;
  const range = clampRangeToWorkStart(settings, start, end);
  if (!range) {
    return {
      scheduledDays: 0,
      scheduledNights: 0,
      scheduledHours: 0,
      paidHours: 0,
      unpaidBreakHours: 0,
      breakMinutes: settings.breakMinutes,
      breakPaid: settings.breakPaid,
      basePay: 0,
      nightPremiumPay: 0,
      overtimeHours: 0,
      overtimePay: 0,
      adjustments: 0,
      total: 0,
      effectiveHourly: 0,
    };
  }

  const counts = countWorkDaysInRange(range.start, range.end);
  const shifts = counts.days + counts.nights;
  const clock = clockHoursPerShift(settings);
  const paidPer = paidHoursPerShift(settings);
  const unpaidPer = unpaidBreakHoursPerShift(settings);
  const scheduledHours = shifts * clock;
  const paidHours = shifts * paidPer;
  const unpaidBreakHours = shifts * unpaidPer;

  const basePay = paidHours * settings.hourlyRate;
  const nightPremiumPay = counts.nights * paidPer * settings.nightPremium;

  const startKey = toDateKey(range.start);
  const endKey = toDateKey(range.end);

  const ot = data.overtime.filter((o) => o.dateKey >= startKey && o.dateKey <= endKey);
  const overtimeHours = ot.reduce((sum, o) => sum + o.hours, 0);
  const overtimePay = ot.reduce((sum, o) => {
    const rate = o.rateOverride ?? settings.hourlyRate * settings.overtimeMultiplier;
    return sum + o.hours * rate;
  }, 0);

  const adjustmentsList = data.adjustments.filter(
    (a) => a.dateKey >= startKey && a.dateKey <= endKey,
  );
  const adjustments = adjustmentsList.reduce((sum, a) => sum + a.amount, 0);

  const total = basePay + nightPremiumPay + overtimePay + adjustments;
  const effectiveHourly =
    paidHours + overtimeHours > 0 ? total / (paidHours + overtimeHours) : 0;

  return {
    scheduledDays: counts.days,
    scheduledNights: counts.nights,
    scheduledHours,
    paidHours,
    unpaidBreakHours,
    breakMinutes: settings.breakMinutes,
    breakPaid: settings.breakPaid,
    basePay,
    nightPremiumPay,
    overtimeHours,
    overtimePay,
    adjustments,
    total,
    effectiveHourly,
  };
}

export function calculateMonthPay(data: AppData, year: number, month: number): PayBreakdown {
  const { start, end } = monthRange(year, month);
  return calculatePay(data, start, end);
}

export type WorkedDayRow = {
  dateKey: string;
  kind: ShiftKind;
  scheduledHours: number;
  paidHours: number;
  overtimeHours: number;
  note: string;
  countsForPay: boolean;
};

export function workedDaysInMonth(
  data: AppData,
  year: number,
  month: number,
): WorkedDayRow[] {
  const { start, end } = monthRange(year, month);
  const workStartKey = data.settings.workStartDate || "";
  const rows: WorkedDayRow[] = [];
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  const clock = clockHoursPerShift(data.settings);
  const paid = paidHoursPerShift(data.settings);
  while (cursor.getTime() <= last.getTime()) {
    const shift = getShiftForDate(cursor);
    if (shift.kind !== "off") {
      const key = toDateKey(cursor);
      const countsForPay = !workStartKey || key >= workStartKey;
      const ot = data.overtime
        .filter((o) => o.dateKey === key)
        .reduce((s, o) => s + o.hours, 0);
      const note = data.notes.find((n) => n.dateKey === key)?.text ?? "";
      rows.push({
        dateKey: key,
        kind: shift.kind,
        scheduledHours: clock,
        paidHours: countsForPay ? paid : 0,
        overtimeHours: ot,
        note,
        countsForPay,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export function sumOvertimeHours(entries: OvertimeEntry[]): number {
  return entries.reduce((s, e) => s + e.hours, 0);
}

export function sumAdjustments(entries: PayAdjustment[]): number {
  return entries.reduce((s, e) => s + e.amount, 0);
}

export function yearToDatePay(data: AppData, asOf: Date = new Date()): PayBreakdown {
  const start = new Date(asOf.getFullYear(), 0, 1);
  return calculatePay(data, start, asOf);
}

export function estimatedAnnual(data: AppData): number {
  const startKey = data.settings.workStartDate || "";
  const workDays = ROTA_DATES.filter((d) => !startKey || d >= startKey).length;
  const hoursPer = paidHoursPerShift(data.settings);
  const base = workDays * hoursPer * data.settings.hourlyRate;
  const nightsShare = 0.5;
  const nightPrem = workDays * nightsShare * hoursPer * data.settings.nightPremium;
  return base + nightPrem;
}

export function parseMonthKey(dateKey: string): { year: number; month: number } {
  const d = parseDateKey(dateKey);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function breakLabel(settings: AppSettings): string {
  const mins = settings.breakMinutes || 0;
  const paid = paidHoursPerShift(settings);
  const clock = clockHoursPerShift(settings);
  if (mins <= 0 && paid >= clock) return `No break · ${paid}h paid`;
  return `${mins} min ${settings.breakPaid ? "paid" : "unpaid"} · ${paid}h paid / ${clock}h clock`;
}
