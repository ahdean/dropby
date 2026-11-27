/**
 * Sizes shared by the calendar views, and the conversion between minutes and
 * positions on screen.
 */
import { VISIBLE_BOUNDS, type Bounds, type Interval } from "@/lib/calendar/intervals";

/**
 * Week grid (days down, hours across). The day always fits the width of the
 * screen, so the grid never scrolls sideways; on a phone an hour is simply
 * narrower. The width of the sticky day column is the CSS variable --day-col
 * (see globals.css).
 */
export const GRID = {
  /** Height of the sticky hour header. */
  header: 30,
  /** Space above your own lane (room for the small "earlier"/"later" tabs) and below the friends' lanes. */
  rowPaddingTop: 8,
  rowPaddingBottom: 4,
  /**
   * Each day row has your own lane on top (your blocks, as thick beams) and
   * one or more friends' lanes under it (their free time as a thin line with
   * their faces, their events as slim outlined beams), so your time never
   * sits on top of theirs.
   */
  mineLane: 32,
  friendsLane: 24,
  /** Thickness of your own beams, and of friends' event beams. */
  beam: 26,
  friendBeam: 18,
  /** Size of friends' faces over their free time. */
  avatar: 20,
} as const;

/** Height of a day row with `friendLanes` friends' lanes (at least one). */
export function rowHeight(friendLanes: number): number {
  return GRID.rowPaddingTop + GRID.rowPaddingBottom + GRID.mineLane + GRID.friendsLane * Math.max(1, friendLanes);
}

/** Distance from the top of a row to the centre line of your own lane. */
export const MINE_CENTER = GRID.rowPaddingTop + GRID.mineLane / 2;

/** Distance from the top of a row to the centre line of friends' lane `lane` (0 is the one just under yours). */
export function friendsLaneCenter(lane: number): number {
  return GRID.rowPaddingTop + GRID.mineLane + GRID.friendsLane * lane + GRID.friendsLane / 2;
}

/** Single-day view (hours down). */
export const DAY = {
  hourHeight: 56,
  timeColumn: 58,
} as const;

/**
 * Position of a time as a fraction (0…1) of the hours a view shows: by default
 * the week grid's 8 AM–11 PM; the day view passes the whole day.
 */
export function fractionOf(minutes: number, bounds: Bounds = VISIBLE_BOUNDS): number {
  return (minutes - bounds.min) / (bounds.max - bounds.min);
}

/** The part of a time range inside the hours shown (a range being dragged can reach past them). */
export function clampToBounds(range: Interval, bounds: Bounds = VISIBLE_BOUNDS): Interval {
  const startMin = Math.min(bounds.max, Math.max(bounds.min, range.startMin));
  const endMin = Math.min(bounds.max, Math.max(startMin, range.endMin));
  return { startMin, endMin };
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

/** The time under a pointer, given where the track starts and how long it is on screen. */
export function minutesAt(offsetPx: number, lengthPx: number, bounds: Bounds = VISIBLE_BOUNDS): number {
  if (lengthPx <= 0) return bounds.min;
  const fraction = Math.min(1, Math.max(0, offsetPx / lengthPx));
  return bounds.min + fraction * (bounds.max - bounds.min);
}
