import assert from "node:assert/strict";
import {
  getShiftForDate,
  countWorkDaysInRange,
  getWakeTime,
  toDateKey,
} from "../src/lib/rota";
import { ROTA_BY_DATE, ROTA_DATES } from "../src/lib/rotaData";

// CSV is source of truth — Jan 2026
assert.equal(getShiftForDate(new Date(2026, 0, 1)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 2)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 3)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 4)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 5)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 6)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 7)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 0, 8)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 0, 17)).kind, "night");

// User working Thu 20 Aug 2026 (day shift)
assert.equal(getShiftForDate(new Date(2026, 7, 19)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 7, 20)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 7, 21)).kind, "day");

const wake = getWakeTime(new Date(2026, 7, 20), 90);
assert.ok(wake);
assert.equal(wake.getHours(), 4);
assert.equal(wake.getMinutes(), 49);

assert.equal(ROTA_DATES.length, 182);
assert.equal(ROTA_BY_DATE["2026-08-20"]?.kind, "day");

const jan = countWorkDaysInRange(new Date(2026, 0, 1), new Date(2026, 0, 31));
assert.equal(jan.days + jan.nights + jan.off, 31);
assert.equal(jan.days, 8); // CSV Jan day shifts
assert.equal(jan.nights, 7); // CSV Jan night shifts
assert.equal(jan.off, 16);

// Every CSV date must resolve to working
for (const key of ROTA_DATES) {
  const [y, m, d] = key.split("-").map(Number);
  const shift = getShiftForDate(new Date(y, m - 1, d));
  assert.equal(shift.kind, ROTA_BY_DATE[key].kind, key);
  assert.equal(toDateKey(shift.date), key);
}

console.log("rota tests passed");
