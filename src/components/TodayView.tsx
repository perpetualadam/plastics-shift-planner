"use client";

import { useEffect, useState } from "react";
import {
  formatLongDate,
  formatShiftTime,
  formatShortDate,
  getPrepTimes,
  getShiftForDate,
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

function findNextStart(today: ShiftDay, upcoming: ShiftDay[], now: Date) {
  const candidates = [today, ...upcoming].filter((s) => s.kind !== "off");
  for (const target of candidates) {
    const start = new Date(target.date);
    start.setHours(target.startHour ?? 0, 0, 0, 0);
    if (start.getTime() > now.getTime()) return { shift: target, at: start };
    if (isSameDay(target.date, now)) {
      const end =
        target.kind === "day"
          ? new Date(target.date.getFullYear(), target.date.getMonth(), target.date.getDate(), 18)
          : new Date(
              target.date.getFullYear(),
              target.date.getMonth(),
              target.date.getDate() + 1,
              6,
            );
      if (now.getTime() < end.getTime()) return { shift: target, at: start };
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

  const today = getShiftForDate(now);
  const key = dateKeyFrom(now);
  const savedNote = data.notes.find((n) => n.dateKey === key)?.text ?? "";
  const note = noteDraft ?? savedNote;

  const upcoming = getUpcomingShifts(now, 6);
  const monthPay = calculateMonthPay(data, now.getFullYear(), now.getMonth());

  const wakeTarget = today.kind !== "off" ? today : upcoming[0];
  const wake = wakeTarget
    ? getWakeTime(
        wakeTarget.date,
        wakeTarget.kind === "day"
          ? data.settings.dayWakeLeadMinutes
          : data.settings.nightWakeLeadMinutes,
      )
    : null;

  const nextStart = findNextStart(today, upcoming, now);

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
          const prep = wakeTarget ? getPrepTimes(wakeTarget.date) : null;
          if (!prep) return null;
          return (
            <ul className="prep-list">
              {prep.dogFeed && <li>Dog feed {prep.dogFeed}</li>}
              {prep.getDressed && <li>Get dressed {prep.getDressed}</li>}
              {prep.leaveForWork && <li>Leave {prep.leaveForWork}</li>}
              {prep.targetArrival && <li>Arrive {prep.targetArrival}</li>}
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
          <p className="stat-label">Hours</p>
          <p className="stat-value">
            {monthPay.scheduledHours}
            <span>h</span>
          </p>
        </div>
        <div>
          <p className="stat-label">Est. pay</p>
          <p className="stat-value money">{money(monthPay.total, data.settings.currency)}</p>
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
