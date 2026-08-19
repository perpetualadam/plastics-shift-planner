import assert from "node:assert/strict";
import {
  calculateMonthPay,
  calculatePay,
  comparePeriodPay,
  money,
  paidHoursFromBreak,
  paidHoursPerShift,
  totalHours,
  unpaidBreakHoursPerShift,
  weekRangeContaining,
} from "../src/lib/pay";
import {
  ATTENDANCE_BONUS_AMOUNT,
  DEFAULT_EXTRA_WORK,
  DEFAULT_SETTINGS,
  type AppData,
} from "../src/lib/storage";
import { getShiftForDate } from "../src/lib/rota";
import { ROTA_BY_DATE } from "../src/lib/rotaData";

const baseData: AppData = {
  settings: { ...DEFAULT_SETTINGS },
  overtime: [],
  notes: [],
  adjustments: [],
  extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
  attendanceBonusLosses: [],
  notificationPermissionAsked: false,
  installedHintDismissed: false,
};

// First CSV B-shift day is Thu 20 Aug; induction 18 Aug is a separate extra payable day
assert.equal(DEFAULT_SETTINGS.workStartDate, "2026-08-20");
assert.equal(DEFAULT_EXTRA_WORK.length, 1);
assert.equal(DEFAULT_EXTRA_WORK[0].dateKey, "2026-08-18");
assert.equal(DEFAULT_EXTRA_WORK[0].paidHours, 9);
assert.equal(DEFAULT_EXTRA_WORK[0].start, "09:00");
assert.equal(DEFAULT_EXTRA_WORK[0].end, "18:00");
assert.equal(ROTA_BY_DATE["2026-08-18"], undefined);
assert.equal(getShiftForDate(new Date(2026, 7, 19)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 7, 20)).kind, "day");
assert.equal(ROTA_BY_DATE["2026-08-20"]?.kind, "day");

assert.equal(
  unpaidBreakHoursPerShift({
    ...DEFAULT_SETTINGS,
    breakPaid: false,
    paidHoursPerShift: 11.5,
    shiftClockHours: 12,
  }),
  0.5,
);
assert.equal(paidHoursPerShift({ ...DEFAULT_SETTINGS, paidHoursPerShift: 11.5 }), 11.5);
assert.equal(
  paidHoursFromBreak({ shiftClockHours: 12, breakMinutes: 30, breakPaid: false }),
  11.5,
);

// Aug 2026: rota from 20th = 4 days + 3 nights = 7 × 11.5 paid, plus induction 9h on 18th
const unpaid = calculatePay(
  {
    ...baseData,
    settings: {
      ...DEFAULT_SETTINGS,
      hourlyRate: 10,
      workStartDate: "2026-08-20",
      breakPaid: false,
      breakMinutes: 30,
      shiftClockHours: 12,
      paidHoursPerShift: 11.5,
    },
  },
  new Date(2026, 7, 1),
  new Date(2026, 7, 31),
);
assert.equal(unpaid.scheduledDays, 4);
assert.equal(unpaid.scheduledNights, 3);
assert.equal(unpaid.extraDays, 1);
assert.equal(unpaid.scheduledHours, 7 * 12 + 9);
assert.equal(unpaid.paidHours, 7 * 11.5 + 9);
assert.equal(unpaid.basePay, (7 * 11.5 + 9) * 10);
assert.equal(unpaid.attendanceBonus, ATTENDANCE_BONUS_AMOUNT);
assert.equal(unpaid.total, unpaid.basePay + ATTENDANCE_BONUS_AMOUNT);

// Induction alone in a week before rota start still pays
const inductionOnly = calculatePay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
  },
  new Date(2026, 7, 17),
  new Date(2026, 7, 19),
);
assert.equal(inductionOnly.extraDays, 1);
assert.equal(inductionOnly.paidHours, 9);
assert.equal(inductionOnly.basePay, 90);
assert.equal(inductionOnly.scheduledDays, 0);

// Active loss voids the monthly attendance bonus
const withLoss = calculateMonthPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
    attendanceBonusLosses: [
      {
        id: "loss-1",
        monthKey: "2026-08",
        reason: "late",
        status: "active",
        createdAt: "2026-08-21T10:00:00.000Z",
      },
    ],
  },
  2026,
  7,
);
assert.equal(withLoss.attendanceBonus, 0);
assert.equal(withLoss.attendanceBonusMonths, 0);

// Expired loss does not void the bonus
const expiredLoss = calculateMonthPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
    attendanceBonusLosses: [
      {
        id: "loss-2",
        monthKey: "2026-08",
        reason: "absence",
        status: "expired",
        createdAt: "2026-08-21T10:00:00.000Z",
      },
    ],
  },
  2026,
  7,
);
assert.equal(expiredLoss.attendanceBonus, ATTENDANCE_BONUS_AMOUNT);

// Loss in another month does not affect August
const otherMonth = calculateMonthPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
    attendanceBonusLosses: [
      {
        id: "loss-3",
        monthKey: "2026-09",
        reason: "clock_out_early",
        status: "active",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  },
  2026,
  7,
);
assert.equal(otherMonth.attendanceBonus, ATTENDANCE_BONUS_AMOUNT);

assert.match(money(12.5, "GBP"), /£|GBP/);

// Actual vs potential: after induction (18th) but before first rota day (20th)
const asOf19 = new Date(2026, 7, 19);
const monthCmp = comparePeriodPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
  },
  "month",
  new Date(2026, 7, 1),
  asOf19,
);
assert.equal(monthCmp.actual.extraDays, 1);
assert.equal(monthCmp.actual.paidHours, 9);
assert.equal(monthCmp.actual.attendanceBonus, 0); // August not finished yet
assert.equal(monthCmp.potential.extraDays, 1);
assert.equal(monthCmp.potential.scheduledDays, 4);
assert.equal(monthCmp.potential.scheduledNights, 3);
assert.equal(monthCmp.potential.attendanceBonus, ATTENDANCE_BONUS_AMOUNT);
assert.ok(monthCmp.potential.paidHours > monthCmp.actual.paidHours);
assert.ok(monthCmp.remainingPaidHours > 0);
assert.ok(monthCmp.remainingPay > 0);

// After first day shift (20 Aug): actual includes induction + 20th
const asOf20 = new Date(2026, 7, 20);
const monthAfterFirst = comparePeriodPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
  },
  "month",
  new Date(2026, 7, 1),
  asOf20,
);
assert.equal(monthAfterFirst.actual.scheduledDays, 1);
assert.equal(monthAfterFirst.actual.extraDays, 1);
assert.equal(monthAfterFirst.actual.paidHours, 11.5 + 9);

// Week containing 20 Aug 2026 (Mon 17 – Sun 23)
const week = weekRangeContaining(new Date(2026, 7, 20));
assert.equal(week.start.getDay(), 1);
assert.equal(week.end.getDay(), 0);
const weekCmp = comparePeriodPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
  },
  "week",
  new Date(2026, 7, 20),
  asOf20,
);
assert.equal(weekCmp.actual.scheduledDays, 1);
assert.equal(weekCmp.potential.scheduledDays, 2); // 20 and 21 Aug days
assert.ok(totalHours(weekCmp.potential) >= totalHours(weekCmp.actual));

// Year potential includes attendance for months with no losses
const yearCmp = comparePeriodPay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, workStartDate: "2026-08-20" },
  },
  "year",
  new Date(2026, 0, 1),
  asOf20,
);
assert.ok(yearCmp.potential.total > yearCmp.actual.total);
assert.ok(yearCmp.potential.attendanceBonusMonths >= 1);

console.log("pay tests passed");
