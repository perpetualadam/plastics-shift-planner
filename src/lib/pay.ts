import {
  countWorkDaysInRange,
  getShiftForDate,
  parseDateKey,
  startOfLocalDay,
  toDateKey,
  type ShiftKind,
} from "./rota";
import type { AppData, OvertimeEntry, PayAdjustment } from "./storage";

export type PayBreakdown = {
  scheduledDays: number;
  scheduledNights: number;
  scheduledHours: number;
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

export function calculatePay(
  data: AppData,
  start: Date,
  end: Date,
): PayBreakdown {
  const { settings } = data;
  const counts = countWorkDaysInRange(start, end);
  const basePay = counts.hours * settings.hourlyRate;
  const nightPremiumPay = counts.nights * 12 * settings.nightPremium;

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
    counts.hours + overtimeHours > 0 ? total / (counts.hours + overtimeHours) : 0;

  return {
    scheduledDays: counts.days,
    scheduledNights: counts.nights,
    scheduledHours: counts.hours,
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
  // Rough: 4 work days per 7-day cycle on 2-2-3
  const workDaysPerYear = (4 / 7) * 365.25;
  const hours = workDaysPerYear * 12;
  const base = hours * data.settings.hourlyRate;
  const nightsShare = 0.5;
  const nightPrem = workDaysPerYear * nightsShare * 12 * data.settings.nightPremium;
  return base + nightPrem;
}

export function parseMonthKey(dateKey: string): { year: number; month: number } {
  const d = parseDateKey(dateKey);
  return { year: d.getFullYear(), month: d.getMonth() };
}
