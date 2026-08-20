/**
 * Node-side checks for schedule building / catch-up windows.
 * (DOM notification APIs are not exercised here.)
 */
import assert from "node:assert/strict";
import { buildSchedule } from "../src/lib/notifications";
import { DEFAULT_SETTINGS } from "../src/lib/storage";

// Minimal localStorage stub for modules that touch it at runtime
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
};

const settings = {
  ...DEFAULT_SETTINGS,
  remindersEnabled: true,
  wakeAlarmsEnabled: true,
  reminderTimes: ["17:00", "20:00"],
  dayWakeTime: "04:49",
  nightWakeTime: "16:49",
};

// Mid-morning on a known day-shift day (20 Aug 2026)
const from = new Date(2026, 7, 20, 10, 0, 0);
const upcoming = buildSchedule(settings, from);
assert.ok(upcoming.length > 0, "expected upcoming events");
assert.ok(
  upcoming.every((e) => e.at.getTime() >= from.getTime() - 30 * 60_000),
  "events should be within catch-up lookback of `from`",
);

// Evening before a day shift should include 17:00 / 20:00 reminders
const eve = new Date(2026, 7, 19, 12, 0, 0);
const reminders = buildSchedule(settings, eve).filter((e) => e.type === "reminder");
const ids = new Set(reminders.map((e) => e.id));
assert.ok(ids.has("reminder-2026-08-19-17:00"));
assert.ok(ids.has("reminder-2026-08-19-20:00"));

// Wake for 20 Aug day shift
const wakes = buildSchedule(settings, eve).filter((e) => e.type === "wake");
assert.ok(wakes.some((e) => e.id.startsWith("wake-2026-08-20")));

console.log("notification schedule tests passed");
