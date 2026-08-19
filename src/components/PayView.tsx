"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  breakLabel,
  calculateMonthPay,
  estimatedAnnual,
  money,
  workedDaysInMonth,
  yearToDatePay,
} from "@/lib/pay";
import { overtimeForMonth } from "@/lib/storage";
import { toDateKey } from "@/lib/rota";

export function PayView() {
  const { data, addOvertime, removeOvertime, addAdjustment, removeAdjustment } = useAppData();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [otHours, setOtHours] = useState("2");
  const [otDate, setOtDate] = useState(() => toDateKey(new Date()));
  const [otNote, setOtNote] = useState("");
  const [adjLabel, setAdjLabel] = useState("Bonus");
  const [adjAmount, setAdjAmount] = useState("");

  const pay = useMemo(() => calculateMonthPay(data, year, month), [data, year, month]);
  const ytd = yearToDatePay(data);
  const rows = useMemo(() => workedDaysInMonth(data, year, month), [data, year, month]);
  const otEntries = useMemo(() => overtimeForMonth(data, year, month), [data, year, month]);
  const annual = estimatedAnnual(data);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div className="stack">
      <section className="panel pay-hero">
        <div className="panel-head month-nav">
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <h2>{monthLabel}</h2>
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
        <p className="pay-total">{money(pay.total, data.settings.currency)}</p>
        <p className="pay-sub">
          Estimated take for paid hours + OT + adjustments · {breakLabel(data.settings)}
        </p>
      </section>

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
          <p className="stat-label">Clock hrs</p>
          <p className="stat-value">{Number(pay.scheduledHours.toFixed(2))}</p>
        </div>
        <div>
          <p className="stat-label">Paid hrs</p>
          <p className="stat-value">{Number(pay.paidHours.toFixed(2))}</p>
        </div>
        <div>
          <p className="stat-label">Unpaid break</p>
          <p className="stat-value">{Number(pay.unpaidBreakHours.toFixed(2))}h</p>
        </div>
        <div>
          <p className="stat-label">OT hours</p>
          <p className="stat-value">{pay.overtimeHours}</p>
        </div>
        <div>
          <p className="stat-label">Base pay</p>
          <p className="stat-value money">{money(pay.basePay, data.settings.currency)}</p>
        </div>
        <div>
          <p className="stat-label">OT pay</p>
          <p className="stat-value money">{money(pay.overtimePay, data.settings.currency)}</p>
        </div>
        <div>
          <p className="stat-label">YTD</p>
          <p className="stat-value money">{money(ytd.total, data.settings.currency)}</p>
        </div>
        <div>
          <p className="stat-label">Est. annual</p>
          <p className="stat-value money">{money(annual, data.settings.currency)}</p>
        </div>
      </section>

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
        {data.adjustments.filter((a) => a.dateKey.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length >
          0 && (
          <ul className="ot-list">
            {data.adjustments
              .filter((a) => a.dateKey.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
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

      <section className="panel">
        <div className="panel-head">
          <h2>Days worked</h2>
        </div>
        <ul className="worked-list">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.dateKey}-${r.label ?? ""}`} className={`kind-${r.kind}`}>
              <span>{r.dateKey}</span>
              <span>
                {r.kind === "extra"
                  ? r.label || "extra"
                  : `${r.kind}${!r.countsForPay ? " · induction rota" : ""}`}
              </span>
              <span>
                {!r.countsForPay
                  ? "not paid"
                  : r.paidHours === r.scheduledHours
                    ? `${r.scheduledHours}h`
                    : `${r.paidHours}h paid / ${r.scheduledHours}h`}
              </span>
              <span>
                {r.kind === "extra" && r.note
                  ? r.note
                  : r.overtimeHours > 0
                    ? `+${r.overtimeHours} OT`
                    : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="fineprint">
        Rate {money(data.settings.hourlyRate, data.settings.currency)}/hr · OT ×
        {data.settings.overtimeMultiplier}
        {data.settings.nightPremium
          ? ` · night +${money(data.settings.nightPremium, data.settings.currency)}/hr`
          : ""}{" "}
        · {breakLabel(data.settings)}. Change in Settings.
      </p>
    </div>
  );
}
