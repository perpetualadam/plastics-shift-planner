import assert from "node:assert/strict";
import {
  calculatePay,
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

assert.equal(unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: false, breakMinutes: 30 }), 0.5);
assert.equal(unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: true, breakMinutes: 30 }), 0);
assert.equal(paidHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: false, breakMinutes: 30 }), 11.5);
assert.equal(paidHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: true, breakMinutes: 30 }), 12);

// Aug 2026 from CSV: day shifts 15,16,17,20,21,25,26 = 7 days; nights 1,2,3,6,7,11,12,29,30,31 = 10
const unpaid = calculatePay(
  { ...baseData, settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, breakPaid: false, breakMinutes: 30 } },
  new Date(2026, 7, 1),
  new Date(2026, 7, 31),
);
assert.equal(unpaid.scheduledDays, 7);
assert.equal(unpaid.scheduledNights, 10);
assert.equal(unpaid.scheduledHours, 17 * 12);
assert.equal(unpaid.paidHours, 17 * 11.5);
assert.equal(unpaid.unpaidBreakHours, 17 * 0.5);
assert.equal(unpaid.basePay, 17 * 11.5 * 10);

const paid = calculatePay(
  { ...baseData, settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, breakPaid: true, breakMinutes: 30 } },
  new Date(2026, 7, 1),
  new Date(2026, 7, 31),
);
assert.equal(paid.paidHours, 17 * 12);
assert.equal(paid.unpaidBreakHours, 0);
assert.equal(paid.basePay, 17 * 12 * 10);
assert.ok(paid.total > unpaid.total);

console.log("pay break tests passed");
