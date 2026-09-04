/** Parse Plastics shift-planner CSV into rota entries. */

import type { RotaEntry } from "./rotaData";

export type ParsedShiftCsv = {
  byDate: Record<string, RotaEntry>;
  dates: string[];
};

export class ShiftCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftCsvParseError";
  }
}

/** Split one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function parseWarnings(raw: string | undefined): string[] {
  const t = (raw ?? "").trim();
  if (!t) return ["17:00", "20:00"];
  return t
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKind(raw: string): "day" | "night" | null {
  const k = raw.trim().toUpperCase();
  if (k === "DAY" || k === "D") return "day";
  if (k === "NIGHT" || k === "N") return "night";
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse official Plastics rota CSV text.
 * Expected columns (order flexible by header name):
 * Date, Shift, Shift start, Shift end, Previous day warnings,
 * Morning dog feed, Afternoon dog feed + reset, Get dressed,
 * Leave for work, Target arrival
 */
export function parseShiftCsv(text: string): ParsedShiftCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new ShiftCsvParseError("CSV needs a header row and at least one shift day.");
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const idx = (names: string[]) => {
    for (const name of names) {
      const i = headers.indexOf(name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const dateI = idx(["date"]);
  const shiftI = idx(["shift"]);
  const startI = idx(["shift start", "start"]);
  const endI = idx(["shift end", "end"]);
  const warnI = idx(["previous day warnings", "warnings"]);
  const morningI = idx(["morning dog feed", "morning dog feed + reset"]);
  const afternoonI = idx(["afternoon dog feed + reset", "afternoon dog feed"]);
  const dressedI = idx(["get dressed"]);
  const leaveI = idx(["leave for work"]);
  const arrivalI = idx(["target arrival"]);

  if (dateI < 0 || shiftI < 0) {
    throw new ShiftCsvParseError('CSV must include "Date" and "Shift" columns.');
  }

  const byDate: Record<string, RotaEntry> = {};
  const errors: string[] = [];

  for (let row = 1; row < lines.length; row++) {
    const cols = splitCsvLine(lines[row]);
    if (cols.every((c) => !c.trim())) continue;

    const date = (cols[dateI] ?? "").trim();
    if (!DATE_RE.test(date)) {
      errors.push(`Row ${row + 1}: invalid date "${date}" (use YYYY-MM-DD).`);
      continue;
    }

    const kind = parseKind(cols[shiftI] ?? "");
    if (!kind) {
      errors.push(`Row ${row + 1}: Shift must be DAY or NIGHT (got "${cols[shiftI] ?? ""}").`);
      continue;
    }

    const start =
      emptyToNull(cols[startI]) ?? (kind === "day" ? "06:00" : "18:00");
    const end = emptyToNull(cols[endI]) ?? (kind === "day" ? "18:00" : "06:00");

    byDate[date] = {
      date,
      kind,
      start,
      end,
      previousDayWarnings: parseWarnings(cols[warnI]),
      morningDogFeed: emptyToNull(cols[morningI]),
      afternoonDogFeed: emptyToNull(cols[afternoonI]),
      getDressed: emptyToNull(cols[dressedI]),
      leaveForWork: emptyToNull(cols[leaveI]),
      targetArrival: emptyToNull(cols[arrivalI]),
    };
  }

  if (errors.length) {
    throw new ShiftCsvParseError(errors.slice(0, 5).join(" "));
  }

  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) {
    throw new ShiftCsvParseError("No working days found in CSV.");
  }

  return { byDate, dates };
}
