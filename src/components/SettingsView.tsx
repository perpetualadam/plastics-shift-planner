"use client";

import { useEffect, useRef, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import { paidHoursFromBreak } from "@/lib/pay";
import {
  CYCLE_PRESET_GROUPS,
  CYCLE_PRESETS,
  formatSequence,
  kindLetter,
  matchingPreset,
  nextKind,
  wakeLeadFromTemplate,
  type PrepStep,
  type RotaSource,
  type ShiftTemplate,
  type WorkingShiftKind,
} from "@/lib/shiftConfig";
import { hhmmToMinutes, hoursBetween, isValidHhmm, sanitizeHhmm } from "@/lib/time";
import { toDateKey } from "@/lib/rota";
import {
  cloneDefaultSettings,
  DEFAULT_EXTRA_WORK,
  exportBackup,
  importBackup,
  uid,
  type AppData,
  type AppSettings,
} from "@/lib/storage";

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

function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (hhmm: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="time"
        value={isValidHhmm(value) ? sanitizeHhmm(value) : ""}
        onChange={(e) => {
          const next = e.target.value;
          if (!isValidHhmm(next)) return;
          onCommit(sanitizeHhmm(next));
        }}
      />
    </label>
  );
}

const DAY_TIME_PRESETS: [string, string][] = [
  ["06:00", "18:00"],
  ["07:00", "15:00"],
  ["08:00", "16:00"],
  ["06:00", "14:00"],
];

const AFTERS_TIME_PRESETS: [string, string][] = [
  ["14:00", "22:00"],
  ["13:00", "21:00"],
  ["15:00", "23:00"],
  ["14:00", "02:00"],
];

const NIGHT_TIME_PRESETS: [string, string][] = [
  ["18:00", "06:00"],
  ["19:00", "07:00"],
  ["22:00", "06:00"],
  ["20:00", "08:00"],
];

function upcomingMondayKey(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const dow = (d.getDay() + 6) % 7;
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return toDateKey(d);
}

function PrepEditor({
  steps,
  onChange,
}: {
  steps: PrepStep[];
  onChange: (steps: PrepStep[]) => void;
}) {
  return (
    <div className="prep-editor">
      {steps.map((step, index) => (
        <div key={step.id} className="prep-step">
          <input
            aria-label="Prep label"
            placeholder="Label"
            value={step.label}
            onChange={(e) => {
              const next = steps.map((s, i) =>
                i === index ? { ...s, label: e.target.value } : s,
              );
              onChange(next);
            }}
          />
          <input
            type="time"
            aria-label={`${step.label || "Prep"} time`}
            value={step.time}
            onChange={(e) => {
              const time = e.target.value;
              if (!time) return;
              const next = steps.map((s, i) => (i === index ? { ...s, time } : s));
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={`Remove ${step.label || "step"}`}
            onClick={() => onChange(steps.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      {steps.length < 8 && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            onChange([
              ...steps,
              { id: uid(), label: "Prep", time: steps[steps.length - 1]?.time || "06:00" },
            ])
          }
        >
          Add prep step
        </button>
      )}
    </div>
  );
}

export function SettingsView() {
  const {
    data,
    setData,
    updateSettings,
    upsertExtraWork,
    removeExtraWork,
    clearAllRotaOverrides,
  } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const overrideCount = Object.keys(data.rotaOverrides ?? {}).length;
  const settings = data.settings;

  const downloadBackup = () => {
    const blob = new Blob([exportBackup(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = `${settings.plantName}-${settings.shiftName}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "shift-planner";
    a.download = `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncPaidFromBreak = (partial: Partial<typeof settings>) => {
    const next = { ...settings, ...partial };
    updateSettings({
      ...partial,
      paidHoursPerShift: paidHoursFromBreak(next),
    });
  };

  const patchTemplate = (
    kind: WorkingShiftKind,
    patch: Partial<ShiftTemplate>,
    opts?: { syncClock?: boolean },
  ) => {
    const current =
      kind === "day"
        ? settings.dayShift
        : kind === "afters"
          ? settings.aftersShift
          : settings.nightShift;
    const next = { ...current, ...patch, prepSteps: patch.prepSteps ?? current.prepSteps };
    const lead = wakeLeadFromTemplate(next);
    const updates: Partial<AppSettings> =
      kind === "day"
        ? { dayShift: next, dayWakeTime: next.wakeTime, dayWakeLeadMinutes: lead }
        : kind === "afters"
          ? { aftersShift: next, aftersWakeTime: next.wakeTime, aftersWakeLeadMinutes: lead }
          : { nightShift: next, nightWakeTime: next.wakeTime, nightWakeLeadMinutes: lead };
    if (opts?.syncClock) {
      const clock = hoursBetween(next.start, next.end) || settings.shiftClockHours;
      updates.shiftClockHours = clock;
      updates.paidHoursPerShift = paidHoursFromBreak({
        ...settings,
        shiftClockHours: clock,
        breakMinutes: settings.breakMinutes,
        breakPaid: settings.breakPaid,
      });
    }
    updateSettings(updates);
  };

  const timePresets = (kind: WorkingShiftKind): [string, string][] => {
    if (kind === "day") return DAY_TIME_PRESETS;
    if (kind === "afters") return AFTERS_TIME_PRESETS;
    return NIGHT_TIME_PRESETS;
  };

  const templateOf = (kind: WorkingShiftKind): ShiftTemplate => {
    if (kind === "day") return settings.dayShift;
    if (kind === "afters") return settings.aftersShift;
    return settings.nightShift;
  };

  const selectedPreset = matchingPreset(settings.cycle.sequence);

  const dayHours = hoursBetween(settings.dayShift.start, settings.dayShift.end);
  const aftersHours = hoursBetween(settings.aftersShift.start, settings.aftersShift.end);
  const nightHours = hoursBetween(settings.nightShift.start, settings.nightShift.end);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Workplace</h2>
        </div>
        <p className="help">
          Names appear in the header, alerts, and backups. Use any company or shift — nothing is
          locked to Plastics.
        </p>
        <div className="form-row wrap">
          <label className="grow">
            Company / plant
            <input
              value={settings.plantName}
              maxLength={48}
              onChange={(e) => updateSettings({ plantName: e.target.value })}
            />
          </label>
          <label className="grow">
            Shift name
            <input
              value={settings.shiftName}
              maxLength={48}
              onChange={(e) => updateSettings({ shiftName: e.target.value })}
            />
          </label>
        </div>
        <label className="grow block-field">
          First paid rota day
          <input
            type="date"
            value={settings.workStartDate}
            onChange={(e) => {
              if (e.target.value) updateSettings({ workStartDate: e.target.value });
            }}
          />
        </label>
        <p className="help">
          Rota days before this date still show on the calendar but do not count for pay. Extra
          payable days below always count.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Shift times</h2>
        </div>
        <p className="help">
          These times apply to every matching day on the rota. Invalid values are ignored so the
          app keeps running.
        </p>
        {(["day", "afters", "night"] as const).map((kind) => {
          const t = templateOf(kind);
          return (
            <div key={kind} className="template-block">
              <label>
                {kind === "day" ? "Day" : kind === "afters" ? "Afters" : "Night"} label
                <input
                  value={t.label}
                  maxLength={40}
                  onChange={(e) => patchTemplate(kind, { label: e.target.value || t.label })}
                />
              </label>
              <div className="form-row wrap">
                <TimeField
                  label="Start"
                  value={t.start}
                  onCommit={(start) => patchTemplate(kind, { start }, { syncClock: true })}
                />
                <TimeField
                  label="End"
                  value={t.end}
                  onCommit={(end) => patchTemplate(kind, { end }, { syncClock: true })}
                />
              </div>
              <div className="chip-row">
                {timePresets(kind).map(([start, end]) => (
                  <button
                    key={`${start}-${end}`}
                    type="button"
                    className={`chip ${t.start === start && t.end === end ? "on" : ""}`}
                    onClick={() => patchTemplate(kind, { start, end }, { syncClock: true })}
                  >
                    {start}–{end}
                  </button>
                ))}
              </div>
              <p className="help">
                {hoursBetween(t.start, t.end)}h clock
                {(hhmmToMinutes(t.end) ?? 0) <= (hhmmToMinutes(t.start) ?? 1)
                  ? " (overnight)"
                  : ""}
              </p>
            </div>
          );
        })}
        <p className="help">
          Day {dayHours}h · Afters {aftersHours}h · Night {nightHours}h. Pay uses the clock hours in
          Hours &amp; breaks
          {dayHours !== nightHours || dayHours !== aftersHours
            ? " — set that to whichever length you are paid for, or split differences with extra days / OT."
            : "."}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Prep checklist</h2>
        </div>
        <p className="help">
          Shown on Today for the next working shift. Rename or remove steps (for example dog feed)
          if they do not apply.
        </p>
        <h3 className="subhead">{settings.dayShift.label}</h3>
        <PrepEditor
          steps={settings.dayShift.prepSteps}
          onChange={(prepSteps) => patchTemplate("day", { prepSteps })}
        />
        <h3 className="subhead">{settings.aftersShift.label}</h3>
        <PrepEditor
          steps={settings.aftersShift.prepSteps}
          onChange={(prepSteps) => patchTemplate("afters", { prepSteps })}
        />
        <h3 className="subhead">{settings.nightShift.label}</h3>
        <PrepEditor
          steps={settings.nightShift.prepSteps}
          onChange={(prepSteps) => patchTemplate("night", { prepSteps })}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Rota source</h2>
        </div>
        <p className="help">
          Choose how working days are filled. You can still tap any calendar day to Day / Afters /
          Night / Off without breaking the rest of the app.
        </p>
        <div className="source-grid">
          {(
            [
              ["csv", "Built-in 2026 rota", "Plastics B-shift CSV dates"],
              ["cycle", "Repeating pattern", "Continental, 4-on-4-off, afters, nights, or custom"],
              ["manual", "Blank calendar", "Start empty and tap days yourself"],
            ] as const
          ).map(([id, title, hint]) => (
            <button
              key={id}
              type="button"
              className={`source-card ${settings.rotaSource === id ? "on" : ""}`}
              onClick={() => updateSettings({ rotaSource: id as RotaSource })}
            >
              <strong>{title}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>
        {settings.rotaSource === "cycle" && (
          <div className="cycle-editor">
            <p className="help">
              Pattern repeats from the anchor date forever:{" "}
              <strong>{formatSequence(settings.cycle.sequence)}</strong>
            </p>
            <label className="block-field">
              Pattern starts on
              <input
                type="date"
                value={settings.cycle.anchorDate}
                onChange={(e) => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
                  updateSettings({
                    cycle: { ...settings.cycle, anchorDate: e.target.value },
                  });
                }}
              />
            </label>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  updateSettings({
                    cycle: { ...settings.cycle, anchorDate: upcomingMondayKey() },
                  })
                }
              >
                Start next Monday ({upcomingMondayKey()})
              </button>
            </div>
            <div className="preset-groups">
              {CYCLE_PRESET_GROUPS.map((group) => (
                <div key={group.id} className="preset-group">
                  <p className="preset-group-label">{group.label}</p>
                  <div className="chip-row">
                    {CYCLE_PRESETS.filter((preset) => preset.group === group.id).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`chip ${selectedPreset?.id === preset.id ? "on" : ""}`}
                        title={preset.hint}
                        onClick={() =>
                          updateSettings({
                            cycle: { ...settings.cycle, sequence: [...preset.sequence] },
                          })
                        }
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="chip-row seq-row">
              {settings.cycle.sequence.map((kind, index) => (
                <button
                  key={`${kind}-${index}`}
                  type="button"
                  className={`chip seq-chip kind-${kind}`}
                  onClick={() => {
                    const sequence = settings.cycle.sequence.map((k, i) =>
                      i === index ? nextKind(k) : k,
                    );
                    updateSettings({ cycle: { ...settings.cycle, sequence } });
                  }}
                >
                  {kindLetter(kind)}
                </button>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              {(["day", "afters", "night", "off"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    updateSettings({
                      cycle: {
                        ...settings.cycle,
                        sequence: [...settings.cycle.sequence, kind].slice(0, 56),
                      },
                    })
                  }
                >
                  + {kindLetter(kind)}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={settings.cycle.sequence.length <= 1}
                onClick={() =>
                  updateSettings({
                    cycle: {
                      ...settings.cycle,
                      sequence: settings.cycle.sequence.slice(0, -1),
                    },
                  })
                }
              >
                Remove last
              </button>
            </div>
          </div>
        )}
        {settings.rotaSource === "manual" && (
          <p className="help">
            Every date starts as off. Open Rota and tap days to build your own schedule.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Extra payable days</h2>
        </div>
        <p className="help">
          One-off paid days that are not on the normal rota (induction, training, call-ins).
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
                  onChange={(e) => {
                    if (!e.target.value) return;
                    upsertExtraWork({ ...entry, dateKey: e.target.value });
                  }}
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
                    const start = e.target.value;
                    if (!start) return;
                    const clockHours = hoursBetween(start, entry.end);
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
                    const end = e.target.value;
                    if (!end) return;
                    const clockHours = hoursBetween(entry.start, end);
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
                value={entry.paidHours ?? entry.clockHours ?? 0}
                min={0}
                max={24}
                step="0.25"
                onCommit={(paidHours) => {
                  const clockHours = hoursBetween(entry.start, entry.end);
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
          onClick={() => {
            const dateKey = toDateKey(new Date());
            upsertExtraWork({
              id: uid(),
              dateKey,
              label: "Extra day",
              start: "09:00",
              end: "17:00",
              clockHours: 8,
              paidHours: 8,
            });
          }}
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
            value={settings.hourlyRate}
            min={0}
            step="0.01"
            onCommit={(hourlyRate) => updateSettings({ hourlyRate })}
          />
          <NumberField
            label="OT multiplier"
            value={settings.overtimeMultiplier}
            min={1}
            step="0.1"
            onCommit={(overtimeMultiplier) => updateSettings({ overtimeMultiplier })}
          />
          <NumberField
            label="Night premium /hr"
            value={settings.nightPremium}
            min={0}
            step="0.01"
            onCommit={(nightPremium) => updateSettings({ nightPremium })}
          />
          <label>
            Currency
            <select
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              {!["GBP", "EUR", "USD", "AUD", "CAD", "NZD", "ZAR", "PLN"].includes(
                settings.currency,
              ) && <option value={settings.currency}>{settings.currency}</option>}
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="AUD">AUD</option>
              <option value="CAD">CAD</option>
              <option value="NZD">NZD</option>
              <option value="ZAR">ZAR</option>
              <option value="PLN">PLN</option>
            </select>
          </label>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.attendanceBonusEnabled && settings.attendanceBonusAmount > 0}
            onChange={(e) =>
              updateSettings({
                attendanceBonusEnabled: e.target.checked,
                attendanceBonusAmount: e.target.checked
                  ? settings.attendanceBonusAmount || 200
                  : settings.attendanceBonusAmount,
              })
            }
          />
          <span>Monthly attendance bonus</span>
        </label>
        {settings.attendanceBonusEnabled && (
          <NumberField
            label="Bonus amount / month"
            value={settings.attendanceBonusAmount}
            min={0}
            step="1"
            onCommit={(attendanceBonusAmount) => updateSettings({ attendanceBonusAmount })}
          />
        )}
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
            value={settings.shiftClockHours}
            min={0.25}
            max={24}
            step="0.25"
            onCommit={(shiftClockHours) => {
              const paid = Math.min(settings.paidHoursPerShift, shiftClockHours);
              updateSettings({ shiftClockHours, paidHoursPerShift: paid });
            }}
          />
          <NumberField
            label="Paid hours / shift"
            value={settings.paidHoursPerShift}
            min={0}
            max={24}
            step="0.25"
            onCommit={(paidHoursPerShift) => {
              const clock = settings.shiftClockHours || 12;
              const paid = Math.min(paidHoursPerShift, clock);
              const unpaidMins = Math.round((clock - paid) * 60);
              updateSettings({
                paidHoursPerShift: paid,
                breakMinutes: settings.breakPaid ? settings.breakMinutes : unpaidMins,
              });
            }}
          />
          <NumberField
            label="Break length (min)"
            value={settings.breakMinutes}
            min={0}
            max={180}
            step={5}
            onCommit={(breakMinutes) => syncPaidFromBreak({ breakMinutes })}
          />
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.breakPaid}
            onChange={(e) => syncPaidFromBreak({ breakPaid: e.target.checked })}
          />
          <span>{settings.breakPaid ? "Break is paid" : "Break is unpaid"}</span>
        </label>
        <div className="chip-row">
          {[0, 20, 30, 45, 60].map((mins) => (
            <button
              key={mins}
              type="button"
              className={`chip ${settings.breakMinutes === mins ? "on" : ""}`}
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
        {overrideCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginBottom: 10 }}
            onClick={() => {
              if (
                !confirm(
                  `Clear ${overrideCount} day edit${overrideCount === 1 ? "" : "s"} and restore the base rota?`,
                )
              )
                return;
              clearAllRotaOverrides();
              setMsg("Rota edits cleared.");
            }}
          >
            Clear day edits ({overrideCount})
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!confirm("Reset all settings, overtime, and notes on this device?")) return;
            const fresh: AppData = {
              settings: cloneDefaultSettings(),
              overtime: [],
              notes: [],
              adjustments: [],
              extraWork: DEFAULT_EXTRA_WORK.map((e) => ({ ...e })),
              attendanceBonusLosses: [],
              rotaOverrides: {},
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
        <h2>{settings.plantName.trim() || "Shift planner"}</h2>
        <p>
          Offline-first shift planner{settings.shiftName.trim() ? ` for ${settings.shiftName}` : ""}.
          Edit workplace, times, rota source, rates, hours, and reminders — invalid values are
          rejected so the app keeps working.
        </p>
        <p className="fineprint">v0.2 · data stays on your phone</p>
      </section>
    </div>
  );
}
