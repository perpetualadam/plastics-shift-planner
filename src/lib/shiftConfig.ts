import type { ShiftKind } from "./rota";
import {
  finiteNumber,
  hoursBetween,
  isValidHhmm,
  minutesUntil,
  nonEmptyString,
  sanitizeCurrency,
  sanitizeHhmm,
} from "./time";

export type RotaSource = "csv" | "cycle" | "manual";

export type PrepStep = {
  id: string;
  label: string;
  time: string;
};

export type ShiftTemplate = {
  label: string;
  start: string;
  end: string;
  wakeTime: string;
  prepSteps: PrepStep[];
};

export type CycleConfig = {
  /** First date of the repeating sequence (YYYY-MM-DD). */
  anchorDate: string;
  /** Repeating day/night/off pattern. Empty or invalid → all off. */
  sequence: ShiftKind[];
};

export const DEFAULT_DAY_SHIFT: ShiftTemplate = {
  label: "Day shift",
  start: "06:00",
  end: "18:00",
  wakeTime: "04:49",
  prepSteps: [
    { id: "dog-feed", label: "Dog feed", time: "04:49" },
    { id: "dressed", label: "Get dressed", time: "04:54" },
    { id: "leave", label: "Leave", time: "05:09" },
    { id: "arrive", label: "Arrive", time: "05:45" },
  ],
};

export const DEFAULT_NIGHT_SHIFT: ShiftTemplate = {
  label: "Night shift",
  start: "18:00",
  end: "06:00",
  wakeTime: "16:49",
  prepSteps: [
    { id: "dog-feed", label: "Dog feed", time: "16:49" },
    { id: "dressed", label: "Get dressed", time: "16:54" },
    { id: "leave", label: "Leave", time: "17:09" },
    { id: "arrive", label: "Arrive", time: "17:45" },
  ],
};

export const DEFAULT_CYCLE: CycleConfig = {
  anchorDate: "2026-01-05",
  sequence: ["day", "day", "night", "night", "off", "off", "off"],
};

export type CyclePresetId = "2-2-3" | "4-4" | "weekdays" | "nights-2-2-3" | "pitman-days";

export const CYCLE_PRESETS: {
  id: CyclePresetId;
  label: string;
  hint: string;
  sequence: ShiftKind[];
}[] = [
  {
    id: "2-2-3",
    label: "2-2-3",
    hint: "2 days, 2 nights, 3 off",
    sequence: ["day", "day", "night", "night", "off", "off", "off"],
  },
  {
    id: "nights-2-2-3",
    label: "2-2-3 nights first",
    hint: "2 nights, 2 days, 3 off",
    sequence: ["night", "night", "day", "day", "off", "off", "off"],
  },
  {
    id: "4-4",
    label: "4-on / 4-off",
    hint: "4 days then 4 off",
    sequence: ["day", "day", "day", "day", "off", "off", "off", "off"],
  },
  {
    id: "weekdays",
    label: "Weekdays",
    hint: "Mon–Fri days (anchor on a Monday)",
    sequence: ["day", "day", "day", "day", "day", "off", "off"],
  },
  {
    id: "pitman-days",
    label: "Pitman 14-day",
    hint: "2-2-3 days, then 2-2-3 nights",
    sequence: [
      "day",
      "day",
      "off",
      "off",
      "day",
      "day",
      "day",
      "off",
      "off",
      "night",
      "night",
      "off",
      "off",
      "off",
    ],
  },
];

export function isShiftKind(value: unknown): value is ShiftKind {
  return value === "day" || value === "night" || value === "off";
}

export function isRotaSource(value: unknown): value is RotaSource {
  return value === "csv" || value === "cycle" || value === "manual";
}

function sanitizePrepSteps(raw: unknown, fallback: PrepStep[]): PrepStep[] {
  if (!Array.isArray(raw)) return fallback.map((s) => ({ ...s }));
  const out: PrepStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<PrepStep>;
    const time = isValidHhmm(rec.time) ? sanitizeHhmm(rec.time) : "";
    if (!time) continue;
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 40) : "";
    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 64)
        : `step-${out.length}`;
    out.push({ id, label, time });
    if (out.length >= 8) break;
  }
  return out;
}

export function sanitizeShiftTemplate(
  raw: unknown,
  fallback: ShiftTemplate,
): ShiftTemplate {
  if (!raw || typeof raw !== "object") {
    return {
      ...fallback,
      prepSteps: fallback.prepSteps.map((s) => ({ ...s })),
    };
  }
  const rec = raw as Partial<ShiftTemplate>;
  const start = sanitizeHhmm(rec.start, fallback.start);
  const end = sanitizeHhmm(rec.end, fallback.end);
  const wakeTime = sanitizeHhmm(rec.wakeTime, fallback.wakeTime);
  return {
    label: nonEmptyString(rec.label, fallback.label).slice(0, 40),
    start,
    end,
    wakeTime,
    prepSteps: sanitizePrepSteps(rec.prepSteps, fallback.prepSteps),
  };
}

export function sanitizeCycle(raw: unknown): CycleConfig {
  const rec = raw && typeof raw === "object" ? (raw as Partial<CycleConfig>) : {};
  const anchor =
    typeof rec.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.anchorDate)
      ? rec.anchorDate
      : DEFAULT_CYCLE.anchorDate;
  const sequence = Array.isArray(rec.sequence)
    ? rec.sequence.filter(isShiftKind).slice(0, 56)
    : [...DEFAULT_CYCLE.sequence];
  return {
    anchorDate: anchor,
    sequence: sequence.length > 0 ? sequence : [...DEFAULT_CYCLE.sequence],
  };
}

export function templateForKind(
  kind: "day" | "night",
  day: ShiftTemplate,
  night: ShiftTemplate,
): ShiftTemplate {
  return kind === "day" ? day : night;
}

export function clockHoursFromTemplate(template: ShiftTemplate, fallback = 12): number {
  const hours = hoursBetween(template.start, template.end);
  return hours > 0 ? hours : fallback;
}

export function wakeLeadFromTemplate(template: ShiftTemplate): number {
  return minutesUntil(template.wakeTime, template.start);
}

export function formatSequence(sequence: ShiftKind[]): string {
  if (sequence.length === 0) return "empty";
  const letter = (k: ShiftKind) => (k === "day" ? "D" : k === "night" ? "N" : "O");
  return sequence.map(letter).join(" ");
}

export function nextKind(kind: ShiftKind): ShiftKind {
  if (kind === "day") return "night";
  if (kind === "night") return "off";
  return "day";
}

export { finiteNumber, sanitizeCurrency, sanitizeHhmm, nonEmptyString };
