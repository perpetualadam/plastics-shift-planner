import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseShiftCsv, splitCsvLine, ShiftCsvParseError } from "../src/lib/parseShiftCsv";
import { getShiftForDate } from "../src/lib/rota";
import { ROTA_BY_DATE, ROTA_DATES } from "../src/lib/rotaData";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvText = readFileSync(join(root, "data/b-shift-2026.csv"), "utf8");

// Quoted field with comma
assert.deepEqual(splitCsvLine('a,"b, c",d'), ["a", "b, c", "d"]);

const parsed = parseShiftCsv(csvText);
assert.equal(parsed.dates.length, ROTA_DATES.length);
assert.equal(parsed.byDate["2026-08-20"]?.kind, "day");
assert.equal(parsed.byDate["2026-08-20"]?.morningDogFeed, "04:49");
assert.equal(parsed.byDate["2026-01-17"]?.kind, "night");
assert.deepEqual(parsed.byDate["2026-01-17"]?.previousDayWarnings, ["17:00", "20:00"]);

// Round-trip: every baked entry matches CSV parse
for (const key of ROTA_DATES) {
  const baked = ROTA_BY_DATE[key];
  const fromCsv = parsed.byDate[key];
  assert.ok(fromCsv, key);
  assert.equal(fromCsv.kind, baked.kind, key);
  assert.equal(fromCsv.start, baked.start, key);
  assert.equal(fromCsv.end, baked.end, key);
}

// Uploaded base replaces baked schedule for a date that was off
const tiny = parseShiftCsv(`Date,Shift,Shift start,Shift end,Previous day warnings,Morning dog feed,Afternoon dog feed + reset,Get dressed,Leave for work,Target arrival
2026-08-19,DAY,06:00,18:00,"17:00, 20:00",04:49,,04:54,05:09,05:45
`);
assert.equal(getShiftForDate(new Date(2026, 7, 19)).kind, "off"); // baked
assert.equal(getShiftForDate(new Date(2026, 7, 19), undefined, tiny.byDate).kind, "day");

assert.throws(() => parseShiftCsv("nope"), ShiftCsvParseError);
assert.throws(
  () =>
    parseShiftCsv(`Date,Shift
2026-01-01,LUNCH`),
  ShiftCsvParseError,
);

console.log("csv parse tests passed");
