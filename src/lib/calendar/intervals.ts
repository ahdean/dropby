/**
 * Interval arithmetic for one calendar day.
 *
 * Everything here works on "minutes after local midnight" and is half-open:
 * an interval covers [startMin, endMin). So 6–7 PM and 7–8 PM touch but do
 * not overlap.
 *
 * Pure functions, no dates, no DOM: easy to test and reuse.
 */
import { DAY_END_MIN, DAY_START_MIN, MIN_BLOCK_MINUTES, SNAP_MINUTES } from "../constants";

export interface Interval {
  startMin: number;
  endMin: number;
}

export interface Bounds {
  min: number;
  max: number;
}

export const VISIBLE_BOUNDS: Bounds = { min: DAY_START_MIN, max: DAY_END_MIN };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function duration(interval: Interval): number {
  return interval.endMin - interval.startMin;
}

/** Round to the nearest snap step (30 minutes by default). */
export function snapMinutes(value: number, step: number = SNAP_MINUTES): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Turn a drag gesture (where it started, where the pointer is now) into a
 * block: snapped, inside the visible hours and at least the minimum length.
 * Dragging right-to-left works the same as left-to-right.
 */
export function rangeFromDrag(
  anchorMin: number,
  currentMin: number,
  bounds: Bounds = VISIBLE_BOUNDS,
  step: number = SNAP_MINUTES,
  minLength: number = MIN_BLOCK_MINUTES,
): Interval {
  const forward = currentMin >= anchorMin;
  let startMin = clamp(Math.floor(Math.min(anchorMin, currentMin) / step) * step, bounds.min, bounds.max);
  let endMin = clamp(Math.ceil(Math.max(anchorMin, currentMin) / step) * step, bounds.min, bounds.max);
  if (endMin - startMin < minLength) {
    if (forward) endMin = startMin + minLength;
    else startMin = endMin - minLength;
  }
  // Push back inside the day if the minimum length overflowed an edge.
  if (endMin > bounds.max) {
    endMin = bounds.max;
    startMin = Math.min(startMin, endMin - minLength);
  }
  if (startMin < bounds.min) {
    startMin = bounds.min;
    endMin = Math.max(endMin, startMin + minLength);
  }
  return { startMin, endMin };
}

/** Slide a block by `deltaMin`, keeping its length and staying inside the day. */
export function moveInterval(
  interval: Interval,
  deltaMin: number,
  bounds: Bounds = VISIBLE_BOUNDS,
  step: number = SNAP_MINUTES,
): Interval {
  const length = duration(interval);
  const startMin = clamp(snapMinutes(interval.startMin + deltaMin, step), bounds.min, bounds.max - length);
  return { startMin, endMin: startMin + length };
}

/** Drag one edge of a block to `toMin`; the other edge stays put. */
export function resizeInterval(
  interval: Interval,
  edge: "start" | "end",
  toMin: number,
  bounds: Bounds = VISIBLE_BOUNDS,
  step: number = SNAP_MINUTES,
  minLength: number = MIN_BLOCK_MINUTES,
): Interval {
  if (edge === "start") {
    const startMin = clamp(snapMinutes(toMin, step), bounds.min, interval.endMin - minLength);
    return { startMin, endMin: interval.endMin };
  }
  const endMin = clamp(snapMinutes(toMin, step), interval.startMin + minLength, bounds.max);
  return { startMin: interval.startMin, endMin };
}

/** The first of `others` that overlaps `candidate`, if any. */
export function findOverlap<T extends Interval>(candidate: Interval, others: readonly T[]): T | undefined {
  return others.find((other) => overlaps(candidate, other));
}

/** Union of intervals: overlapping or touching ones are merged, result is sorted. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, current.endMin);
    } else {
      merged.push({ startMin: current.startMin, endMin: current.endMin });
    }
  }
  return merged;
}

/** The time everyone has in common, or null if there is none. */
export function intersection(intervals: readonly Interval[]): Interval | null {
  if (intervals.length === 0) return null;
  const startMin = Math.max(...intervals.map((i) => i.startMin));
  const endMin = Math.min(...intervals.map((i) => i.endMin));
  return endMin > startMin ? { startMin, endMin } : null;
}

export interface CoverageStep extends Interval {
  /** How many of the input intervals cover this stretch. */
  count: number;
}

/**
 * How many intervals cover each stretch of time, as a step function.
 * [5–9, 6–8] → 5–6 ×1, 6–8 ×2, 8–9 ×1. Gaps are left out.
 */
export function coverage(intervals: readonly Interval[]): CoverageStep[] {
  const edges = [...new Set(intervals.flatMap((i) => [i.startMin, i.endMin]))].sort((a, b) => a - b);
  const steps: CoverageStep[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const step = { startMin: edges[i], endMin: edges[i + 1] };
    const count = intervals.filter((interval) => overlaps(interval, step)).length;
    if (count === 0) continue;
    const last = steps[steps.length - 1];
    if (last && last.count === count && last.endMin === step.startMin) last.endMin = step.endMin;
    else steps.push({ ...step, count });
  }
  return steps;
}

/** The stretch covered by the most intervals (the earliest one if tied). */
export function peakWindow(intervals: readonly Interval[]): CoverageStep | null {
  let best: CoverageStep | null = null;
  for (const step of coverage(intervals)) {
    if (!best || step.count > best.count) best = step;
  }
  return best;
}

/**
 * Group intervals into clusters of things that overlap, directly or through a
 * chain (A overlaps B, B overlaps C → one cluster). Touching is not overlapping.
 */
export function clusterOverlapping<T extends Interval>(items: readonly T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const clusters: T[][] = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (clusters.length === 0 || item.startMin >= clusterEnd) {
      clusters.push([item]);
      clusterEnd = item.endMin;
    } else {
      clusters[clusters.length - 1].push(item);
      clusterEnd = Math.max(clusterEnd, item.endMin);
    }
  }
  return clusters;
}

/**
 * Give each item the lowest lane (0, 1, 2 …) in which it overlaps nothing
 * already placed there. `reserved[n]` lists intervals that already occupy
 * lane n before any item is placed.
 */
export function assignLanes<T extends Interval>(
  items: readonly T[],
  reserved: readonly (readonly Interval[])[] = [],
): { placed: (T & { lane: number })[]; laneCount: number } {
  const lanes: Interval[][] = reserved.map((lane) => [...lane]);
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed = sorted.map((item) => {
    let lane = 0;
    while (lanes[lane] && findOverlap(item, lanes[lane])) lane++;
    (lanes[lane] ??= []).push(item);
    return { ...item, lane };
  });
  return { placed, laneCount: Math.max(1, lanes.length) };
}
