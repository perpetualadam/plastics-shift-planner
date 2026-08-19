"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  loadData,
  saveData,
  type AppData,
  type AppSettings,
  type AttendanceBonusLoss,
  type AttendanceBonusLossReason,
  type AttendanceBonusLossStatus,
  type ExtraWorkEntry,
  type OvertimeEntry,
  monthKeyFromParts,
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

  const upsertExtraWork = useCallback(
    (entry: ExtraWorkEntry) => {
      setData((prev) => {
        const rest = (prev.extraWork ?? []).filter((e) => e.id !== entry.id);
        return { ...prev, extraWork: [...rest, entry] };
      });
    },
    [setData],
  );

  const removeExtraWork = useCallback(
    (id: string) => {
      setData((prev) => ({
        ...prev,
        extraWork: (prev.extraWork ?? []).filter((e) => e.id !== id),
      }));
    },
    [setData],
  );

  const addAttendanceBonusLoss = useCallback(
    (input: {
      year: number;
      month: number;
      reason: AttendanceBonusLossReason;
      dateKey?: string;
      note?: string;
      status?: AttendanceBonusLossStatus;
    }) => {
      const entry: AttendanceBonusLoss = {
        id: uid(),
        monthKey: monthKeyFromParts(input.year, input.month),
        reason: input.reason,
        dateKey: input.dateKey,
        note: input.note?.trim() || undefined,
        status: input.status ?? "active",
        createdAt: new Date().toISOString(),
      };
      setData((prev) => ({
        ...prev,
        attendanceBonusLosses: [...(prev.attendanceBonusLosses ?? []), entry],
      }));
    },
    [setData],
  );

  const setAttendanceBonusLossStatus = useCallback(
    (id: string, status: AttendanceBonusLossStatus) => {
      setData((prev) => ({
        ...prev,
        attendanceBonusLosses: (prev.attendanceBonusLosses ?? []).map((l) =>
          l.id === id ? { ...l, status } : l,
        ),
      }));
    },
    [setData],
  );

  const removeAttendanceBonusLoss = useCallback(
    (id: string) => {
      setData((prev) => ({
        ...prev,
        attendanceBonusLosses: (prev.attendanceBonusLosses ?? []).filter((l) => l.id !== id),
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
    upsertExtraWork,
    removeExtraWork,
    addAttendanceBonusLoss,
    setAttendanceBonusLossStatus,
    removeAttendanceBonusLoss,
  };
}
