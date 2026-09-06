import assert from "node:assert/strict";
import {
  applyRotaKind,
  formatShiftTime,
  getBaseKind,
  getCycleKind,
  getShiftEnd,
  getShiftForDate,
  getShiftStart,
  getWakeTime,
} from "../src/lib/rota";
import {
  CYCLE_PRESETS,
  DEFAULT_AFTERS_SHIFT,
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  matchingPreset,
  nextKind,
  sanitizeCycle,
  sanitizeShiftTemplate,
} from "../src/lib/shiftConfig";
import { hoursBetween, sanitizeHhmm } from "../src/lib/time";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "../src/lib/storage";

/** Mimic Settings keystroke updates: each char is saved through the sanitizer. */
function typeSettingsField(
  field: "plantName" | "shiftName",
  text: string,
  start = "",
): string {
  let current = start;
  for (const ch of text) {
    current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      [field]: current + ch,
    } as Partial<AppSettings>)[field];
  }
  return current;
}

function typeShiftLabel(text: string, start = ""): string {
  let current = start;
  for (const ch of text) {
    current = sanitizeShiftTemplate(
      { ...DEFAULT_DAY_SHIFT, label: current + ch },
      DEFAULT_DAY_SHIFT,
    ).label;
  }
  return current;
}

function typePrepLabel(text: string, start = ""): string {
  let current = start;
  for (const ch of text) {
    current = sanitizeShiftTemplate(
      {
        ...DEFAULT_DAY_SHIFT,
        prepSteps: [{ id: "dressed", label: current + ch, time: "04:54" }],
      },
      DEFAULT_DAY_SHIFT,
    ).prepSteps[0].label;
  }
  return current;
}

assert.equal(hoursBetween("06:00", "18:00"), 12);
assert.equal(hoursBetween("18:00", "06:00"), 12);
assert.equal(hoursBetween("07:00", "15:00"), 8);
assert.equal(sanitizeHhmm("7:30"), "07:30");
assert.equal(sanitizeHhmm("25:00", "06:00"), "06:00");
assert.equal(sanitizeHhmm("nope", "04:49"), "04:49");

const cleaned = normalizeSettings({
  plantName: "   ",
  shiftName: "",
  hourlyRate: Number.NaN,
  currency: "pound",
  reminderTimes: ["25:00", "07:30", "07:30", "nope"] as unknown as string[],
  rotaSource: "bogus" as unknown as "csv",
  dayShift: { start: "99:99" } as unknown as typeof DEFAULT_DAY_SHIFT,
  attendanceBonusAmount: -5,
});
assert.equal(cleaned.plantName, "");
assert.equal(cleaned.shiftName, "");

assert.equal(typeSettingsField("plantName", "Acme Foods"), "Acme Foods");
assert.equal(typeSettingsField("shiftName", "B Shift"), "B Shift");
assert.equal(normalizeSettings({ plantName: "Acme " }).plantName, "Acme ");
assert.equal(typeShiftLabel("Day shift"), "Day shift");
assert.equal(typePrepLabel("Get dressed"), "Get dressed");
assert.equal(
  sanitizeShiftTemplate(
    { ...DEFAULT_DAY_SHIFT, prepSteps: [{ id: "x", label: "Get ", time: "04:54" }] },
    DEFAULT_DAY_SHIFT,
  ).prepSteps[0].label,
  "Get ",
);
assert.equal(cleaned.hourlyRate, DEFAULT_SETTINGS.hourlyRate);
assert.equal(cleaned.currency, "GBP");
assert.deepEqual(cleaned.reminderTimes, ["07:30"]);
assert.equal(cleaned.rotaSource, "csv");
assert.equal(cleaned.dayShift.start, "06:00");
assert.equal(cleaned.attendanceBonusAmount, 0);

const otherCompany = normalizeSettings({
  plantName: "Acme Foods",
  shiftName: "A Shift",
  currency: "USD",
  rotaSource: "cycle",
  workStartDate: "2026-03-02",
  cycle: { anchorDate: "2026-03-02", sequence: ["day", "day", "off"] },
  dayShift: {
    ...DEFAULT_DAY_SHIFT,
    label: "Morning",
    start: "07:00",
    end: "15:00",
    wakeTime: "05:30",
  },
  nightShift: {
    ...DEFAULT_NIGHT_SHIFT,
    label: "Evening",
    start: "15:00",
    end: "23:00",
    wakeTime: "13:30",
  },
});
assert.equal(otherCompany.plantName, "Acme Foods");
assert.equal(otherCompany.rotaSource, "cycle");

const monday = new Date(2026, 2, 2); // 2 Mar 2026
assert.equal(getCycleKind(monday, otherCompany.cycle), "day");
assert.equal(getCycleKind(new Date(2026, 2, 3), otherCompany.cycle), "day");
assert.equal(getCycleKind(new Date(2026, 2, 4), otherCompany.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 5), otherCompany.cycle), "day");

assert.equal(getBaseKind(monday, otherCompany), "day");
assert.equal(getBaseKind(monday, { ...otherCompany, rotaSource: "manual" }), "off");

const customDay = getShiftForDate(new Date(2026, 7, 20), {}, otherCompany);
assert.ok(customDay.kind === "day" || customDay.kind === "night" || customDay.kind === "off");
const templatedCsv = getShiftForDate(new Date(2026, 7, 20), {}, {
  ...DEFAULT_SETTINGS,
  dayShift: otherCompany.dayShift,
  nightShift: otherCompany.nightShift,
});
assert.equal(templatedCsv.kind, "day");
assert.equal(templatedCsv.entry?.start, "07:00");
assert.equal(templatedCsv.entry?.end, "15:00");
assert.equal(formatShiftTime(templatedCsv), "07:00 – 15:00");
assert.equal(templatedCsv.label, "Morning");

const customStart = getShiftStart(new Date(2026, 7, 20), {}, {
  ...DEFAULT_SETTINGS,
  dayShift: otherCompany.dayShift,
});
assert.ok(customStart);
assert.equal(customStart.getHours(), 7);
assert.equal(customStart.getMinutes(), 0);

const customEnd = getShiftEnd(new Date(2026, 7, 20), {}, {
  ...DEFAULT_SETTINGS,
  dayShift: otherCompany.dayShift,
});
assert.ok(customEnd);
assert.equal(customEnd.getHours(), 15);

const nightEnd = getShiftEnd(new Date(2026, 0, 17), {}, DEFAULT_SETTINGS);
assert.ok(nightEnd);
assert.equal(nightEnd.getDate(), 18);
assert.equal(nightEnd.getHours(), 6);

const wake = getWakeTime(new Date(2026, 7, 20), 90, null, {}, {
  ...DEFAULT_SETTINGS,
  dayShift: { ...DEFAULT_DAY_SHIFT, wakeTime: "05:15" },
  dayWakeTime: "05:15",
});
assert.ok(wake);
assert.equal(wake.getHours(), 5);
assert.equal(wake.getMinutes(), 15);

let overrides = applyRotaKind({}, new Date(2026, 2, 4), "night", otherCompany);
assert.equal(getShiftForDate(new Date(2026, 2, 4), overrides, otherCompany).kind, "night");
overrides = applyRotaKind(overrides, new Date(2026, 2, 4), "off", otherCompany);
assert.equal(overrides["2026-03-04"], undefined);

const tmpl = sanitizeShiftTemplate({ start: "07:00", label: "" }, DEFAULT_DAY_SHIFT);
assert.equal(tmpl.label, DEFAULT_DAY_SHIFT.label);
assert.equal(tmpl.start, "07:00");
assert.equal(tmpl.end, DEFAULT_DAY_SHIFT.end);

const cycle = sanitizeCycle({ anchorDate: "nope", sequence: ["day", "banana", "off"] });
assert.equal(cycle.anchorDate, "2026-01-05");
assert.deepEqual(cycle.sequence, ["day", "off"]);

const emptyCycle = sanitizeCycle({ sequence: [] });
assert.ok(emptyCycle.sequence.length > 0);

const aftersKept = sanitizeCycle({
  anchorDate: "2026-03-02",
  sequence: ["day", "afters", "night", "off"],
});
assert.deepEqual(aftersKept.sequence, ["day", "afters", "night", "off"]);
assert.equal(nextKind("day"), "afters");
assert.equal(nextKind("afters"), "night");
assert.equal(nextKind("night"), "off");
assert.equal(nextKind("off"), "day");

const continental = CYCLE_PRESETS.find((p) => p.id === "continental");
assert.ok(continental);
assert.equal(matchingPreset(continental.sequence)?.id, "continental");
const continentalSettings: AppSettings = normalizeSettings({
  rotaSource: "cycle",
  cycle: { anchorDate: "2026-03-02", sequence: [...continental.sequence] },
});
assert.equal(getCycleKind(new Date(2026, 2, 2), continentalSettings.cycle), "day");
assert.equal(getCycleKind(new Date(2026, 2, 3), continentalSettings.cycle), "day");
assert.equal(getCycleKind(new Date(2026, 2, 4), continentalSettings.cycle), "afters");
assert.equal(getCycleKind(new Date(2026, 2, 5), continentalSettings.cycle), "afters");
assert.equal(getCycleKind(new Date(2026, 2, 6), continentalSettings.cycle), "night");
assert.equal(getCycleKind(new Date(2026, 2, 7), continentalSettings.cycle), "night");
assert.equal(getCycleKind(new Date(2026, 2, 8), continentalSettings.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 9), continentalSettings.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 10), continentalSettings.cycle), "day");

const aftersShift = getShiftForDate(new Date(2026, 2, 4), {}, continentalSettings);
assert.equal(aftersShift.kind, "afters");
assert.equal(aftersShift.entry?.start, DEFAULT_AFTERS_SHIFT.start);
assert.equal(aftersShift.entry?.end, DEFAULT_AFTERS_SHIFT.end);
assert.equal(formatShiftTime(aftersShift), "14:00 – 22:00");
assert.equal(aftersShift.label, "Afters");

const fourNights = CYCLE_PRESETS.find((p) => p.id === "4-4-nights");
assert.ok(fourNights);
const nightRota: AppSettings = normalizeSettings({
  rotaSource: "cycle",
  cycle: { anchorDate: "2026-03-02", sequence: [...fourNights.sequence] },
});
assert.equal(getCycleKind(new Date(2026, 2, 2), nightRota.cycle), "night");
assert.equal(getCycleKind(new Date(2026, 2, 5), nightRota.cycle), "night");
assert.equal(getCycleKind(new Date(2026, 2, 6), nightRota.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 9), nightRota.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 10), nightRota.cycle), "night");

const altDays = CYCLE_PRESETS.find((p) => p.id === "alt-days");
assert.ok(altDays);
const altRota: AppSettings = normalizeSettings({
  rotaSource: "cycle",
  cycle: { anchorDate: "2026-03-02", sequence: [...altDays.sequence] },
});
assert.equal(getCycleKind(new Date(2026, 2, 2), altRota.cycle), "day");
assert.equal(getCycleKind(new Date(2026, 2, 3), altRota.cycle), "off");
assert.equal(getCycleKind(new Date(2026, 2, 4), altRota.cycle), "day");

const sixTwo = CYCLE_PRESETS.find((p) => p.id === "continental-6-2");
assert.ok(sixTwo);
assert.equal(sixTwo.sequence.length, 26);
assert.equal(sixTwo.sequence.filter((k) => k === "afters").length, 6);
assert.equal(sixTwo.sequence.filter((k) => k === "night").length, 6);
assert.equal(sixTwo.sequence.filter((k) => k === "off").length, 8);

for (const preset of CYCLE_PRESETS) {
  assert.ok(preset.sequence.length > 0, preset.id);
  assert.ok(preset.sequence.every((k) => k === "day" || k === "afters" || k === "night" || k === "off"), preset.id);
  assert.equal(matchingPreset(preset.sequence)?.id, preset.id, preset.id);
}

const aftersWake = getWakeTime(new Date(2026, 2, 4), 71, null, {}, continentalSettings);
assert.ok(aftersWake);
assert.equal(aftersWake.getHours(), 12);
assert.equal(aftersWake.getMinutes(), 49);

console.log("config tests passed");
