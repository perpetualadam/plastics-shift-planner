import {
  finiteNumber,
  hoursBetween,
  isValidHhmm,
  minutesUntil,
  nonEmptyString,
  sanitizeCurrency,
  sanitizeHhmm,
  sanitizeLiveText,
} from "./time";

export type ShiftKind = "day" | "afters" | "night" | "off";
export type WorkingShiftKind = "day" | "afters" | "night";

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

export type ShiftTemplates = {
  day: ShiftTemplate;
  afters: ShiftTemplate;
  night: ShiftTemplate;
};

export type CycleConfig = {
  /** First date of the repeating sequence (YYYY-MM-DD). */
  anchorDate: string;
  /** Repeating day/afters/night/off pattern. Empty or invalid → all off. */
  sequence: ShiftKind[];
};

export const WORKING_KINDS: WorkingShiftKind[] = ["day", "afters", "night"];
export const SHIFT_KINDS: ShiftKind[] = ["day", "afters", "night", "off"];

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

export const DEFAULT_AFTERS_SHIFT: ShiftTemplate = {
  label: "Afters",
  start: "14:00",
  end: "22:00",
  wakeTime: "12:49",
  prepSteps: [
    { id: "dog-feed", label: "Dog feed", time: "12:49" },
    { id: "dressed", label: "Get dressed", time: "12:54" },
    { id: "leave", label: "Leave", time: "13:09" },
    { id: "arrive", label: "Arrive", time: "13:45" },
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

function fill(kind: ShiftKind, count: number): ShiftKind[] {
  return Array.from({ length: count }, () => kind);
}

export type CyclePresetGroup = "rotating" | "days" | "afters" | "nights";

export type CyclePresetId =
  | "2-2-3"
  | "nights-2-2-3"
  | "pitman-days"
  | "continental"
  | "continental-6-2"
  | "days-nights-weeks"
  | "alt-days"
  | "weekdays"
  | "4-4"
  | "5-5"
  | "7-7"
  | "alt-afters"
  | "weekdays-afters"
  | "4-4-afters"
  | "alt-nights"
  | "weekdays-nights"
  | "4-4-nights";

export type CyclePreset = {
  id: CyclePresetId;
  group: CyclePresetGroup;
  label: string;
  hint: string;
  sequence: ShiftKind[];
};

export const CYCLE_PRESET_GROUPS: { id: CyclePresetGroup; label: string }[] = [
  { id: "rotating", label: "Rotating" },
  { id: "days", label: "Days" },
  { id: "afters", label: "Afters" },
  { id: "nights", label: "Nights" },
];

export const CYCLE_PRESETS: CyclePreset[] = [
  {
    id: "2-2-3",
    group: "rotating",
    label: "2-2-3",
    hint: "2 days, 2 nights, 3 off",
    sequence: ["day", "day", "night", "night", "off", "off", "off"],
  },
  {
    id: "nights-2-2-3",
    group: "rotating",
    label: "2-2-3 nights first",
    hint: "2 nights, 2 days, 3 off",
    sequence: ["night", "night", "day", "day", "off", "off", "off"],
  },
  {
    id: "pitman-days",
    group: "rotating",
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
  {
    id: "continental",
    group: "rotating",
    label: "Continental 2-2-2-2",
    hint: "2 days, 2 afters, 2 nights, 2 off",
    sequence: ["day", "day", "afters", "afters", "night", "night", "off", "off"],
  },
  {
    id: "continental-6-2",
    group: "rotating",
    label: "Continental 6-2",
    hint: "6 days, 2 off, 6 afters, 2 off, 6 nights, 4 off",
    sequence: [
      ...fill("day", 6),
      ...fill("off", 2),
      ...fill("afters", 6),
      ...fill("off", 2),
      ...fill("night", 6),
      ...fill("off", 4),
    ],
  },
  {
    id: "days-nights-weeks",
    group: "rotating",
    label: "Days / nights weeks",
    hint: "7 days then 7 nights",
    sequence: [...fill("day", 7), ...fill("night", 7)],
  },
  {
    id: "alt-days",
    group: "days",
    label: "Alternating days",
    hint: "Day, off, repeat",
    sequence: ["day", "off"],
  },
  {
    id: "weekdays",
    group: "days",
    label: "Weekdays",
    hint: "Mon–Fri days (anchor on a Monday)",
    sequence: ["day", "day", "day", "day", "day", "off", "off"],
  },
  {
    id: "4-4",
    group: "days",
    label: "4-on / 4-off",
    hint: "4 days then 4 off",
    sequence: [...fill("day", 4), ...fill("off", 4)],
  },
  {
    id: "5-5",
    group: "days",
    label: "5-on / 5-off",
    hint: "5 days then 5 off",
    sequence: [...fill("day", 5), ...fill("off", 5)],
  },
  {
    id: "7-7",
    group: "days",
    label: "7-on / 7-off",
    hint: "7 days then 7 off",
    sequence: [...fill("day", 7), ...fill("off", 7)],
  },
  {
    id: "alt-afters",
    group: "afters",
    label: "Alternating afters",
    hint: "Afters, off, repeat",
    sequence: ["afters", "off"],
  },
  {
    id: "weekdays-afters",
    group: "afters",
    label: "Weekdays afters",
    hint: "Mon–Fri afters (anchor on a Monday)",
    sequence: ["afters", "afters", "afters", "afters", "afters", "off", "off"],
  },
  {
    id: "4-4-afters",
    group: "afters",
    label: "4-on / 4-off afters",
    hint: "4 afters then 4 off",
    sequence: [...fill("afters", 4), ...fill("off", 4)],
  },
  {
    id: "alt-nights",
    group: "nights",
    label: "Alternating nights",
    hint: "Night, off, repeat",
    sequence: ["night", "off"],
  },
  {
    id: "weekdays-nights",
    group: "nights",
    label: "Weekdays nights",
    hint: "Mon–Fri nights (anchor on a Monday)",
    sequence: ["night", "night", "night", "night", "night", "off", "off"],
  },
  {
    id: "4-4-nights",
    group: "nights",
    label: "4-on / 4-off nights",
    hint: "4 nights then 4 off",
    sequence: [...fill("night", 4), ...fill("off", 4)],
  },
];

export function isWorkingShiftKind(value: unknown): value is WorkingShiftKind {
  return value === "day" || value === "afters" || value === "night";
}

export function isShiftKind(value: unknown): value is ShiftKind {
  return value === "day" || value === "afters" || value === "night" || value === "off";
}

export function isRotaSource(value: unknown): value is RotaSource {
  return value === "csv" || value === "cycle" || value === "manual";
}

export function kindLetter(kind: ShiftKind): string {
  if (kind === "day") return "D";
  if (kind === "afters") return "A";
  if (kind === "night") return "N";
  return "O";
}

export function kindLabel(kind: ShiftKind): string {
  if (kind === "day") return "Day";
  if (kind === "afters") return "Afters";
  if (kind === "night") return "Night";
  return "Off";
}

export function sequencesMatch(a: ShiftKind[], b: ShiftKind[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

export function matchingPreset(sequence: ShiftKind[]): CyclePreset | undefined {
  return CYCLE_PRESETS.find((preset) => sequencesMatch(preset.sequence, sequence));
}

function sanitizePrepSteps(raw: unknown, fallback: PrepStep[]): PrepStep[] {
  if (!Array.isArray(raw)) return fallback.map((s) => ({ ...s }));
  const out: PrepStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<PrepStep>;
    const time = isValidHhmm(rec.time) ? sanitizeHhmm(rec.time) : "";
    if (!time) continue;
    const label = sanitizeLiveText(rec.label, 40, "");
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
    label: sanitizeLiveText(rec.label, 40, fallback.label) || fallback.label,
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

export function templateForKind(kind: WorkingShiftKind, templates: ShiftTemplates): ShiftTemplate {
  return templates[kind];
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
  return sequence.map(kindLetter).join(" ");
}

export function nextKind(kind: ShiftKind): ShiftKind {
  if (kind === "day") return "afters";
  if (kind === "afters") return "night";
  if (kind === "night") return "off";
  return "day";
}

export function wakeFieldsForKind(
  kind: WorkingShiftKind,
  settings: {
    dayWakeLeadMinutes?: number;
    aftersWakeLeadMinutes?: number;
    nightWakeLeadMinutes?: number;
    dayWakeTime?: string;
    aftersWakeTime?: string;
    nightWakeTime?: string;
  },
): { lead: number; time: string } {
  if (kind === "day") {
    return { lead: settings.dayWakeLeadMinutes ?? 71, time: settings.dayWakeTime ?? "" };
  }
  if (kind === "afters") {
    return { lead: settings.aftersWakeLeadMinutes ?? 71, time: settings.aftersWakeTime ?? "" };
  }
  return { lead: settings.nightWakeLeadMinutes ?? 71, time: settings.nightWakeTime ?? "" };
}

export { finiteNumber, sanitizeCurrency, sanitizeHhmm, nonEmptyString, sanitizeLiveText };
