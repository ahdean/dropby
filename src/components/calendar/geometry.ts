/**
 * Sizes shared by the calendar views, and the conversion between minutes and
 * positions on screen.
 */
import { DAY_START_MIN, VISIBLE_MINUTES } from "@/lib/constants";

/**
 * Week grid (days down, hours across). The day always fits the width of the
 * screen, so the grid never scrolls sideways; on a phone an hour is simply
 * narrower. The width of the sticky day column is the CSS variable --day-col
 * (see globals.css).
 */
export const GRID = {
  /** Height of the sticky hour header. */
  header: 30,
  /** Height of one lane inside a row. */
  lane: 34,
  /** Space above and below the lanes of a row. */
  rowPadding: 13,
  /** Thickness of the viewer's own beams and of friends' event beams. */
  beam: 26,
  friendBeam: 22,
  avatar: 26,
} as const;

export function rowHeight(laneCount: number): number {
  return GRID.rowPadding * 2 + GRID.lane * Math.max(1, laneCount);
}

/** Distance from the top of a row to the centre line of lane `lane` (lane 0 is the bottom one). */
export function laneCenter(laneCount: number, lane: number): number {
  return rowHeight(laneCount) - GRID.rowPadding - GRID.lane / 2 - lane * GRID.lane;
}

/** Single-day view (hours down). */
export const DAY = {
  hourHeight: 56,
  timeColumn: 58,
} as const;

/** Position of a time as a fraction (0…1) of the visible day. */
export function fractionOf(minutes: number): number {
  return (minutes - DAY_START_MIN) / VISIBLE_MINUTES;
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

/** The time under a pointer, given where the track starts and how long it is on screen. */
export function minutesAt(offsetPx: number, lengthPx: number): number {
  if (lengthPx <= 0) return DAY_START_MIN;
  const fraction = Math.min(1, Math.max(0, offsetPx / lengthPx));
  return DAY_START_MIN + fraction * VISIBLE_MINUTES;
}
