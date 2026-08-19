import assert from "node:assert/strict";
import {
  calculatePay,
  money,
  paidHoursFromBreak,
  paidHoursPerShift,
  unpaidBreakHoursPerShift,
} from "../src/lib/pay";
import { DEFAULT_EXTRA_WORK, DEFAULT_SETTINGS, type AppData } from "../src/lib/storage";

const baseData: AppData = {
  settings: { ...DEFAULT_SETTINGS },
  overtime: [],
  notes: [],
  adjustments: [],
  extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
  notificationPermissionAsked: false,
  installedHintDismissed: false,
};

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

assert.match(money(12.5, "GBP"), /£|GBP/);

console.log("pay tests passed");
