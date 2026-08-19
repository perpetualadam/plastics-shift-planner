import assert from "node:assert/strict";
import {
  CYCLE_LENGTH,
  getCycleDay,
  getShiftForDate,
  countWorkDaysInRange,
} from "../src/lib/rota";

// Jan 2026 B shift — 2 days / 2 nights / 3 off
assert.equal(getShiftForDate(new Date(2026, 0, 1)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 2)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 3)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 4)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 5)).kind, "night");
assert.equal(getShiftForDate(new Date(2026, 0, 6)).kind, "night");
assert.equal(getShiftForDate(new Date(2026, 0, 7)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 8)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 9)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 10)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 11)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 12)).kind, "night");
assert.equal(getShiftForDate(new Date(2026, 0, 13)).kind, "night");
assert.equal(getShiftForDate(new Date(2026, 0, 14)).kind, "off");

assert.equal(CYCLE_LENGTH, 7);
assert.equal(getCycleDay(new Date(2026, 0, 3)), 0);

const jan = countWorkDaysInRange(new Date(2026, 0, 1), new Date(2026, 0, 31));
assert.equal(jan.days + jan.nights + jan.off, 31);
assert.ok(jan.hours > 0);
// Jan 2026: offs = 1–2, 7–9, 14–16, 21–23, 28–30 → 14; work days = 17
assert.equal(jan.off, 14);
assert.equal(jan.days + jan.nights, 17);

console.log("rota tests passed");
