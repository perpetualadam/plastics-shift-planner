import assert from "node:assert/strict";
import {
  applyRotaKind,
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

// User working Thu 20 Aug 2026 (day shift) — first B-shift day on this job
assert.equal(getShiftForDate(new Date(2026, 7, 19)).kind, "off");
assert.equal(getShiftForDate(new Date(2026, 7, 20)).kind, "day");
assert.equal(getShiftForDate(new Date(2026, 7, 21)).kind, "day");
assert.equal(ROTA_BY_DATE["2026-08-18"], undefined);
assert.equal(ROTA_BY_DATE["2026-08-20"]?.kind, "day");
assert.equal(ROTA_BY_DATE["2026-08-20"]?.start, "06:00");
assert.equal(ROTA_BY_DATE["2026-08-20"]?.end, "18:00");

const wake = getWakeTime(new Date(2026, 7, 20), 90);
assert.ok(wake);
assert.equal(wake.getHours(), 4);
assert.equal(wake.getMinutes(), 49);

const customWake = getWakeTime(new Date(2026, 7, 20), 90, "05:15");
assert.ok(customWake);
assert.equal(customWake.getHours(), 5);
assert.equal(customWake.getMinutes(), 15);

const nightWake = getWakeTime(new Date(2026, 0, 17), 71);
assert.ok(nightWake);
assert.equal(nightWake.getHours(), 16);
assert.equal(nightWake.getMinutes(), 49);

const customNightWake = getWakeTime(new Date(2026, 0, 17), 71, "17:30");
assert.ok(customNightWake);
assert.equal(customNightWake.getHours(), 17);
assert.equal(customNightWake.getMinutes(), 30);

assert.equal(ROTA_DATES.length, 182);
assert.equal(ROTA_BY_DATE["2026-08-20"]?.kind, "day");

const jan = countWorkDaysInRange(new Date(2026, 0, 1), new Date(2026, 0, 31));
assert.equal(jan.days + jan.afters + jan.nights + jan.off, 31);
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

// Local overrides: mark a CSV day as off, an off day as night, then reset
const offDay = new Date(2026, 7, 20); // CSV day
const restDay = new Date(2026, 7, 19); // CSV off
let overrides = applyRotaKind({}, offDay, "off");
assert.equal(getShiftForDate(offDay, overrides).kind, "off");
assert.equal(getShiftForDate(offDay, overrides).overridden, true);
assert.equal(getShiftForDate(offDay).kind, "day"); // CSV unchanged without map

overrides = applyRotaKind(overrides, restDay, "night");
assert.equal(getShiftForDate(restDay, overrides).kind, "night");
assert.equal(getShiftForDate(restDay, overrides).entry?.start, "18:00");

const rangeEdited = countWorkDaysInRange(
  new Date(2026, 7, 19),
  new Date(2026, 7, 20),
  overrides,
);
assert.equal(rangeEdited.days, 0);
assert.equal(rangeEdited.nights, 1);
assert.equal(rangeEdited.off, 1);

const aftersOnly = applyRotaKind({}, restDay, "afters");
assert.equal(getShiftForDate(restDay, aftersOnly).kind, "afters");
assert.equal(getShiftForDate(restDay, aftersOnly).entry?.start, "14:00");
assert.equal(getShiftForDate(restDay, aftersOnly).entry?.end, "22:00");
const aftersRange = countWorkDaysInRange(
  new Date(2026, 7, 19),
  new Date(2026, 7, 20),
  aftersOnly,
);
assert.equal(aftersRange.afters, 1);
assert.equal(aftersRange.days, 1);

// Matching CSV clears the override entry
overrides = applyRotaKind(overrides, offDay, "day");
assert.equal(overrides["2026-08-20"], undefined);
assert.equal(getShiftForDate(offDay, overrides).overridden, false);

console.log("rota tests passed");
