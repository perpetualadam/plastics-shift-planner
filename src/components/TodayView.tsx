"use client";

import { useEffect, useState } from "react";
import {
  formatLongDate,
  formatShiftTime,
  formatShortDate,
  getPrepTimes,
  getShiftEnd,
  getShiftForDate,
  getShiftStart,
  getUpcomingShifts,
  getWakeTime,
  isSameDay,
  type ShiftDay,
} from "@/lib/rota";
import { useAppData } from "@/hooks/useAppData";
import { calculateMonthPay, money } from "@/lib/pay";

function countdown(to: Date, now: Date): string {
  const ms = Math.max(0, to.getTime() - now.getTime());
  const totalMins = Math.floor(ms / 60000);
  const d = Math.floor(totalMins / (60 * 24));
  const h = Math.floor((totalMins % (60 * 24)) / 60);
  const m = totalMins % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dateKeyFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function findNextStart(
  today: ShiftDay,
  upcoming: ShiftDay[],
  now: Date,
  overrides: Parameters<typeof getShiftStart>[1],
  settings: Parameters<typeof getShiftStart>[2],
) {
  const candidates = [today, ...upcoming].filter((s) => s.kind !== "off");
  for (const target of candidates) {
    const start = getShiftStart(target.date, overrides, settings);
    if (!start) continue;
    if (start.getTime() > now.getTime()) return { shift: target, at: start };
    if (isSameDay(target.date, now)) {
      const end = getShiftEnd(target.date, overrides, settings);
      if (end && now.getTime() < end.getTime()) return { shift: target, at: start };
    }
  }
  return null;
}

export function TodayView() {
  const { data, setDayNote, addOvertime } = useAppData();
  const [now, setNow] = useState(() => new Date());
  const [otHours, setOtHours] = useState("2");
  const [otNote, setOtNote] = useState("");
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const overrides = data.rotaOverrides;
  const settings = data.settings;
  const today = getShiftForDate(now, overrides, settings);
  const key = dateKeyFrom(now);
  const savedNote = data.notes.find((n) => n.dateKey === key)?.text ?? "";
  const note = noteDraft ?? savedNote;

  const upcoming = getUpcomingShifts(now, 6, overrides, settings);
  const monthPay = calculateMonthPay(data, now.getFullYear(), now.getMonth());

  const wakeTarget = today.kind !== "off" ? today : upcoming[0];
  const wake = wakeTarget
    ? getWakeTime(
        wakeTarget.date,
        wakeTarget.kind === "day"
          ? settings.dayWakeLeadMinutes
          : settings.nightWakeLeadMinutes,
        wakeTarget.kind === "day" ? settings.dayWakeTime : settings.nightWakeTime,
        overrides,
        settings,
      )
    : null;

  const nextStart = findNextStart(today, upcoming, now, overrides, settings);

  return (
    <div className="stack">
      <section className={`hero-shift kind-${today.kind}`}>
        <p className="hero-date">{formatLongDate(now)}</p>
        <h1 className="hero-title">{today.label}</h1>
        <p className="hero-time">{formatShiftTime(today)}</p>
        {nextStart && nextStart.at.getTime() > now.getTime() && (
          <p className="hero-count">
            Starts in <strong>{countdown(nextStart.at, now)}</strong>
          </p>
        )}
        {nextStart && nextStart.at.getTime() <= now.getTime() && today.kind !== "off" && (
          <p className="hero-count">On shift now</p>
        )}
        {wake && wake.getTime() > now.getTime() && (
          <p className="hero-wake">
            Wake alarm ·{" "}
            {wake.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            {wakeTarget && !isSameDay(wakeTarget.date, now) && (
              <span> for {formatShortDate(wakeTarget.date)}</span>
            )}
          </p>
        )}
        {(() => {
          const prep = wakeTarget ? getPrepTimes(wakeTarget.date, overrides, settings) : null;
          if (!prep || prep.steps.length === 0) return null;
          return (
            <ul className="prep-list">
              {prep.steps.map((step) => (
                <li key={step.id}>
                  {step.label} {step.time}
                </li>
              ))}
            </ul>
          );
        })()}
      </section>

      <section className="panel stats-row">
        <div>
          <p className="stat-label">This month</p>
          <p className="stat-value">
            {monthPay.scheduledDays + monthPay.scheduledNights}
            <span> days</span>
          </p>
        </div>
        <div>
          <p className="stat-label">Paid hrs</p>
          <p className="stat-value">
            {Number(monthPay.paidHours.toFixed(2))}
            <span>h</span>
          </p>
        </div>
        <div>
          <p className="stat-label">Est. pay</p>
          <p className="stat-value money">{money(monthPay.total, settings.currency)}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Coming up</h2>
        </div>
        <ul className="shift-list">
          {upcoming.map((s: ShiftDay) => (
            <li key={s.date.toISOString()} className={`shift-row kind-${s.kind}`}>
              <div>
                <p className="shift-label">{s.label}</p>
                <p className="shift-meta">{formatShortDate(s.date)}</p>
              </div>
              <p className="shift-hours">{formatShiftTime(s)}</p>
            </li>
          ))}
        </ul>
      </section>

      {today.kind !== "off" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Log overtime</h2>
          </div>
          <div className="form-row">
            <label>
              Hours
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={otHours}
                onChange={(e) => setOtHours(e.target.value)}
              />
            </label>
            <label className="grow">
              Note
              <input
                type="text"
                placeholder="Cover / handover / call-in"
                value={otNote}
                onChange={(e) => setOtNote(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const hours = Number(otHours);
              if (!hours || hours <= 0) return;
              addOvertime({
                dateKey: key,
                hours,
                note: otNote,
              });
              setOtNote("");
            }}
          >
            Add overtime
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Today&apos;s note</h2>
        </div>
        <textarea
          rows={3}
          placeholder="Handover, parking, PPE reminder…"
          value={note}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            setDayNote(now, note);
            setNoteDraft(null);
          }}
        />
      </section>
    </div>
  );
}
