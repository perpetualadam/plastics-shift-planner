import assert from "node:assert/strict";
import {
  calculateMonthPay,
  calculatePay,
  money,
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

assert.equal(
  unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: false, breakMinutes: 30 }),
  0.5,
);
assert.equal(
  unpaidBreakHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: true, breakMinutes: 30 }),
  0,
);
assert.equal(
  paidHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: false, breakMinutes: 30 }),
  11.5,
);
assert.equal(
  paidHoursPerShift({ ...DEFAULT_SETTINGS, breakPaid: true, breakMinutes: 30 }),
  12,
);

// Jan 2026 from official CSV: 8 days + 7 nights = 15 shifts @ £18.50, unpaid 30m break
const jan = calculateMonthPay(baseData, 2026, 0);
assert.equal(jan.scheduledDays, 8);
assert.equal(jan.scheduledNights, 7);
assert.equal(jan.scheduledHours, 15 * 12);
assert.equal(jan.paidHours, 15 * 11.5);
assert.equal(jan.unpaidBreakHours, 15 * 0.5);
assert.equal(jan.basePay, 15 * 11.5 * 18.5);
assert.equal(jan.nightPremiumPay, 0);
assert.equal(jan.overtimePay, 0);
assert.equal(jan.adjustments, 0);
assert.equal(jan.total, jan.basePay);

const withOt: AppData = {
  ...baseData,
  overtime: [
    {
      id: "ot1",
      dateKey: "2026-01-03",
      hours: 2,
      note: "handover",
      createdAt: new Date().toISOString(),
    },
  ],
  adjustments: [
    {
      id: "adj1",
      dateKey: "2026-01-10",
      label: "bonus",
      amount: 50,
    },
  ],
};

const janOt = calculateMonthPay(withOt, 2026, 0);
assert.equal(janOt.overtimeHours, 2);
assert.equal(janOt.overtimePay, 2 * 18.5 * 1.5);
assert.equal(janOt.adjustments, 50);
assert.equal(janOt.total, jan.basePay + janOt.overtimePay + 50);

assert.match(money(12.5, "GBP"), /£|GBP/);

// Aug 2026 from CSV: 7 days + 10 nights = 17 shifts
const unpaid = calculatePay(
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, breakPaid: false, breakMinutes: 30 },
  },
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
  {
    ...baseData,
    settings: { ...DEFAULT_SETTINGS, hourlyRate: 10, breakPaid: true, breakMinutes: 30 },
  },
  new Date(2026, 7, 1),
  new Date(2026, 7, 31),
);
assert.equal(paid.paidHours, 17 * 12);
assert.equal(paid.unpaidBreakHours, 0);
assert.equal(paid.basePay, 17 * 12 * 10);
assert.ok(paid.total > unpaid.total);

console.log("pay tests passed");
