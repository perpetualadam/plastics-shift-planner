/** HH:MM helpers. Invalid input never throws — callers get a safe fallback. */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isValidHhmm(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value.trim());
}

/** Normalize to HH:MM, or return fallback (default "00:00"). */
export function sanitizeHhmm(value: unknown, fallback = "00:00"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const match = TIME_RE.exec(trimmed);
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number | null {
  const clean = sanitizeHhmm(hhmm, "");
  if (!clean) return null;
  const [h, m] = clean.split(":").map(Number);
  return h * 60 + m;
}

/** Clock-hours between two times. Overnight (end <= start) wraps past midnight. */
export function hoursBetween(start: string, end: string): number {
  const sm = hhmmToMinutes(start);
  const em = hhmmToMinutes(end);
  if (sm === null || em === null) return 0;
  let diff = em - sm;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

/** Minutes from `from` to `to` on a 24h clock (wraps overnight, always >= 0). */
export function minutesUntil(from: string, to: string): number {
  const a = hhmmToMinutes(from);
  const b = hhmmToMinutes(to);
  if (a === null || b === null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function applyHhmm(day: Date, hhmm: string): Date {
  const clean = sanitizeHhmm(hhmm, "00:00");
  const [h, m] = clean.split(":").map(Number);
  const out = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
  return out;
}

export function formatTimeRange(start: string, end: string): string {
  return `${sanitizeHhmm(start)} – ${sanitizeHhmm(end)}`;
}

export function finiteNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (typeof min === "number") out = Math.max(min, out);
  if (typeof max === "number") out = Math.min(max, out);
  return out;
}

export function sanitizeCurrency(value: unknown, fallback = "GBP"): string {
  if (typeof value !== "string") return fallback;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return fallback;
  return code;
}

export function nonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

/**
 * Length-limit a live-edited label without trimming trailing spaces.
 * `updateSettings` runs on every keystroke; a full `trim()` would drop the
 * space before the next word ("Acme " → "Acme" → "AcmeF").
 * Whitespace-only input becomes "".
 */
export function sanitizeLiveText(value: unknown, maxLen: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const sliced = value.slice(0, maxLen);
  return sliced.trim() === "" ? "" : sliced;
}
