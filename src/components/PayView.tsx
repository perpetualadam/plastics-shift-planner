"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  breakLabel,
  calculateMonthPay,
  comparePeriodPay,
  estimatedAnnual,
  money,
  totalHours,
  workedDaysInMonth,
  yearToDatePay,
  type PeriodKind,
} from "@/lib/pay";
import {
  ATTENDANCE_BONUS_AMOUNT,
  ATTENDANCE_BONUS_REASON_OPTIONS,
  attendanceBonusLossesForMonth,
  attendanceBonusReasonLabel,
  type AttendanceBonusLossReason,
  overtimeForMonth,
} from "@/lib/storage";
import { toDateKey } from "@/lib/rota";

export function PayView() {
  const {
    data,
    addOvertime,
    removeOvertime,
    addAdjustment,
    removeAdjustment,
    addAttendanceBonusLoss,
    setAttendanceBonusLossStatus,
    removeAttendanceBonusLoss,
  } = useAppData();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [otHours, setOtHours] = useState("2");
  const [otDate, setOtDate] = useState(() => toDateKey(new Date()));
  const [otNote, setOtNote] = useState("");
  const [adjLabel, setAdjLabel] = useState("Bonus");
  const [adjAmount, setAdjAmount] = useState("");
  const [lossReason, setLossReason] = useState<AttendanceBonusLossReason>("late");
  const [lossDate, setLossDate] = useState(() => toDateKey(new Date()));
  const [lossNote, setLossNote] = useState("");

  const todayKey = toDateKey(new Date());
  const anchor = useMemo(() => {
    if (period === "week") return weekAnchor;
    if (period === "year") return new Date(year, 0, 1);
    return new Date(year, month, 1);
  }, [period, weekAnchor, year, month]);

  const comparison = useMemo(
    () => comparePeriodPay(data, period, anchor),
    [data, period, anchor],
  );
  const pay = useMemo(() => calculateMonthPay(data, year, month), [data, year, month]);
  const ytd = yearToDatePay(data);
  const rows = useMemo(() => workedDaysInMonth(data, year, month), [data, year, month]);
  const otEntries = useMemo(() => overtimeForMonth(data, year, month), [data, year, month]);
  const lossEntries = useMemo(
    () => attendanceBonusLossesForMonth(data, year, month),
    [data, year, month],
  );
  const annual = estimatedAnnual(data);
  const bonusEarned = pay.attendanceBonus > 0;
  const activeLossCount = lossEntries.filter((l) => l.status === "active").length;

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + delta * 7);
    setWeekAnchor(d);
  };

  const shiftPeriod = (delta: number) => {
    if (period === "week") shiftWeek(delta);
    else if (period === "year") setYear((y) => y + delta);
    else shiftMonth(delta);
  };

  const periodTitle =
    period === "week" ? comparison.label : period === "year" ? String(year) : monthLabel;

  return (
    <div className="stack">
      <section className="panel pay-hero">
        <div className="chip-row period-tabs">
          {(
            [
              ["week", "Week"],
              ["month", "Month"],
              ["year", "Year"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${period === id ? "on" : ""}`}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="panel-head month-nav">
          <button type="button" className="btn btn-ghost" onClick={() => shiftPeriod(-1)}>
            ‹
          </button>
          <h2>{periodTitle}</h2>
          <button type="button" className="btn btn-ghost" onClick={() => shiftPeriod(1)}>
            ›
          </button>
        </div>
        <p className="pay-total">{money(comparison.actual.total, data.settings.currency)}</p>
        <p className="pay-sub">
          Actual wages to date in this {period} · potential{" "}
          {money(comparison.potential.total, data.settings.currency)} · {breakLabel(data.settings)}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Actual vs potential</h2>
        </div>
        <p className="pay-sub" style={{ marginBottom: 12 }}>
          <strong>Actual</strong> = shifts and extras already worked (through today), plus OT and
          adjustments logged. Attendance bonus counts in actual only after a month has finished.{" "}
          <strong>Potential</strong> = full {period} if you complete the remaining rota.
        </p>
        <div className="compare-table" role="table" aria-label="Actual versus potential">
          <div className="compare-row head" role="row">
            <span role="columnheader" />
            <span role="columnheader">Paid hours</span>
            <span role="columnheader">Clock hours</span>
            <span role="columnheader">Wages</span>
          </div>
          <div className="compare-row" role="row">
            <span role="rowheader">Actual</span>
            <span>{Number(totalHours(comparison.actual).toFixed(2))}h</span>
            <span>{Number(comparison.actual.scheduledHours.toFixed(2))}h</span>
            <span className="money">{money(comparison.actual.total, data.settings.currency)}</span>
          </div>
          <div className="compare-row" role="row">
            <span role="rowheader">Potential</span>
            <span>{Number(totalHours(comparison.potential).toFixed(2))}h</span>
            <span>{Number(comparison.potential.scheduledHours.toFixed(2))}h</span>
            <span className="money">
              {money(comparison.potential.total, data.settings.currency)}
            </span>
          </div>
          <div className="compare-row remaining" role="row">
            <span role="rowheader">Remaining</span>
            <span>{Number(comparison.remainingPaidHours.toFixed(2))}h</span>
            <span>
              {Number(
                Math.max(
                  0,
                  comparison.potential.scheduledHours - comparison.actual.scheduledHours,
                ).toFixed(2),
              )}
              h
            </span>
            <span className="money">{money(comparison.remainingPay, data.settings.currency)}</span>
          </div>
        </div>
        <div className="stats-grid compare-stats">
          <div>
            <p className="stat-label">Actual base</p>
            <p className="stat-value money">
              {money(comparison.actual.basePay, data.settings.currency)}
            </p>
          </div>
          <div>
            <p className="stat-label">Potential base</p>
            <p className="stat-value money">
              {money(comparison.potential.basePay, data.settings.currency)}
            </p>
          </div>
          <div>
            <p className="stat-label">Actual OT</p>
            <p className="stat-value money">
              {money(comparison.actual.overtimePay, data.settings.currency)}
            </p>
          </div>
          <div>
            <p className="stat-label">Potential attendance</p>
            <p className="stat-value money">
              {money(comparison.potential.attendanceBonus, data.settings.currency)}
            </p>
          </div>
        </div>
      </section>

      {period === "month" && (
        <section className="panel stats-grid">
          <div>
            <p className="stat-label">Day shifts</p>
            <p className="stat-value">{pay.scheduledDays}</p>
          </div>
          <div>
            <p className="stat-label">Night shifts</p>
            <p className="stat-value">{pay.scheduledNights}</p>
          </div>
          <div>
            <p className="stat-label">Extra days</p>
            <p className="stat-value">{pay.extraDays}</p>
          </div>
          <div>
            <p className="stat-label">Unpaid break</p>
            <p className="stat-value">{Number(pay.unpaidBreakHours.toFixed(2))}h</p>
          </div>
          <div>
            <p className="stat-label">YTD actual</p>
            <p className="stat-value money">{money(ytd.total, data.settings.currency)}</p>
          </div>
          <div>
            <p className="stat-label">Est. annual</p>
            <p className="stat-value money">{money(annual, data.settings.currency)}</p>
          </div>
        </section>
      )}

      {period === "month" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Attendance bonus</h2>
          </div>
          <p className={`bonus-status ${bonusEarned ? "ok" : "lost"}`}>
            {bonusEarned
              ? `${money(ATTENDANCE_BONUS_AMOUNT, data.settings.currency)} earned this month`
              : `${money(ATTENDANCE_BONUS_AMOUNT, data.settings.currency)} lost — ${activeLossCount} active reason${activeLossCount === 1 ? "" : "s"}`}
          </p>
          <p className="pay-sub" style={{ marginBottom: 12 }}>
            Log a reason if the monthly bonus is at risk. Toggle a reason to{" "}
            <strong>expired</strong> if it no longer applies — only <strong>active</strong> reasons
            void the bonus.
          </p>

          <div className="chip-row" style={{ marginBottom: 12 }}>
            {ATTENDANCE_BONUS_REASON_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip ${lossReason === opt.id ? "on" : ""}`}
                onClick={() => setLossReason(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="form-row wrap">
            <label>
              Date
              <input type="date" value={lossDate} onChange={(e) => setLossDate(e.target.value)} />
            </label>
            <label className="grow">
              Note
              <input
                value={lossNote}
                onChange={(e) => setLossNote(e.target.value)}
                placeholder="Optional detail"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              addAttendanceBonusLoss({
                year,
                month,
                reason: lossReason,
                dateKey: lossDate || undefined,
                note: lossNote,
                status: "active",
              });
              setLossNote("");
            }}
          >
            Add loss reason
          </button>

          {lossEntries.length > 0 && (
            <ul className="ot-list bonus-loss-list">
              {lossEntries.map((l) => (
                <li key={l.id}>
                  <div>
                    <strong>{attendanceBonusReasonLabel(l.reason)}</strong>
                    {l.dateKey ? ` · ${l.dateKey}` : ""}
                    {l.note ? ` — ${l.note}` : ""}
                    <span className={`bonus-pill ${l.status}`}>{l.status}</span>
                  </div>
                  <div className="bonus-loss-actions">
                    <label className="toggle bonus-toggle">
                      <input
                        type="checkbox"
                        checked={l.status === "active"}
                        onChange={(e) =>
                          setAttendanceBonusLossStatus(
                            l.id,
                            e.target.checked ? "active" : "expired",
                          )
                        }
                      />
                      {l.status === "active" ? "Active" : "Expired"}
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeAttendanceBonusLoss(l.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Add overtime</h2>
        </div>
        <div className="form-row wrap">
          <label>
            Date
            <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)} />
          </label>
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
            <input value={otNote} onChange={(e) => setOtNote(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const hours = Number(otHours);
            if (!hours || !otDate) return;
            addOvertime({ dateKey: otDate, hours, note: otNote });
            setOtNote("");
          }}
        >
          Save overtime
        </button>
        {otEntries.length > 0 && (
          <ul className="ot-list">
            {otEntries.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{o.dateKey}</strong> · {o.hours}h
                  {o.note ? ` — ${o.note}` : ""}
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => removeOvertime(o.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {period === "month" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Pay adjustment</h2>
          </div>
          <div className="form-row wrap">
            <label className="grow">
              Label
              <input value={adjLabel} onChange={(e) => setAdjLabel(e.target.value)} />
            </label>
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="50"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const amount = Number(adjAmount);
              if (!amount || !adjLabel.trim()) return;
              addAdjustment(adjLabel.trim(), amount, toDateKey(new Date(year, month, 15)));
              setAdjAmount("");
            }}
          >
            Add adjustment
          </button>
          {data.adjustments.filter((a) =>
            a.dateKey.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
          ).length > 0 && (
            <ul className="ot-list">
              {data.adjustments
                .filter((a) =>
                  a.dateKey.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
                )
                .map((a) => (
                  <li key={a.id}>
                    <div>
                      <strong>{a.label}</strong> · {money(a.amount, data.settings.currency)}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeAdjustment(a.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {period === "month" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Days worked</h2>
          </div>
          <ul className="worked-list">
            {rows.map((r) => {
              const done = r.dateKey <= todayKey;
              return (
                <li
                  key={`${r.kind}-${r.dateKey}-${r.label ?? ""}`}
                  className={`kind-${r.kind}${done ? " done" : " upcoming"}`}
                >
                  <span>{r.dateKey}</span>
                  <span>
                    {r.kind === "extra"
                      ? r.label || "extra"
                      : `${r.kind}${!r.countsForPay ? " · before start date" : ""}`}
                  </span>
                  <span>
                    {!r.countsForPay
                      ? "not paid"
                      : r.paidHours === r.scheduledHours
                        ? `${r.scheduledHours}h`
                        : `${r.paidHours}h paid / ${r.scheduledHours}h`}
                  </span>
                  <span>
                    {!r.countsForPay
                      ? "—"
                      : done
                        ? r.kind === "extra" && r.note
                          ? r.note
                          : r.overtimeHours > 0
                            ? `+${r.overtimeHours} OT · done`
                            : "done"
                        : "upcoming"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="fineprint">
        Rate {money(data.settings.hourlyRate, data.settings.currency)}/hr · OT ×
        {data.settings.overtimeMultiplier}
        {data.settings.nightPremium
          ? ` · night +${money(data.settings.nightPremium, data.settings.currency)}/hr`
          : ""}{" "}
        · attendance {money(ATTENDANCE_BONUS_AMOUNT, data.settings.currency)}/mo ·{" "}
        {breakLabel(data.settings)}. Change in Settings.
      </p>
    </div>
  );
}
