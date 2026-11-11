/**
 * Time handling.
 *
 * The database stores every moment in UTC. People think in local wall-clock
 * time, so everything on screen goes through the helpers in this file.
 *
 * Vocabulary used throughout the app:
 *   - "iso":     a UTC instant as an ISO 8601 string, e.g. "2026-11-20T23:00:00.000Z"
 *   - "zone":    an IANA time zone name, e.g. "America/New_York"
 *   - "day key": a calendar date in some zone, "YYYY-MM-DD"
 *   - "minutes": minutes after local midnight, 0…1440 (1440 = end of that day)
 *
 * All functions are pure and take the zone explicitly so they can be tested
 * for any time zone and any date, including daylight-saving changes.
 */
import { DateTime } from "luxon";
import { DAY_END_MIN, DAY_START_MIN } from "./constants";

export type DayKey = string;

export interface DaySegment {
  dayKey: DayKey;
  /** Minutes after local midnight, inclusive. */
  startMin: number;
  /** Minutes after local midnight, exclusive; 1440 means "to the end of the day". */
  endMin: number;
}

/** The time zone of the device the app is running on. */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Falls back to UTC for a zone name the runtime does not know. */
export function safeZone(zone: string | null | undefined): string {
  if (zone && DateTime.now().setZone(zone).isValid) return zone;
  return "UTC";
}

function parseIso(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: "utc" });
}

function toIso(dt: DateTime): string {
  return dt.toUTC().toISO({ suppressMilliseconds: false }) as string;
}

// ---------------------------------------------------------------------------
// Day keys
// ---------------------------------------------------------------------------

export function todayKey(zone: string, now: Date = new Date()): DayKey {
  return DateTime.fromJSDate(now, { zone }).toISODate() as DayKey;
}

/** Calendar-date arithmetic; independent of any time zone. */
export function addDays(dayKey: DayKey, days: number): DayKey {
  return DateTime.fromISO(dayKey, { zone: "utc" }).plus({ days }).toISODate() as DayKey;
}

export function diffDays(from: DayKey, to: DayKey): number {
  const a = DateTime.fromISO(from, { zone: "utc" });
  const b = DateTime.fromISO(to, { zone: "utc" });
  return Math.round(b.diff(a, "days").days);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(dayKey: DayKey): number {
  return DateTime.fromISO(dayKey, { zone: "utc" }).weekday;
}

/** The Monday on or before the given day. */
export function startOfWeek(dayKey: DayKey): DayKey {
  return addDays(dayKey, 1 - weekdayOf(dayKey));
}

/** Consecutive day keys starting at `first`. */
export function dayRange(first: DayKey, count: number): DayKey[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

// ---------------------------------------------------------------------------
// Converting between local wall-clock time and UTC
// ---------------------------------------------------------------------------

/**
 * The UTC instant of a local wall-clock time.
 *
 * `minutes` may be 1440, meaning midnight at the end of that day. Daylight
 * saving is handled by the zone database: a time that does not exist (the
 * skipped hour in spring) moves forward to the next real time, and a time that
 * happens twice (the repeated hour in autumn) resolves to its first occurrence.
 */
export function zonedToUtc(dayKey: DayKey, minutes: number, zone: string): string {
  const days = Math.floor(minutes / 1440);
  const rest = minutes - days * 1440;
  // Add whole days on the calendar (not 24-hour steps) so local midnight stays midnight.
  const midnight = DateTime.fromISO(dayKey, { zone }).plus({ days });
  return toIso(midnight.set({ hour: Math.floor(rest / 60), minute: rest % 60 }));
}

/** The local date and minutes-after-midnight of a UTC instant. */
export function utcToZoned(iso: string, zone: string): { dayKey: DayKey; minutes: number } {
  const local = parseIso(iso).setZone(zone);
  return { dayKey: local.toISODate() as DayKey, minutes: local.hour * 60 + local.minute };
}

/**
 * Split a UTC range into one piece per local calendar day it touches.
 * A two-hour block that crosses midnight for the viewer becomes two segments.
 */
export function splitByDay(startIso: string, endIso: string, zone: string): DaySegment[] {
  const start = utcToZoned(startIso, zone);
  const end = utcToZoned(endIso, zone);
  const segments: DaySegment[] = [];
  const days = diffDays(start.dayKey, end.dayKey);
  for (let i = 0; i <= days; i++) {
    const dayKey = addDays(start.dayKey, i);
    const startMin = i === 0 ? start.minutes : 0;
    const endMin = i === days ? end.minutes : 1440;
    if (endMin > startMin) segments.push({ dayKey, startMin, endMin });
  }
  return segments;
}

/** Trim a segment to the hours the calendar shows; null if nothing is left. */
export function clipToVisibleHours(segment: DaySegment): DaySegment | null {
  const startMin = Math.max(segment.startMin, DAY_START_MIN);
  const endMin = Math.min(segment.endMin, DAY_END_MIN);
  return endMin > startMin ? { dayKey: segment.dayKey, startMin, endMin } : null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * "7 PM", "7:30 PM". The end of the day (1440) is written "11:59 PM", matching
 * the last label on the calendar.
 */
export function formatMinutes(minutes: number): string {
  if (minutes >= 1440) return "11:59 PM";
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "7 – 9:30 PM" or "11 AM – 1 PM" (the first AM/PM is dropped when both match). */
export function formatMinuteRange(startMin: number, endMin: number): string {
  const start = formatMinutes(startMin);
  const end = formatMinutes(endMin);
  const startSuffix = start.slice(-2);
  const endSuffix = end.slice(-2);
  return startSuffix === endSuffix ? `${start.slice(0, -3)} – ${end}` : `${start} – ${end}`;
}

/** "Fri, Nov 20" */
export function formatDayKey(dayKey: DayKey, style: "short" | "long" = "short"): string {
  const dt = DateTime.fromISO(dayKey, { zone: "utc" });
  return style === "long" ? dt.toFormat("cccc, LLLL d") : dt.toFormat("ccc, LLL d");
}

/**
 * A UTC range as the viewer reads it: "Fri, Nov 20 · 7 – 9:30 PM".
 * Ranges that end on a later local day spell out both ends.
 */
export function formatRange(startIso: string, endIso: string, zone: string, style: "short" | "long" = "short"): string {
  const start = utcToZoned(startIso, zone);
  const end = utcToZoned(endIso, zone);
  const endsAtMidnight = end.minutes === 0 && diffDays(start.dayKey, end.dayKey) === 1;
  if (start.dayKey === end.dayKey || endsAtMidnight) {
    return `${formatDayKey(start.dayKey, style)} · ${formatMinuteRange(start.minutes, endsAtMidnight ? 1440 : end.minutes)}`;
  }
  return `${formatDayKey(start.dayKey, style)} ${formatMinutes(start.minutes)} – ${formatDayKey(end.dayKey, style)} ${formatMinutes(end.minutes)}`;
}

/** Just the hours of a UTC range: "7 – 9:30 PM". */
export function formatTimeRange(startIso: string, endIso: string, zone: string): string {
  const start = utcToZoned(startIso, zone);
  const end = utcToZoned(endIso, zone);
  const endMin = end.dayKey !== start.dayKey && end.minutes === 0 ? 1440 : end.minutes;
  return formatMinuteRange(start.minutes, endMin);
}

/** "Fridays" for a weekly repeat, read in the viewer's zone. */
export function weekdayName(iso: string, zone: string): string {
  return parseIso(iso).setZone(zone).toFormat("cccc");
}

/** Short zone label for the viewer, e.g. "EST" or "GMT-5". */
export function zoneAbbreviation(iso: string, zone: string): string {
  return parseIso(iso).setZone(zone).toFormat("ZZZZ");
}

/** "just now", "5 min ago", "3 h ago", "Nov 20". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = parseIso(iso);
  const seconds = Math.max(0, (now.getTime() - then.toMillis()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return then.toLocal().toFormat("LLL d");
}

/** Clock time of a chat message: "7:42 PM". */
export function formatClock(iso: string, zone: string): string {
  return parseIso(iso).setZone(zone).toFormat("h:mm a");
}
