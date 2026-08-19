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

type FiredMap = Record<string, number>;

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
  // prune older than 14 days
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(map)) {
    if (v < cutoff) delete map[k];
  }
  localStorage.setItem(FIRED_KEY, JSON.stringify(map));
}

function wasFired(id: string): boolean {
  return Boolean(loadFired()[id]);
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

function parseTimeOnDate(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = startOfLocalDay(day);
  d.setHours(h, m, 0, 0);
  return d;
}

export type ScheduledEvent = {
  id: string;
  at: Date;
  type: "reminder" | "wake";
  title: string;
  body: string;
};

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
        if (at.getTime() < from.getTime() - 60_000) continue;
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
      if (!at || at.getTime() < from.getTime() - 60_000) continue;
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

export function isAlarmRinging(): boolean {
  return ringing;
}

export async function fireEvent(
  event: ScheduledEvent,
  settings: AppSettings,
): Promise<void> {
  if (wasFired(event.id)) return;
  markFired(event.id);
  showNotification(event.title, event.body, event.id);

  if (event.type === "wake") {
    ringing = true;
    window.dispatchEvent(new CustomEvent("shift-alarm-ring", { detail: event }));
    try {
      // Loop sound for ~45s while ringing
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

export function startNotificationWatchdog(getSettings: () => AppSettings): () => void {
  if (watchdog) window.clearInterval(watchdog);

  const tick = () => {
    const settings = getSettings();
    const now = new Date();
    const events = buildSchedule(settings, new Date(now.getTime() - 30_000));
    for (const event of events) {
      const delta = event.at.getTime() - now.getTime();
      if (delta <= 0 && delta > -90_000 && !wasFired(event.id)) {
        void fireEvent(event, settings);
      }
    }

    // Persist next few for service worker
    const upcoming = events.filter((e) => e.at.getTime() >= now.getTime()).slice(0, 20);
    try {
      localStorage.setItem(
        "plastics-b-shift-schedule",
        JSON.stringify(
          upcoming.map((e) => ({
            id: e.id,
            at: e.at.toISOString(),
            type: e.type,
            title: e.title,
            body: e.body,
          })),
        ),
      );
    } catch {
      // ignore
    }

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SYNC_SCHEDULE",
        events: upcoming.map((e) => ({
          id: e.id,
          at: e.at.toISOString(),
          type: e.type,
          title: e.title,
          body: e.body,
        })),
      });
    }
  };

  tick();
  watchdog = window.setInterval(tick, 20_000);
  return () => {
    if (watchdog) window.clearInterval(watchdog);
    watchdog = null;
  };
}

export function nextEventSummary(settings: AppSettings): ScheduledEvent | null {
  const events = buildSchedule(settings, new Date());
  return events[0] ?? null;
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
