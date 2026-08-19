import {
  countWorkDaysInRange,
  DAY_SHIFT_HOURS,
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

/** Unpaid break hours deducted from one shift (0 when breaks are paid). */
export function unpaidBreakHoursPerShift(settings: AppSettings): number {
  if (settings.breakPaid) return 0;
  const mins = Math.max(0, settings.breakMinutes || 0);
  return Math.min(DAY_SHIFT_HOURS, mins / 60);
}

/** Paid hours for one completed day or night shift. */
export function paidHoursPerShift(settings: AppSettings, clockHours = DAY_SHIFT_HOURS): number {
  return Math.max(0, clockHours - unpaidBreakHoursPerShift(settings));
}

export function calculatePay(data: AppData, start: Date, end: Date): PayBreakdown {
  const { settings } = data;
  const counts = countWorkDaysInRange(start, end);
  const shifts = counts.days + counts.nights;
  const unpaidBreakHours = shifts * unpaidBreakHoursPerShift(settings);
  const paidHours = Math.max(0, counts.hours - unpaidBreakHours);
  const hoursPerShift = paidHoursPerShift(settings);

  const basePay = paidHours * settings.hourlyRate;
  const nightPremiumPay = counts.nights * hoursPerShift * settings.nightPremium;

  const startKey = toDateKey(startOfLocalDay(start));
  const endKey = toDateKey(startOfLocalDay(end));

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
    scheduledHours: counts.hours,
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
};

export function workedDaysInMonth(
  data: AppData,
  year: number,
  month: number,
): WorkedDayRow[] {
  const { start, end } = monthRange(year, month);
  const rows: WorkedDayRow[] = [];
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  while (cursor.getTime() <= last.getTime()) {
    const shift = getShiftForDate(cursor);
    if (shift.kind !== "off") {
      const key = toDateKey(cursor);
      const ot = data.overtime
        .filter((o) => o.dateKey === key)
        .reduce((s, o) => s + o.hours, 0);
      const note = data.notes.find((n) => n.dateKey === key)?.text ?? "";
      rows.push({
        dateKey: key,
        kind: shift.kind,
        scheduledHours: shift.hours,
        paidHours: paidHoursPerShift(data.settings, shift.hours),
        overtimeHours: ot,
        note,
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
  const workDays = ROTA_DATES.length;
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
  if (mins <= 0) return "No break";
  return `${mins} min ${settings.breakPaid ? "paid" : "unpaid"} break`;
}
