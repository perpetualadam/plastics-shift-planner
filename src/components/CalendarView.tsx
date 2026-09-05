"use client";

import { useMemo, useState } from "react";
import {
  cycleLegend,
  formatShiftTime,
  getBaseKind,
  getMonthShifts,
  getShiftForDate,
  isSameDay,
  rotaSourceLabel,
  toDateKey,
  type ShiftKind,
} from "@/lib/rota";
import { useAppData } from "@/hooks/useAppData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_OPTIONS: { kind: ShiftKind; label: string }[] = [
  { kind: "day", label: "Day" },
  { kind: "night", label: "Night" },
  { kind: "off", label: "Off" },
];

export function CalendarView() {
  const { data, setRotaKind, clearRotaOverride } = useAppData();
  const overrides = data.rotaOverrides ?? {};
  const settings = data.settings;
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const shifts = useMemo(
    () => getMonthShifts(year, month, overrides, settings),
    [year, month, overrides, settings],
  );
  const selectedShift = getShiftForDate(selected, overrides, settings);
  const baseKind = getBaseKind(selected, settings);

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const blanks = Array.from({ length: firstDow });

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const note = data.notes.find((n) => n.dateKey === toDateKey(selected))?.text;
  const ot = data.overtime.filter((o) => o.dateKey === toDateKey(selected));
  const editCount = Object.keys(overrides).length;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head month-nav">
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            ‹
          </button>
          <h2>{monthLabel}</h2>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Next month"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            ›
          </button>
        </div>

        <div className="cal-grid head">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {blanks.map((_, i) => (
            <div key={`b-${i}`} className="cal-cell empty" />
          ))}
          {shifts.map((s) => {
            const isToday = isSameDay(s.date, new Date());
            const isSelected = isSameDay(s.date, selected);
            return (
              <button
                key={s.date.toISOString()}
                type="button"
                className={`cal-cell kind-${s.kind} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${s.overridden ? "overridden" : ""}`}
                onClick={() => setSelected(s.date)}
                aria-label={`${s.date.getDate()} ${s.label}${s.overridden ? ", edited" : ""}`}
              >
                <span className="cal-num">{s.date.getDate()}</span>
                <span className="cal-tag">
                  {s.kind === "day" ? "D" : s.kind === "night" ? "N" : "·"}
                  {s.overridden ? "*" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="legend">
          {cycleLegend(settings).map((item) => (
            <span key={item.kind} className={`legend-item kind-${item.kind}`}>
              {item.label}
            </span>
          ))}
          {editCount > 0 && (
            <span className="legend-item legend-edited">
              * Edited ({editCount})
            </span>
          )}
        </div>
      </section>

      <section className={`panel detail kind-${selectedShift.kind}`}>
        <p className="detail-kicker">
          {selected.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h3>{selectedShift.label}</h3>
        <p>{formatShiftTime(selectedShift)}</p>

        <div className="rota-edit" role="group" aria-label="Set shift type">
          <p className="rota-edit-label">Change shift</p>
          <div className="chip-row rota-kind-row">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                className={`chip ${selectedShift.kind === opt.kind ? "on" : ""}`}
                onClick={() => setRotaKind(selected, opt.kind)}
                aria-pressed={selectedShift.kind === opt.kind}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {selectedShift.overridden ? (
            <div className="rota-edit-meta">
              <p className="help">
                Edited from {rotaSourceLabel(settings.rotaSource)} (
                {baseKind === "off" ? "off" : baseKind}). Saved on this device.
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => clearRotaOverride(selected)}
              >
                Reset day
              </button>
            </div>
          ) : (
            <p className="help">
              Tap Day, Night, or Off to edit this date. Changes stay on this device and won&apos;t
              break the rest of the rota.
            </p>
          )}
        </div>

        {ot.length > 0 && (
          <p className="detail-ot">
            OT: {ot.reduce((s, o) => s + o.hours, 0)}h
            {ot[0]?.note ? ` · ${ot.map((o) => o.note).filter(Boolean).join(", ")}` : ""}
          </p>
        )}
        {note && <p className="detail-note">{note}</p>}
      </section>
    </div>
  );
}
