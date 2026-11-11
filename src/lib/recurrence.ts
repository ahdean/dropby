/**
 * Weekly repeats.
 *
 * A repeating block is one database row. Occurrence `n` happens `n` weeks after
 * the first one, at the same local wall-clock time in the zone the block was
 * created in (`block.tz`). Doing the arithmetic in that zone, rather than
 * adding 7 × 24 hours, is what keeps "Tuesdays at 6 PM" at 6 PM when daylight
 * saving starts or ends.
 */
import { DateTime } from "luxon";
import { safeZone } from "./time";
import type { BlockRow } from "./types";

export interface Occurrence {
  /** 0 for a one-off block; the week number for a weekly repeat. */
  index: number;
  startIso: string;
  endIso: string;
}

type RecurringFields = Pick<
  BlockRow,
  "start_at" | "end_at" | "tz" | "repeat_weekly" | "repeat_count" | "skipped_occurrences"
>;

/** Safety net so a malformed row can never spin forever. */
const MAX_OCCURRENCES_PER_QUERY = 520;

function iso(dt: DateTime): string {
  return dt.toUTC().toISO() as string;
}

/** Start and end of occurrence `index` (not checked against skips or the count). */
export function occurrenceAt(block: RecurringFields, index: number): Occurrence {
  if (!block.repeat_weekly || index === 0) {
    return { index: 0, startIso: iso(DateTime.fromISO(block.start_at, { zone: "utc" })), endIso: iso(DateTime.fromISO(block.end_at, { zone: "utc" })) };
  }
  const zone = safeZone(block.tz);
  const start = DateTime.fromISO(block.start_at, { zone: "utc" }).setZone(zone).plus({ weeks: index });
  const end = DateTime.fromISO(block.end_at, { zone: "utc" }).setZone(zone).plus({ weeks: index });
  return { index, startIso: iso(start), endIso: iso(end) };
}

/** Does occurrence `index` exist (inside the count and not individually deleted)? */
export function occurrenceExists(block: RecurringFields, index: number): boolean {
  if (index < 0 || !Number.isInteger(index)) return false;
  if (!block.repeat_weekly) return index === 0;
  if (block.repeat_count !== null && index >= block.repeat_count) return false;
  return !block.skipped_occurrences.includes(index);
}

/** Every occurrence that overlaps the half-open range [fromIso, toIso). */
export function occurrencesInRange(block: RecurringFields, fromIso: string, toIso: string): Occurrence[] {
  const from = DateTime.fromISO(fromIso, { zone: "utc" }).toMillis();
  const to = DateTime.fromISO(toIso, { zone: "utc" }).toMillis();
  const overlapsRange = (o: Occurrence) =>
    DateTime.fromISO(o.startIso).toMillis() < to && DateTime.fromISO(o.endIso).toMillis() > from;

  if (!block.repeat_weekly) {
    const only = occurrenceAt(block, 0);
    return overlapsRange(only) ? [only] : [];
  }

  const firstStart = DateTime.fromISO(block.start_at, { zone: "utc" }).toMillis();
  const week = 7 * 24 * 60 * 60 * 1000;
  // Start one week early: local-time arithmetic can differ from 7×24h by an hour.
  let index = Math.max(0, Math.floor((from - firstStart) / week) - 1);
  const limit = block.repeat_count ?? Number.POSITIVE_INFINITY;
  const result: Occurrence[] = [];

  for (let guard = 0; guard < MAX_OCCURRENCES_PER_QUERY && index < limit; guard++, index++) {
    const occurrence = occurrenceAt(block, index);
    if (DateTime.fromISO(occurrence.startIso).toMillis() >= to) break;
    if (occurrenceExists(block, index) && overlapsRange(occurrence)) result.push(occurrence);
  }
  return result;
}

/**
 * The first occurrence that has not finished yet (or the last one, if the
 * series is over). Used to pick which date an event page shows by default.
 */
export function nextOccurrence(block: RecurringFields, now: Date = new Date()): Occurrence {
  if (!block.repeat_weekly) return occurrenceAt(block, 0);
  const from = now.toISOString();
  const horizon = DateTime.fromJSDate(now).plus({ weeks: 60 }).toUTC().toISO() as string;
  const upcoming = occurrencesInRange(block, from, horizon);
  if (upcoming.length > 0) return upcoming[0];

  // Series finished: fall back to the last occurrence that exists.
  const last = (block.repeat_count ?? 1) - 1;
  for (let index = last; index >= 0; index--) {
    if (occurrenceExists(block, index)) return occurrenceAt(block, index);
  }
  return occurrenceAt(block, 0);
}

/**
 * New start/end for the whole series after one occurrence was dragged to a new
 * time. The move is applied as a local wall-clock shift in the block's zone, so
 * every other occurrence moves by the same amount on the clock.
 */
export function shiftSeries(
  block: RecurringFields,
  occurrenceIndex: number,
  newStartIso: string,
  newEndIso: string,
): { start_at: string; end_at: string } {
  if (!block.repeat_weekly || occurrenceIndex === 0) {
    return { start_at: newStartIso, end_at: newEndIso };
  }
  const zone = safeZone(block.tz);
  const start = DateTime.fromISO(newStartIso, { zone: "utc" }).setZone(zone).minus({ weeks: occurrenceIndex });
  const end = DateTime.fromISO(newEndIso, { zone: "utc" }).setZone(zone).minus({ weeks: occurrenceIndex });
  return { start_at: iso(start), end_at: iso(end) };
}
