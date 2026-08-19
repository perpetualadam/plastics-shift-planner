import assert from "node:assert/strict";
import { calculateMonthPay, money } from "../src/lib/pay";
import { DEFAULT_SETTINGS, type AppData } from "../src/lib/storage";

const baseData: AppData = {
  settings: { ...DEFAULT_SETTINGS },
  overtime: [],
  notes: [],
  adjustments: [],
  notificationPermissionAsked: false,
  installedHintDismissed: false,
};

// Jan 2026 from official CSV: 8 days + 7 nights = 15 × 12h @ £18.50
const jan = calculateMonthPay(baseData, 2026, 0);
assert.equal(jan.scheduledDays, 8);
assert.equal(jan.scheduledNights, 7);
assert.equal(jan.scheduledHours, 15 * 12);
assert.equal(jan.basePay, 15 * 12 * 18.5);
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

console.log("pay tests passed");
