import {
  formatShiftTime,
  getNextWorkingShift,
  getReminderDates,
  getShiftForDate,
  getWakeTime,
  addDays,
  toDateKey,
  startOfLocalDay,
} from "./rota";
import type { AppSettings } from "./storage";
import { playAlarmSound } from "./sounds";

const FIRED_KEY = "plastics-b-shift-fired-v1";
const SCHEDULE_KEY = "plastics-b-shift-schedule";

/** Fire window while the app/tab is actively polling. */
const LIVE_FIRE_MS = 90_000;
/**
 * When the app becomes visible again, still deliver anything due in this window
 * so a briefly locked phone / backgrounded tab can catch up.
 */
const CATCH_UP_MS = 30 * 60_000;

type FiredMap = Record<string, number>;

export type ScheduledEvent = {
  id: string;
  at: Date;
  type: "reminder" | "wake";
  title: string;
  body: string;
};

type WireEvent = {
  id: string;
  at: string;
  type: "reminder" | "wake";
  title: string;
  body: string;
};

function loadFired(): FiredMap {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}") as FiredMap;
  } catch {
    return {};
  }
}

function markFired(id: string): void {
  const map = loadFired();
  map[id] = Date.now();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(map)) {
    if (v < cutoff) delete map[k];
  }
  localStorage.setItem(FIRED_KEY, JSON.stringify(map));
}

function wasFired(id: string): boolean {
  return Boolean(loadFired()[id]);
}

function firedIds(): string[] {
  return Object.keys(loadFired());
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

export function showNotification(title: string, body: string, tag?: string): void {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, {
      body,
      tag: tag ?? `shift-${Date.now()}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore
  }
}

/** Immediate permission check — useful from the Alarms page. */
export async function sendTestNotification(): Promise<"ok" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = await ensureNotificationPermission();
  if (permission !== "granted") return "denied";
  showNotification(
    "Test alert — Plastics Shift",
    "Notifications are working. Wake alarms still need the app open or recently used; phones sleep service workers.",
    "plastics-test-alert",
  );
  return "ok";
}

function parseTimeOnDate(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = startOfLocalDay(day);
  d.setHours(h, m, 0, 0);
  return d;
}

export function buildSchedule(settings: AppSettings, from = new Date()): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  const today = startOfLocalDay(from);

  if (settings.remindersEnabled) {
    const reminderDays = getReminderDates(today, 45);
    for (const day of reminderDays) {
      const tomorrow = addDays(day, 1);
      const shift = getShiftForDate(tomorrow);
      for (const time of settings.reminderTimes) {
        const at = parseTimeOnDate(day, time);
        if (at.getTime() < from.getTime() - CATCH_UP_MS) continue;
        events.push({
          id: `reminder-${toDateKey(day)}-${time}`,
          at,
          type: "reminder",
          title: `${settings.shiftName} tomorrow`,
          body: `${shift.label} ${formatShiftTime(shift)} — get ready.`,
        });
      }
    }
  }

  if (settings.wakeAlarmsEnabled) {
    for (let i = 0; i < 30; i++) {
      const day = addDays(today, i);
      const shift = getShiftForDate(day);
      if (shift.kind === "off") continue;
      const lead =
        shift.kind === "day" ? settings.dayWakeLeadMinutes : settings.nightWakeLeadMinutes;
      const wakeOverride =
        shift.kind === "day" ? settings.dayWakeTime : settings.nightWakeTime;
      const at = getWakeTime(day, lead, wakeOverride);
      if (!at || at.getTime() < from.getTime() - CATCH_UP_MS) continue;
      events.push({
        id: `wake-${toDateKey(day)}-${wakeOverride || "default"}`,
        at,
        type: "wake",
        title: `Wake up — ${shift.label}`,
        body: `${settings.plantName} ${settings.shiftName}: ${formatShiftTime(shift)} starts soon.`,
      });
    }
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

let watchdog: number | null = null;
let ringing = false;
let getSettingsRef: (() => AppSettings) | null = null;

export function isAlarmRinging(): boolean {
  return ringing;
}

export async function fireEvent(
  event: ScheduledEvent,
  settings: AppSettings,
  options?: { ring?: boolean },
): Promise<void> {
  if (wasFired(event.id)) return;
  markFired(event.id);

  const lateBy = Date.now() - event.at.getTime();
  const isCatchUp = lateBy > LIVE_FIRE_MS;
  const title = isCatchUp ? `Missed: ${event.title}` : event.title;
  const body = isCatchUp
    ? `${event.body} (due ${event.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })})`
    : event.body;

  showNotification(title, body, event.id);

  const shouldRing = options?.ring ?? (event.type === "wake" && !isCatchUp);
  if (shouldRing && event.type === "wake") {
    ringing = true;
    window.dispatchEvent(new CustomEvent("shift-alarm-ring", { detail: { ...event, title, body } }));
    try {
      const until = Date.now() + 45_000;
      while (ringing && Date.now() < until) {
        await playAlarmSound(settings.alarmSound, settings.alarmVolume, 1);
      }
    } finally {
      ringing = false;
    }
  }
}

export function dismissAlarm(): void {
  ringing = false;
  window.dispatchEvent(new CustomEvent("shift-alarm-dismiss"));
}

function toWire(events: ScheduledEvent[]): WireEvent[] {
  return events.map((e) => ({
    id: e.id,
    at: e.at.toISOString(),
    type: e.type,
    title: e.title,
    body: e.body,
  }));
}

function persistAndSync(events: ScheduledEvent[]): void {
  const now = Date.now();
  // Keep near-due + upcoming so the SW can still fire if the page dies mid-window
  const forSw = events
    .filter((e) => e.at.getTime() >= now - LIVE_FIRE_MS)
    .slice(0, 30);
  const wire = toWire(forSw);

  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(wire));
  } catch {
    // ignore
  }

  const payload = {
    type: "SYNC_SCHEDULE" as const,
    events: wire,
    firedIds: firedIds(),
  };

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
  } else if (navigator.serviceWorker) {
    void navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage(payload);
    });
  }
}

function runTick(catchUp: boolean): void {
  if (!getSettingsRef) return;
  const settings = getSettingsRef();
  const now = new Date();
  const lookback = catchUp ? CATCH_UP_MS : LIVE_FIRE_MS;
  const events = buildSchedule(settings, new Date(now.getTime() - lookback));
  const windowMs = catchUp ? CATCH_UP_MS : LIVE_FIRE_MS;

  for (const event of events) {
    const delta = event.at.getTime() - now.getTime();
    if (delta <= 0 && delta > -windowMs && !wasFired(event.id)) {
      void fireEvent(event, settings, {
        // Only full wake ring for live (or near-live) hits
        ring: event.type === "wake" && delta > -LIVE_FIRE_MS,
      });
    }
  }

  persistAndSync(events);
}

export function startNotificationWatchdog(getSettings: () => AppSettings): () => void {
  if (watchdog) window.clearInterval(watchdog);
  getSettingsRef = getSettings;

  const tick = () => runTick(document.visibilityState === "visible");

  const onVisible = () => {
    if (document.visibilityState === "visible") runTick(true);
  };
  const onFocus = () => runTick(true);

  tick();
  watchdog = window.setInterval(tick, 15_000);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus);

  // Ask SW to check immediately after registration / reclaim
  if (navigator.serviceWorker) {
    void navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: "CHECK_NOW" });
    });
  }

  return () => {
    if (watchdog) window.clearInterval(watchdog);
    watchdog = null;
    getSettingsRef = null;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onFocus);
  };
}

export function nextEventSummary(settings: AppSettings): ScheduledEvent | null {
  const events = buildSchedule(settings, new Date());
  return events.find((e) => e.at.getTime() >= Date.now() - 60_000) ?? null;
}

export function tomorrowShiftPreview(from = new Date()) {
  const tomorrow = addDays(startOfLocalDay(from), 1);
  return getShiftForDate(tomorrow);
}

export function todayStatus(from = new Date()) {
  const today = getShiftForDate(from);
  const next = getNextWorkingShift(from);
  return { today, next };
}
