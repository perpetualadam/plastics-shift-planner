"use client";

import { useEffect, useRef, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import { paidHoursFromBreak } from "@/lib/pay";
import {
  DEFAULT_EXTRA_WORK,
  DEFAULT_SETTINGS,
  exportBackup,
  importBackup,
  uid,
  type AppData,
} from "@/lib/storage";

function hoursFromTimes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

/** Number input that allows clearing (no sticky zero). */
function NumberField({
  label,
  value,
  onCommit,
  step = "any",
  min,
  max,
  className,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: string | number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      setDraft(String(value));
      return;
    }
    let n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    if (typeof min === "number") n = Math.max(min, n);
    if (typeof max === "number") n = Math.min(max, n);
    onCommit(n);
    setDraft(String(n));
  };

  return (
    <label className={className}>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "" || /^-?\d*\.?\d*$/.test(next)) setDraft(next);
        }}
        onBlur={() => {
          focused.current = false;
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        step={step}
      />
    </label>
  );
}

export function SettingsView() {
  const { data, setData, updateSettings, upsertExtraWork, removeExtraWork } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  const downloadBackup = () => {
    const blob = new Blob([exportBackup(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plastics-b-shift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncPaidFromBreak = (partial: Partial<typeof data.settings>) => {
    const next = { ...data.settings, ...partial };
    updateSettings({
      ...partial,
      paidHoursPerShift: paidHoursFromBreak(next),
    });
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Identity</h2>
        </div>
        <div className="form-row wrap">
          <label className="grow">
            Plant
            <input
              value={data.settings.plantName}
              onChange={(e) => updateSettings({ plantName: e.target.value })}
            />
          </label>
          <label className="grow">
            Shift name
            <input
              value={data.settings.shiftName}
              onChange={(e) => updateSettings({ shiftName: e.target.value })}
            />
          </label>
        </div>
        <label className="grow block-field">
          First B-shift day (from CSV)
          <input
            type="date"
            value={data.settings.workStartDate || "2026-08-20"}
            onChange={(e) => updateSettings({ workStartDate: e.target.value })}
          />
        </label>
        <p className="help">
          Matches the Plastics B-shift CSV: first working day is{" "}
          <strong>Thu 20 Aug 2026</strong> (day shift 06:00–18:00). Earlier CSV days are ignored
          for pay. Optional one-off days below can still be added if needed.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Extra payable days</h2>
        </div>
        <p className="help">
          Optional one-off paid days that are not on the normal 12h B-shift rota. Empty by default
          — first paid shift is 20 Aug from the CSV.
        </p>
        {(data.extraWork ?? []).map((entry) => (
          <div key={entry.id} className="extra-work-card">
            <div className="form-row wrap">
              <label className="grow">
                Label
                <input
                  value={entry.label}
                  onChange={(e) =>
                    upsertExtraWork({ ...entry, label: e.target.value || "Extra day" })
                  }
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={entry.dateKey}
                  onChange={(e) => upsertExtraWork({ ...entry, dateKey: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row wrap">
              <label>
                Start
                <input
                  type="time"
                  value={entry.start}
                  onChange={(e) => {
                    const start = e.target.value || "09:00";
                    const clockHours = hoursFromTimes(start, entry.end);
                    upsertExtraWork({
                      ...entry,
                      start,
                      clockHours,
                      paidHours: entry.paidHours ?? clockHours,
                    });
                  }}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={entry.end}
                  onChange={(e) => {
                    const end = e.target.value || "18:00";
                    const clockHours = hoursFromTimes(entry.start, end);
                    upsertExtraWork({
                      ...entry,
                      end,
                      clockHours,
                      paidHours: entry.paidHours ?? clockHours,
                    });
                  }}
                />
              </label>
              <NumberField
                label="Paid hours"
                value={entry.paidHours ?? entry.clockHours ?? 9}
                min={0}
                max={24}
                step="0.25"
                onCommit={(paidHours) => {
                  const clockHours = hoursFromTimes(entry.start, entry.end);
                  upsertExtraWork({ ...entry, clockHours, paidHours });
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => removeExtraWork(entry.id)}
            >
              Remove day
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            upsertExtraWork({
              id: uid(),
              dateKey: data.settings.workStartDate || "2026-08-20",
              label: "Extra day",
              start: "09:00",
              end: "18:00",
              clockHours: 9,
              paidHours: 9,
            })
          }
        >
          Add payable day
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Pay rates</h2>
        </div>
        <div className="form-row wrap">
          <NumberField
            label="Hourly rate"
            value={data.settings.hourlyRate}
            min={0}
            step="0.01"
            onCommit={(hourlyRate) => updateSettings({ hourlyRate })}
          />
          <NumberField
            label="OT multiplier"
            value={data.settings.overtimeMultiplier}
            min={1}
            step="0.1"
            onCommit={(overtimeMultiplier) => updateSettings({ overtimeMultiplier })}
          />
          <NumberField
            label="Night premium /hr"
            value={data.settings.nightPremium}
            min={0}
            step="0.01"
            onCommit={(nightPremium) => updateSettings({ nightPremium })}
          />
          <label>
            Currency
            <select
              value={data.settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Hours &amp; breaks</h2>
        </div>
        <p className="help">
          Edit clock hours and paid hours directly. Toggle paid/unpaid break to auto-suggest paid
          hours from break length — you can still override.
        </p>
        <div className="form-row wrap">
          <NumberField
            label="Clock hours / shift"
            value={data.settings.shiftClockHours}
            min={0.25}
            max={24}
            step="0.25"
            onCommit={(shiftClockHours) => {
              const paid = Math.min(data.settings.paidHoursPerShift, shiftClockHours);
              updateSettings({ shiftClockHours, paidHoursPerShift: paid });
            }}
          />
          <NumberField
            label="Paid hours / shift"
            value={data.settings.paidHoursPerShift}
            min={0}
            max={24}
            step="0.25"
            onCommit={(paidHoursPerShift) => {
              const clock = data.settings.shiftClockHours || 12;
              const paid = Math.min(paidHoursPerShift, clock);
              const unpaidMins = Math.round((clock - paid) * 60);
              updateSettings({
                paidHoursPerShift: paid,
                breakMinutes: data.settings.breakPaid ? data.settings.breakMinutes : unpaidMins,
              });
            }}
          />
          <NumberField
            label="Break length (min)"
            value={data.settings.breakMinutes}
            min={0}
            max={180}
            step={5}
            onCommit={(breakMinutes) => syncPaidFromBreak({ breakMinutes })}
          />
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={data.settings.breakPaid}
            onChange={(e) => syncPaidFromBreak({ breakPaid: e.target.checked })}
          />
          <span>{data.settings.breakPaid ? "Break is paid" : "Break is unpaid"}</span>
        </label>
        <div className="chip-row">
          {[0, 20, 30, 45, 60].map((mins) => (
            <button
              key={mins}
              type="button"
              className={`chip ${data.settings.breakMinutes === mins ? "on" : ""}`}
              onClick={() => syncPaidFromBreak({ breakMinutes: mins })}
            >
              {mins === 0 ? "None" : `${mins}m`}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Backup &amp; restore</h2>
        </div>
        <p className="help">Everything stores on this device — works offline. Export before switching phones.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={downloadBackup}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const imported = importBackup(text);
                setData(imported);
                setMsg("Backup restored.");
              } catch {
                setMsg("Could not read that backup file.");
              }
              e.target.value = "";
            }}
          />
        </div>
        {msg && <p className="help">{msg}</p>}
      </section>

      <section className="panel danger">
        <div className="panel-head">
          <h2>Reset</h2>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!confirm("Reset all settings, overtime, and notes on this device?")) return;
            const fresh: AppData = {
              settings: DEFAULT_SETTINGS,
              overtime: [],
              notes: [],
              adjustments: [],
              extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
              attendanceBonusLosses: [],
              notificationPermissionAsked: false,
              installedHintDismissed: false,
            };
            setData(fresh);
            setMsg("App data cleared.");
          }}
        >
          Reset local data
        </button>
      </section>

      <section className="panel about">
        <h2>Plastics Shift</h2>
        <p>
          Personal B-shift planner — offline-first PWA. Schedule from your 2026 Plastics CSV rota
          with editable rates, hours, breaks, and first paid-shift date.
        </p>
        <p className="fineprint">v0.1 · data stays on your phone</p>
      </section>
    </div>
  );
}
