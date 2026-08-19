"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  buildSchedule,
  ensureNotificationPermission,
  nextEventSummary,
} from "@/lib/notifications";
import { SOUND_OPTIONS, playAlarmSound } from "@/lib/sounds";
import type { AlarmSoundId } from "@/lib/storage";

export function AlarmsView() {
  const { data, updateSettings } = useAppData();
  const [status, setStatus] = useState<string>("");
  const upcoming = useMemo(() => buildSchedule(data.settings).slice(0, 12), [data.settings]);
  const next = useMemo(() => nextEventSummary(data.settings), [data.settings]);

  const toggleReminderTime = (time: string) => {
    const set = new Set(data.settings.reminderTimes);
    if (set.has(time)) set.delete(time);
    else set.add(time);
    const sorted = Array.from(set).sort();
    updateSettings({ reminderTimes: sorted.length ? sorted : ["17:00"] });
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Reminders</h2>
        </div>
        <p className="help">
          Day before a shift — default 5:00pm and 8:00pm so you can prep sleep and kit.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={data.settings.remindersEnabled}
            onChange={(e) => updateSettings({ remindersEnabled: e.target.checked })}
          />
          <span>Enable day-before reminders</span>
        </label>
        <div className="chip-row">
          {["17:00", "20:00", "12:00", "21:00"].map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${data.settings.reminderTimes.includes(t) ? "on" : ""}`}
              onClick={() => toggleReminderTime(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Wake alarms</h2>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={data.settings.wakeAlarmsEnabled}
            onChange={(e) => updateSettings({ wakeAlarmsEnabled: e.target.checked })}
          />
          <span>Enable wake-up alarms</span>
        </label>
        <div className="form-row wrap">
          <label>
            Day shift lead (min)
            <input
              type="number"
              min={15}
              step={15}
              value={data.settings.dayWakeLeadMinutes}
              onChange={(e) => updateSettings({ dayWakeLeadMinutes: Number(e.target.value) || 90 })}
            />
          </label>
          <label>
            Night shift lead (min)
            <input
              type="number"
              min={15}
              step={15}
              value={data.settings.nightWakeLeadMinutes}
              onChange={(e) =>
                updateSettings({ nightWakeLeadMinutes: Number(e.target.value) || 90 })
              }
            />
          </label>
        </div>
        <p className="help">
          Day (06:00) default wake ~{Math.floor((6 * 60 - data.settings.dayWakeLeadMinutes) / 60)}:
          {String((6 * 60 - data.settings.dayWakeLeadMinutes) % 60).padStart(2, "0")} · Night
          (18:00) default wake ~
          {String(Math.floor((18 * 60 - data.settings.nightWakeLeadMinutes) / 60)).padStart(2, "0")}:
          {String((18 * 60 - data.settings.nightWakeLeadMinutes) % 60).padStart(2, "0")}
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
              className={`sound-card ${data.settings.alarmSound === s.id ? "on" : ""}`}
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
            value={data.settings.alarmVolume}
            onChange={(e) => updateSettings({ alarmVolume: Number(e.target.value) })}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await playAlarmSound(
              data.settings.alarmSound as AlarmSoundId,
              data.settings.alarmVolume,
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
