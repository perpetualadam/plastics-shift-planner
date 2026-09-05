"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  buildSchedule,
  ensureNotificationPermission,
  nextEventSummary,
} from "@/lib/notifications";
import { SOUND_OPTIONS, playAlarmSound } from "@/lib/sounds";
import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  wakeLeadFromTemplate,
} from "@/lib/shiftConfig";
import { isValidHhmm, sanitizeHhmm } from "@/lib/time";
import { CSV_DEFAULT_WAKE, type AlarmSoundId } from "@/lib/storage";

export function AlarmsView() {
  const { data, updateSettings } = useAppData();
  const [status, setStatus] = useState<string>("");
  const [customReminder, setCustomReminder] = useState("19:00");
  const settings = data.settings;
  const upcoming = useMemo(
    () => buildSchedule(settings, new Date(), data.rotaOverrides).slice(0, 12),
    [settings, data.rotaOverrides],
  );
  const next = useMemo(
    () => nextEventSummary(settings, data.rotaOverrides),
    [settings, data.rotaOverrides],
  );

  const toggleReminderTime = (time: string) => {
    const set = new Set(settings.reminderTimes);
    if (set.has(time)) set.delete(time);
    else set.add(time);
    const sorted = Array.from(set).sort();
    updateSettings({ reminderTimes: sorted.length ? sorted : [settings.reminderTimes[0] || "17:00"] });
  };

  const addCustomReminder = () => {
    if (!isValidHhmm(customReminder)) return;
    const time = sanitizeHhmm(customReminder);
    if (settings.reminderTimes.includes(time)) return;
    updateSettings({ reminderTimes: [...settings.reminderTimes, time].sort() });
  };

  const reminderChips = Array.from(
    new Set(["17:00", "20:00", "12:00", "21:00", ...settings.reminderTimes]),
  ).sort();

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Reminders</h2>
        </div>
        <p className="help">
          Day before a shift — pick any times so you can prep sleep and kit.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.remindersEnabled}
            onChange={(e) => updateSettings({ remindersEnabled: e.target.checked })}
          />
          <span>Enable day-before reminders</span>
        </label>
        <div className="chip-row">
          {reminderChips.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${settings.reminderTimes.includes(t) ? "on" : ""}`}
              onClick={() => toggleReminderTime(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="form-row wrap" style={{ marginTop: 12 }}>
          <label>
            Custom time
            <input
              type="time"
              value={customReminder}
              onChange={(e) => setCustomReminder(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={addCustomReminder}>
            Add time
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Wake alarms</h2>
        </div>
        <p className="help">
          Set wake times for {settings.dayShift.label.toLowerCase()} and{" "}
          {settings.nightShift.label.toLowerCase()}. Defaults follow your shift start times.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.wakeAlarmsEnabled}
            onChange={(e) => updateSettings({ wakeAlarmsEnabled: e.target.checked })}
          />
          <span>Enable wake-up alarms</span>
        </label>
        <div className="form-row wrap">
          <label>
            {settings.dayShift.label} wake
            <input
              type="time"
              value={settings.dayWakeTime || settings.dayShift.wakeTime}
              onChange={(e) => {
                const dayWakeTime = e.target.value || settings.dayShift.wakeTime;
                const dayShift = { ...settings.dayShift, wakeTime: dayWakeTime };
                updateSettings({
                  dayWakeTime,
                  dayShift,
                  dayWakeLeadMinutes: wakeLeadFromTemplate(dayShift),
                });
              }}
            />
          </label>
          <label>
            {settings.nightShift.label} wake
            <input
              type="time"
              value={settings.nightWakeTime || settings.nightShift.wakeTime}
              onChange={(e) => {
                const nightWakeTime = e.target.value || settings.nightShift.wakeTime;
                const nightShift = { ...settings.nightShift, wakeTime: nightWakeTime };
                updateSettings({
                  nightWakeTime,
                  nightShift,
                  nightWakeLeadMinutes: wakeLeadFromTemplate(nightShift),
                });
              }}
            />
          </label>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className="chip"
            onClick={() => {
              const dayShift = {
                ...settings.dayShift,
                wakeTime: DEFAULT_DAY_SHIFT.wakeTime,
              };
              const nightShift = {
                ...settings.nightShift,
                wakeTime: DEFAULT_NIGHT_SHIFT.wakeTime,
              };
              updateSettings({
                dayWakeTime: CSV_DEFAULT_WAKE.day,
                nightWakeTime: CSV_DEFAULT_WAKE.night,
                dayShift,
                nightShift,
                dayWakeLeadMinutes: wakeLeadFromTemplate(dayShift),
                nightWakeLeadMinutes: wakeLeadFromTemplate(nightShift),
              });
            }}
          >
            Reset wake defaults
          </button>
        </div>
        <p className="help">
          {settings.dayShift.label} starts {settings.dayShift.start} · {settings.nightShift.label}{" "}
          starts {settings.nightShift.start}. Change start times in Settings → Shift times.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Alarm sound</h2>
        </div>
        <div className="sound-grid">
          {SOUND_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sound-card ${settings.alarmSound === s.id ? "on" : ""}`}
              onClick={() => updateSettings({ alarmSound: s.id })}
            >
              <strong>{s.label}</strong>
              <span>{s.description}</span>
            </button>
          ))}
        </div>
        <label>
          Volume
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={settings.alarmVolume}
            onChange={(e) => updateSettings({ alarmVolume: Number(e.target.value) })}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await playAlarmSound(
              settings.alarmSound as AlarmSoundId,
              settings.alarmVolume,
              1,
            );
          }}
        >
          Preview sound
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Permissions</h2>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            const p = await ensureNotificationPermission();
            setStatus(p === "granted" ? "Notifications allowed." : `Permission: ${p}`);
          }}
        >
          Request notification access
        </button>
        {status && <p className="help">{status}</p>}
        <p className="help">
          Tip: keep the app installed on your home screen and open it after phone restarts so the
          alarm watchdog can arm. For hard wake-ups, also add phone calendar alerts from the
          upcoming list times.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Upcoming alerts</h2>
        </div>
        {next ? (
          <p className="next-alert">
            Next: <strong>{next.title}</strong> ·{" "}
            {next.at.toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : (
          <p className="help">No upcoming alerts with current settings.</p>
        )}
        <ul className="alert-list">
          {upcoming.map((e) => (
            <li key={e.id}>
              <span className={`badge ${e.type}`}>{e.type}</span>
              <div>
                <strong>{e.title}</strong>
                <p>
                  {e.at.toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
