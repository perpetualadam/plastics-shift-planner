import {
  countWorkDaysInRange,
  parseDateKey,
  startOfLocalDay,
  toDateKey,
  getShiftForDate,
  type ShiftKind,
} from "./rota";
import { ROTA_DATES } from "./rotaData";
import {
  ATTENDANCE_BONUS_AMOUNT,
  extraWorkClockHours,
  extraWorkPaidHours,
  hasActiveAttendanceBonusLoss,
  type AppData,
  type AppSettings,
  type ExtraWorkEntry,
  type OvertimeEntry,
  type PayAdjustment,
} from "./storage";

export type PayBreakdown = {
  scheduledDays: number;
  scheduledNights: number;
  extraDays: number;
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
  /** Monthly attendance bonus(es) included in this range (£200 when no active losses). */
  attendanceBonus: number;
  /** How many months in the range still qualify for the bonus. */
  attendanceBonusMonths: number;
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

/** Monday–Sunday week containing `date` (UK-style). */
export function weekRangeContaining(date: Date): { start: Date; end: Date } {
  const day = startOfLocalDay(date);
  const mondayOffset = (day.getDay() + 6) % 7; // Mon=0
  const start = new Date(day);
  start.setDate(day.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
  };
}

/** Earlier of two local calendar days. */
export function minDate(a: Date, b: Date): Date {
  const aa = startOfLocalDay(a);
  const bb = startOfLocalDay(b);
  return aa.getTime() <= bb.getTime() ? aa : bb;
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
export function paidHoursFromBreak(
  settings: Pick<AppSettings, "shiftClockHours" | "breakMinutes" | "breakPaid">,
): number {
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

function extraWorkInRange(data: AppData, startKey: string, endKey: string): ExtraWorkEntry[] {
  return (data.extraWork ?? []).filter((e) => e.dateKey >= startKey && e.dateKey <= endKey);
}

/** Sum £200 for each calendar month in [start, end] with no active loss reasons. */
export function attendanceBonusInRange(
  data: AppData,
  start: Date,
  end: Date,
  opts?: { onlyCompletedMonths?: boolean; asOf?: Date },
): {
  amount: number;
  months: number;
} {
  const from = startOfLocalDay(start);
  const to = startOfLocalDay(end);
  if (from.getTime() > to.getTime()) return { amount: 0, months: 0 };

  const asOf = startOfLocalDay(opts?.asOf ?? new Date());
  let amount = 0;
  let months = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const lastMonth = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor.getTime() <= lastMonth.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthEnd = new Date(y, m + 1, 0);
    const fullyElapsed = monthEnd.getTime() <= asOf.getTime();
    if (opts?.onlyCompletedMonths && !fullyElapsed) {
      cursor.setMonth(cursor.getMonth() + 1);
      continue;
    }
    if (!hasActiveAttendanceBonusLoss(data, y, m)) {
      amount += ATTENDANCE_BONUS_AMOUNT;
      months += 1;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { amount, months };
}

export function calculatePay(
  data: AppData,
  start: Date,
  end: Date,
  opts?: { onlyCompletedAttendanceMonths?: boolean; asOf?: Date },
): PayBreakdown {
  const { settings } = data;
  const fullStartKey = toDateKey(startOfLocalDay(start));
  const fullEndKey = toDateKey(startOfLocalDay(end));
  const extras = extraWorkInRange(data, fullStartKey, fullEndKey);
  const extraClock = extras.reduce((s, e) => s + extraWorkClockHours(e), 0);
  const extraPaid = extras.reduce((s, e) => s + extraWorkPaidHours(e), 0);

  const range = clampRangeToWorkStart(settings, start, end);
  const counts = range
    ? countWorkDaysInRange(range.start, range.end)
    : { days: 0, nights: 0, off: 0, hours: 0 };

  const shifts = counts.days + counts.nights;
  const clock = clockHoursPerShift(settings);
  const paidPer = paidHoursPerShift(settings);
  const unpaidPer = unpaidBreakHoursPerShift(settings);

  const scheduledHours = shifts * clock + extraClock;
  const paidHours = shifts * paidPer + extraPaid;
  const unpaidBreakHours = shifts * unpaidPer + Math.max(0, extraClock - extraPaid);

  const basePay = paidHours * settings.hourlyRate;
  const nightPremiumPay = counts.nights * paidPer * settings.nightPremium;

  const ot = data.overtime.filter((o) => o.dateKey >= fullStartKey && o.dateKey <= fullEndKey);
  const overtimeHours = ot.reduce((sum, o) => sum + o.hours, 0);
  const overtimePay = ot.reduce((sum, o) => {
    const rate = o.rateOverride ?? settings.hourlyRate * settings.overtimeMultiplier;
    return sum + o.hours * rate;
  }, 0);

  const adjustmentsList = data.adjustments.filter(
    (a) => a.dateKey >= fullStartKey && a.dateKey <= fullEndKey,
  );
  const adjustments = adjustmentsList.reduce((sum, a) => sum + a.amount, 0);

  const { amount: attendanceBonus, months: attendanceBonusMonths } = attendanceBonusInRange(
    data,
    start,
    end,
    opts?.onlyCompletedAttendanceMonths
      ? { onlyCompletedMonths: true, asOf: opts.asOf }
      : undefined,
  );

  const total = basePay + nightPremiumPay + overtimePay + adjustments + attendanceBonus;
  const effectiveHourly =
    paidHours + overtimeHours > 0 ? total / (paidHours + overtimeHours) : 0;

  return {
    scheduledDays: counts.days,
    scheduledNights: counts.nights,
    extraDays: extras.length,
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
    attendanceBonus,
    attendanceBonusMonths,
    total,
    effectiveHourly,
  };
}

export type PeriodKind = "week" | "month" | "year";

export type PeriodComparison = {
  kind: PeriodKind;
  label: string;
  start: Date;
  end: Date;
  asOf: Date;
  /** Full scheduled period (rota + extras + OT + bonuses in range). */
  potential: PayBreakdown;
  /** Work completed through asOf (attendance bonus only for finished months). */
  actual: PayBreakdown;
  remainingPaidHours: number;
  remainingPay: number;
};

export function totalHours(breakdown: PayBreakdown): number {
  return breakdown.paidHours + breakdown.overtimeHours;
}

export function comparePeriodPay(
  data: AppData,
  kind: PeriodKind,
  anchor: Date,
  asOf: Date = new Date(),
): PeriodComparison {
  const today = startOfLocalDay(asOf);
  let start: Date;
  let end: Date;
  let label: string;

  if (kind === "week") {
    ({ start, end } = weekRangeContaining(anchor));
    label = `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  } else if (kind === "month") {
    ({ start, end } = monthRange(anchor.getFullYear(), anchor.getMonth()));
    label = start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } else {
    ({ start, end } = yearRange(anchor.getFullYear()));
    label = String(anchor.getFullYear());
  }

  const potential = calculatePay(data, start, end);

  const emptyActual: PayBreakdown = {
    scheduledDays: 0,
    scheduledNights: 0,
    extraDays: 0,
    scheduledHours: 0,
    paidHours: 0,
    unpaidBreakHours: 0,
    breakMinutes: data.settings.breakMinutes,
    breakPaid: data.settings.breakPaid,
    basePay: 0,
    nightPremiumPay: 0,
    overtimeHours: 0,
    overtimePay: 0,
    adjustments: 0,
    attendanceBonus: 0,
    attendanceBonusMonths: 0,
    total: 0,
    effectiveHourly: 0,
  };

  const periodStart = startOfLocalDay(start);
  const actual: PayBreakdown =
    periodStart.getTime() > today.getTime()
      ? emptyActual
      : calculatePay(data, start, minDate(end, today), {
          onlyCompletedAttendanceMonths: true,
          asOf: today,
        });

  return {
    kind,
    label,
    start,
    end,
    asOf: today,
    potential,
    actual,
    remainingPaidHours: Math.max(0, totalHours(potential) - totalHours(actual)),
    remainingPay: Math.max(0, potential.total - actual.total),
  };
}

export function calculateMonthPay(data: AppData, year: number, month: number): PayBreakdown {
  const { start, end } = monthRange(year, month);
  return calculatePay(data, start, end);
}

export type WorkedDayRow = {
  dateKey: string;
  kind: ShiftKind | "extra";
  label?: string;
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
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

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

  for (const extra of extraWorkInRange(data, startKey, endKey)) {
    const ot = data.overtime
      .filter((o) => o.dateKey === extra.dateKey)
      .reduce((s, o) => s + o.hours, 0);
    rows.push({
      dateKey: extra.dateKey,
      kind: "extra",
      label: extra.label,
      scheduledHours: extraWorkClockHours(extra),
      paidHours: extraWorkPaidHours(extra),
      overtimeHours: ot,
      note: extra.note ?? `${extra.start}–${extra.end}`,
      countsForPay: true,
    });
  }

  return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
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
  const extraPaid = (data.extraWork ?? []).reduce((s, e) => s + extraWorkPaidHours(e), 0);
  const base = (workDays * hoursPer + extraPaid) * data.settings.hourlyRate;
  const nightsShare = 0.5;
  const nightPrem = workDays * nightsShare * hoursPer * data.settings.nightPremium;
  // Rough: £200 × remaining calendar months from work start through year end of rota span
  let bonusMonths = 0;
  if (ROTA_DATES.length > 0) {
    const first = startKey || ROTA_DATES[0];
    const last = ROTA_DATES[ROTA_DATES.length - 1];
    const from = parseDateKey(first);
    const to = parseDateKey(last);
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor.getTime() <= end.getTime()) {
      if (!hasActiveAttendanceBonusLoss(data, cursor.getFullYear(), cursor.getMonth())) {
        bonusMonths += 1;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return base + nightPrem + bonusMonths * ATTENDANCE_BONUS_AMOUNT;
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
