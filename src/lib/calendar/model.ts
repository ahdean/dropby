/**
 * Turns database rows into what the calendar draws.
 *
 * Input:  the blocks the viewer is allowed to see (their own and friends').
 * Output: for each visible day, three layers:
 *   1. `mine`          the viewer's own blocks (bars they can drag)
 *   2. `friendEvents`  friends' hosted events (emoji chips that open the event)
 *   3. `friendFree`    clusters of overlapping friends' free time (avatar stacks)
 * plus `before` and `after`: anything that lies entirely outside the hours the
 * view shows (the week grid shows 8 AM–11 PM), so it can still be reached.
 *
 * Pure: no React, no network. All time-zone work goes through lib/time.
 */
import { addDays, clipToVisibleHours, dayRange, minutesFromDay, splitByDay, zonedToUtc, type DayKey } from "../time";
import { occurrencesInRange, type Occurrence } from "../recurrence";
import type { BlockType, CalendarBlock } from "../types";
import {
  assignLanes,
  clusterOverlapping,
  coverage,
  DAY_BOUNDS,
  mergeIntervals,
  overlaps,
  peakWindow,
  type Bounds,
  type CoverageStep,
  type Interval,
} from "./intervals";

/** How a block is coloured: blue, green or gold. */
export type BlockStatus = "free" | "join" | "locked";

/**
 * One occurrence of a block, on one day. `startMin`/`endMin` (from Interval)
 * are the part drawn in this day's row: inside the hours the view shows.
 */
export interface CalendarItem extends Interval {
  /** Unique per block, occurrence and day. */
  key: string;
  block: CalendarBlock;
  occurrence: Occurrence;
  dayKey: DayKey;
  mine: boolean;
  status: BlockStatus;
  /** How many guests said "I'm in" for this occurrence. */
  inCount: number;
  /**
   * The whole occurrence, in minutes after this day's local midnight: below 0
   * when it started the day before, above 1440 when it ends the day after.
   */
  fullStartMin: number;
  fullEndMin: number;
  /** The drawn part stops short of the real start / end: it is outside the hours shown, or on another day. */
  cutStart: boolean;
  cutEnd: boolean;
  /** The whole occurrence is on this day, so it can be dragged to another time as a unit. */
  whole: boolean;
  /** None of it is inside the hours shown: it lies before the first hour or after the last. */
  offscreen: "before" | "after" | null;
}

/** Something outside the hours shown: one block or event, or a group of friends free at the same time. */
export type OffscreenEntry =
  | { kind: "item"; key: string; item: CalendarItem }
  | { kind: "friends"; key: string; cluster: FriendFreeCluster };

export interface FriendFreeCluster extends Interval {
  key: string;
  dayKey: DayKey;
  items: CalendarItem[];
  /** Distinct friends in the cluster, in order of when they become free. */
  userIds: string[];
  /** Where the most friends overlap: the avatar stack is centred here. */
  peak: CoverageStep;
  /** How many friends are free in each stretch (drives beam brightness). */
  steps: CoverageStep[];
  /** Time when every friend in the cluster is free, if there is one. */
  common: Interval | null;
}

export interface DayModel {
  dayKey: DayKey;
  mine: CalendarItem[];
  friendEvents: (CalendarItem & { lane: number })[];
  friendFree: FriendFreeCluster[];
  /** Number of stacked lanes this row needs (1 unless friends' events collide). */
  laneCount: number;
  /** What lies entirely before the first hour shown, and after the last, earliest first. */
  before: OffscreenEntry[];
  after: OffscreenEntry[];
}

/** Gold when a plan is settled: a guest is in (my event) or I am in (theirs). */
export function statusOf(block: CalendarBlock, occurrenceIndex: number, viewerId: string): { status: BlockStatus; inCount: number } {
  if (block.type === "free") return { status: "free", inCount: 0 };
  const yes = block.rsvps.filter((r) => r.occurrence === occurrenceIndex && r.status === "in");
  const mine = block.owner_id === viewerId;
  const locked = mine ? yes.length > 0 : yes.some((r) => r.user_id === viewerId);
  return { status: locked ? "locked" : "join", inCount: yes.length };
}

/**
 * Flatten blocks into per-day items for `dayCount` days starting at `firstDay`.
 * `bounds` are the hours the view draws; by default the whole day, which is
 * what checks such as "does this overlap?" need.
 */
export function expandBlocks(
  blocks: readonly CalendarBlock[],
  viewerId: string,
  zone: string,
  firstDay: DayKey,
  dayCount: number,
  bounds: Bounds = DAY_BOUNDS,
): CalendarItem[] {
  const fromIso = zonedToUtc(firstDay, 0, zone);
  const toIso = zonedToUtc(addDays(firstDay, dayCount), 0, zone);
  const lastDay = addDays(firstDay, dayCount - 1);
  const items: CalendarItem[] = [];

  for (const block of blocks) {
    for (const occurrence of occurrencesInRange(block, fromIso, toIso)) {
      const segments = splitByDay(occurrence.startIso, occurrence.endIso, zone);
      const { status, inCount } = statusOf(block, occurrence.index, viewerId);
      for (const segment of segments) {
        if (segment.dayKey < firstDay || segment.dayKey > lastDay) continue;
        const fullStartMin = minutesFromDay(occurrence.startIso, segment.dayKey, zone);
        const fullEndMin = minutesFromDay(occurrence.endIso, segment.dayKey, zone);
        const visible = clipToVisibleHours(segment, bounds);
        // Entirely outside the hours shown: keep the day's part, and say which side it is on.
        const part = visible ?? segment;
        items.push({
          key: `${block.id}:${occurrence.index}:${segment.dayKey}`,
          block,
          occurrence,
          dayKey: segment.dayKey,
          startMin: part.startMin,
          endMin: part.endMin,
          fullStartMin,
          fullEndMin,
          cutStart: part.startMin > fullStartMin,
          cutEnd: part.endMin < fullEndMin,
          whole: segments.length === 1,
          offscreen: visible ? null : segment.endMin <= bounds.min ? "before" : "after",
          mine: block.owner_id === viewerId,
          status,
          inCount,
        });
      }
    }
  }
  return items;
}

/** The part of an item on its own day, whether or not it is inside the hours shown. */
export function dayPart(item: CalendarItem): Interval {
  return { startMin: Math.max(0, item.fullStartMin), endMin: Math.min(1440, item.fullEndMin) };
}

function buildCluster(dayKey: DayKey, items: CalendarItem[]): FriendFreeCluster {
  const startMin = Math.min(...items.map((i) => i.startMin));
  const endMin = Math.max(...items.map((i) => i.endMin));
  // One friend may have two free blocks in a cluster; count people, not blocks.
  const userIds = [...new Set(items.map((i) => i.block.owner_id))];
  const perUser = (part: (item: CalendarItem) => Interval) =>
    userIds.flatMap((userId) => mergeIntervals(items.filter((i) => i.block.owner_id === userId).map(part)));
  // Who overlaps when is about the real times, even where some of it is outside the hours shown...
  const real = perUser(dayPart);
  const peak = peakWindow(real) ?? { startMin, endMin, count: userIds.length };
  return {
    key: `${dayKey}:${startMin}:${userIds.join(",")}`,
    dayKey,
    startMin,
    endMin,
    items,
    userIds,
    peak,
    // ...while the wire is drawn over the part that is shown.
    steps: coverage(perUser((i) => i)),
    common: peak.count === userIds.length ? { startMin: peak.startMin, endMin: peak.endMin } : null,
  };
}

function entryStart(entry: OffscreenEntry): number {
  return entry.kind === "item" ? entry.item.startMin : entry.cluster.startMin;
}

/** What lies entirely on one side of the hours shown: blocks and events one by one, friends' free time grouped. */
function offscreenEntries(dayKey: DayKey, items: CalendarItem[], side: "before" | "after"): OffscreenEntry[] {
  const hidden = items.filter((i) => i.offscreen === side);
  const entries: OffscreenEntry[] = hidden
    .filter((i) => i.mine || i.block.type === "join")
    .map((item) => ({ kind: "item", key: item.key, item }));
  for (const group of clusterOverlapping(hidden.filter((i) => !i.mine && i.block.type === "free"))) {
    const cluster = buildCluster(dayKey, group);
    entries.push({ kind: "friends", key: cluster.key, cluster });
  }
  return entries.sort((a, b) => entryStart(a) - entryStart(b));
}

/**
 * The three layers for each of `dayCount` days starting at `firstDay`, drawn
 * within `bounds` (by default the whole day).
 */
export function buildDayModels(
  blocks: readonly CalendarBlock[],
  viewerId: string,
  zone: string,
  firstDay: DayKey,
  dayCount: number,
  bounds: Bounds = DAY_BOUNDS,
): DayModel[] {
  const items = expandBlocks(blocks, viewerId, zone, firstDay, dayCount, bounds);
  const byDay = new Map<DayKey, CalendarItem[]>();
  for (const item of items) {
    const list = byDay.get(item.dayKey);
    if (list) list.push(item);
    else byDay.set(item.dayKey, [item]);
  }

  return dayRange(firstDay, dayCount).map((dayKey) => {
    const allItems = byDay.get(dayKey) ?? [];
    const dayItems = allItems.filter((i) => !i.offscreen);
    // Free below, hosted on top; earlier first.
    const mine = dayItems
      .filter((i) => i.mine)
      .sort((a, b) => Number(a.block.type === "join") - Number(b.block.type === "join") || a.startMin - b.startMin);
    const friendFree = clusterOverlapping(dayItems.filter((i) => !i.mine && i.block.type === "free")).map((cluster) =>
      buildCluster(dayKey, cluster),
    );
    // Friends' events share the main lane only where it is empty; otherwise
    // they stack above it so nothing is hidden.
    const { placed, laneCount } = assignLanes(
      dayItems.filter((i) => !i.mine && i.block.type === "join"),
      [[...mine, ...friendFree]],
    );
    return {
      dayKey,
      mine,
      friendEvents: placed,
      friendFree,
      laneCount,
      before: offscreenEntries(dayKey, allItems, "before"),
      after: offscreenEntries(dayKey, allItems, "after"),
    };
  });
}

/**
 * Would a block of this type at this time collide with another of the
 * viewer's blocks of the SAME type on that day? (Free time inside free time is
 * meaningless; a hosted event inside free time is fine.)
 */
export function findSameTypeConflict(
  candidate: Interval & { dayKey: DayKey; type: BlockType },
  mine: readonly CalendarItem[],
  ignoreBlockId?: string,
): CalendarItem | undefined {
  return mine.find(
    (item) =>
      item.dayKey === candidate.dayKey &&
      item.block.type === candidate.type &&
      item.block.id !== ignoreBlockId &&
      overlaps(candidate, item),
  );
}
