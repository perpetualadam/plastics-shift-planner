import assert from "node:assert/strict";
import {
  calculateMonthPay,
  calculatePay,
  money,
  paidHoursFromBreak,
  paidHoursPerShift,
  unpaidBreakHoursPerShift,
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

console.log("pay tests passed");
