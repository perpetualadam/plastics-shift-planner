"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  DEFAULT_SETTINGS,
  exportBackup,
  importBackup,
  type AppData,
} from "@/lib/storage";

export function SettingsView() {
  const { data, setData, updateSettings } = useAppData();
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
        <p className="help">Locked to Plastics B rota: 2 days · 2 nights · 3 off · 12h (06–18 / 18–06).</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Pay rates</h2>
        </div>
        <div className="form-row wrap">
          <label>
            Hourly rate
            <input
              type="number"
              step="0.01"
              min="0"
              value={data.settings.hourlyRate}
              onChange={(e) => updateSettings({ hourlyRate: Number(e.target.value) || 0 })}
            />
          </label>
          <label>
            OT multiplier
            <input
              type="number"
              step="0.1"
              min="1"
              value={data.settings.overtimeMultiplier}
              onChange={(e) =>
                updateSettings({ overtimeMultiplier: Number(e.target.value) || 1.5 })
              }
            />
          </label>
          <label>
            Night premium /hr
            <input
              type="number"
              step="0.01"
              min="0"
              value={data.settings.nightPremium}
              onChange={(e) => updateSettings({ nightPremium: Number(e.target.value) || 0 })}
            />
          </label>
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
          Personal B-shift planner — offline-first PWA. Pattern matched to your 2026 Plastics rota
          (yellow boxes): 2 day, 2 night, 3 off.
        </p>
        <p className="fineprint">v0.1 · data stays on your phone</p>
      </section>
    </div>
  );
}
