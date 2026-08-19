"use client";

import { useMemo, useState } from "react";
import {
  cycleLegend,
  formatShiftTime,
  getMonthShifts,
  getShiftForDate,
  isSameDay,
  toDateKey,
} from "@/lib/rota";
import { useAppData } from "@/hooks/useAppData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const { data } = useAppData();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const shifts = useMemo(() => getMonthShifts(year, month), [year, month]);
  const selectedShift = getShiftForDate(selected);

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const blanks = Array.from({ length: firstDow });

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const note = data.notes.find((n) => n.dateKey === toDateKey(selected))?.text;
  const ot = data.overtime.filter((o) => o.dateKey === toDateKey(selected));

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
                className={`cal-cell kind-${s.kind} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                onClick={() => setSelected(s.date)}
              >
                <span className="cal-num">{s.date.getDate()}</span>
                <span className="cal-tag">
                  {s.kind === "day" ? "D" : s.kind === "night" ? "N" : "·"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="legend">
          {cycleLegend().map((item) => (
            <span key={item.kind} className={`legend-item kind-${item.kind}`}>
              {item.label}
            </span>
          ))}
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
