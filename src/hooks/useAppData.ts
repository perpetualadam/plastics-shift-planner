"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  loadData,
  saveData,
  type AppData,
  type AppSettings,
  type OvertimeEntry,
  uid,
} from "@/lib/storage";
import { toDateKey } from "@/lib/rota";

function subscribe(cb: () => void) {
  const onChange = () => cb();
  window.addEventListener("shift-data-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("shift-data-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string {
  return localStorage.getItem("plastics-b-shift-planner-v1") ?? "";
}

function getServerSnapshot(): string {
  return "";
}

export function useAppData() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const data = useMemo(() => {
    if (!raw) {
      // Ensure defaults even when key missing
      return loadData();
    }
    try {
      return loadData();
    } catch {
      return loadData();
    }
  }, [raw]);

  const setData = useCallback((updater: AppData | ((prev: AppData) => AppData)) => {
    const prev = loadData();
    const next = typeof updater === "function" ? updater(prev) : updater;
    saveData(next);
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      setData((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...partial },
      }));
    },
    [setData],
  );

  const addOvertime = useCallback(
    (entry: Omit<OvertimeEntry, "id" | "createdAt">) => {
      setData((prev) => ({
        ...prev,
        overtime: [
          ...prev.overtime,
          { ...entry, id: uid(), createdAt: new Date().toISOString() },
        ],
      }));
    },
    [setData],
  );

  const removeOvertime = useCallback(
    (id: string) => {
      setData((prev) => ({
        ...prev,
        overtime: prev.overtime.filter((o) => o.id !== id),
      }));
    },
    [setData],
  );

  const setDayNote = useCallback(
    (date: Date, text: string) => {
      const key = toDateKey(date);
      setData((prev) => {
        const notes = prev.notes.filter((n) => n.dateKey !== key);
        if (text.trim()) notes.push({ dateKey: key, text: text.trim() });
        return { ...prev, notes };
      });
    },
    [setData],
  );

  const addAdjustment = useCallback(
    (label: string, amount: number, dateKey: string) => {
      setData((prev) => ({
        ...prev,
        adjustments: [...prev.adjustments, { id: uid(), label, amount, dateKey }],
      }));
    },
    [setData],
  );

  const removeAdjustment = useCallback(
    (id: string) => {
      setData((prev) => ({
        ...prev,
        adjustments: prev.adjustments.filter((a) => a.id !== id),
      }));
    },
    [setData],
  );

  return {
    data,
    setData,
    updateSettings,
    addOvertime,
    removeOvertime,
    setDayNote,
    addAdjustment,
    removeAdjustment,
  };
}
