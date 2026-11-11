/**
 * Turns database rows into what the calendar draws.
 *
 * Input:  the blocks the viewer is allowed to see (their own and friends').
 * Output: for each visible day, three layers:
 *   1. `mine`          the viewer's own blocks (bars they can drag)
 *   2. `friendEvents`  friends' hosted events (emoji chips that open the event)
 *   3. `friendFree`    clusters of overlapping friends' free time (avatar stacks)
 *
 * Pure: no React, no network. All time-zone work goes through lib/time.
 */
import { addDays, clipToVisibleHours, dayRange, splitByDay, zonedToUtc, type DayKey } from "../time";
import { occurrencesInRange, type Occurrence } from "../recurrence";
import type { BlockType, CalendarBlock } from "../types";
import {
  assignLanes,
  clusterOverlapping,
  coverage,
  mergeIntervals,
  overlaps,
  peakWindow,
  type CoverageStep,
  type Interval,
} from "./intervals";

/** How a block is coloured: blue, green or gold. */
export type BlockStatus = "free" | "join" | "locked";

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
   * False when part of the occurrence is outside this row (before 6 AM, or it
   * continues on another day for this viewer). Such items are not draggable.
   */
  whole: boolean;
}

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
}

/** Gold when a plan is settled: a guest is in (my event) or I am in (theirs). */
export function statusOf(block: CalendarBlock, occurrenceIndex: number, viewerId: string): { status: BlockStatus; inCount: number } {
  if (block.type === "free") return { status: "free", inCount: 0 };
  const yes = block.rsvps.filter((r) => r.occurrence === occurrenceIndex && r.status === "in");
  const mine = block.owner_id === viewerId;
  const locked = mine ? yes.length > 0 : yes.some((r) => r.user_id === viewerId);
  return { status: locked ? "locked" : "join", inCount: yes.length };
}

/** Flatten blocks into per-day items for `dayCount` days starting at `firstDay`. */
export function expandBlocks(
  blocks: readonly CalendarBlock[],
  viewerId: string,
  zone: string,
  firstDay: DayKey,
  dayCount: number,
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
        const visible = clipToVisibleHours(segment);
        if (!visible) continue;
        items.push({
          key: `${block.id}:${occurrence.index}:${segment.dayKey}`,
          block,
          occurrence,
          dayKey: segment.dayKey,
          startMin: visible.startMin,
          endMin: visible.endMin,
          mine: block.owner_id === viewerId,
          status,
          inCount,
          whole:
            segments.length === 1 &&
            visible.startMin === segment.startMin &&
            visible.endMin === segment.endMin,
        });
      }
    }
  }
  return items;
}

function buildCluster(dayKey: DayKey, items: CalendarItem[]): FriendFreeCluster {
  const startMin = Math.min(...items.map((i) => i.startMin));
  const endMin = Math.max(...items.map((i) => i.endMin));
  // One friend may have two free blocks in a cluster; count people, not blocks.
  const userIds = [...new Set(items.map((i) => i.block.owner_id))];
  const perUser = userIds.flatMap((userId) => mergeIntervals(items.filter((i) => i.block.owner_id === userId)));
  const peak = peakWindow(perUser) ?? { startMin, endMin, count: userIds.length };
  return {
    key: `${dayKey}:${startMin}:${userIds.join(",")}`,
    dayKey,
    startMin,
    endMin,
    items,
    userIds,
    peak,
    steps: coverage(perUser),
    common: peak.count === userIds.length ? { startMin: peak.startMin, endMin: peak.endMin } : null,
  };
}

/** The three layers for each of `dayCount` days starting at `firstDay`. */
export function buildDayModels(
  blocks: readonly CalendarBlock[],
  viewerId: string,
  zone: string,
  firstDay: DayKey,
  dayCount: number,
): DayModel[] {
  const items = expandBlocks(blocks, viewerId, zone, firstDay, dayCount);
  const byDay = new Map<DayKey, CalendarItem[]>();
  for (const item of items) {
    const list = byDay.get(item.dayKey);
    if (list) list.push(item);
    else byDay.set(item.dayKey, [item]);
  }

  return dayRange(firstDay, dayCount).map((dayKey) => {
    const dayItems = byDay.get(dayKey) ?? [];
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
    return { dayKey, mine, friendEvents: placed, friendFree, laneCount };
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
