import assert from "node:assert/strict";
import {
  calculatePay,
  paidHoursFromBreak,
  paidHoursPerShift,
  unpaidBreakHoursPerShift,
} from "../src/lib/pay";
import { DEFAULT_SETTINGS, type AppData } from "../src/lib/storage";

const baseData: AppData = {
  settings: { ...DEFAULT_SETTINGS },
  overtime: [],
  notes: [],
  adjustments: [],
  notificationPermissionAsked: false,
  installedHintDismissed: false,
};

assert.equal(unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: false, paidHoursPerShift: 11.5, shiftClockHours: 12 }), 0.5);
assert.equal(unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: true, paidHoursPerShift: 12, shiftClockHours: 12 }), 0);
assert.equal(paidHoursPerShift({ ...DEFAULT_SETTINGS, paidHoursPerShift: 11.5 }), 11.5);
assert.equal(paidHoursFromBreak({ shiftClockHours: 12, breakMinutes: 30, breakPaid: false }), 11.5);
assert.equal(paidHoursFromBreak({ shiftClockHours: 12, breakMinutes: 30, breakPaid: true }), 12);

// With workStartDate 2026-08-20, Aug pay only counts from 20th
// Aug CSV after 20th: days 20,21,25,26 (4) + nights 29,30,31 (3) = 7 shifts
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
assert.equal(unpaid.scheduledHours, 7 * 12);
assert.equal(unpaid.paidHours, 7 * 11.5);
assert.equal(unpaid.basePay, 7 * 11.5 * 10);

const paid = calculatePay(
  {
    ...baseData,
    settings: {
      ...DEFAULT_SETTINGS,
      hourlyRate: 10,
      workStartDate: "2026-08-20",
      breakPaid: true,
      paidHoursPerShift: 12,
      shiftClockHours: 12,
    },
  },
  new Date(2026, 7, 1),
  new Date(2026, 7, 31),
);
assert.equal(paid.paidHours, 7 * 12);
assert.equal(paid.unpaidBreakHours, 0);
assert.ok(paid.total > unpaid.total);

// Before start date → zero
const before = calculatePay(
  baseData,
  new Date(2026, 0, 1),
  new Date(2026, 0, 31),
);
assert.equal(before.paidHours, 0);
assert.equal(before.total, 0);

console.log("pay break tests passed");
