"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { DAY_END_HOUR, DAY_START_HOUR, DAY_START_MIN, VISIBLE_HOURS } from "@/lib/constants";
import type { CalendarItem, DayModel, FriendFreeCluster } from "@/lib/calendar/model";
import { addDays, formatDayKey, formatMinutes, weekdayOf, type DayKey } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { FriendEventBeam, FriendStack, GhostBeam, MyBeam } from "./Beams";
import { GRID, GRID_MIN_WIDTH, fractionOf, laneCenter, minutesAt, percent, rowHeight } from "./geometry";
import { useBlockGestures, type DayRange, type Ghost } from "./useBlockGestures";

const WEEKDAY_LETTER = ["", "M", "T", "W", "T", "F", "S", "S"];
const WEEKDAY_NAME = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: VISIBLE_HOURS }, (_, i) => DAY_START_HOUR + i);

interface RowProps {
  day: DayModel;
  isToday: boolean;
  isPast: boolean;
  /** Minutes after midnight right now; only passed to today's row. */
  nowMin: number | null;
  ghost: Ghost | null;
  /** Key of the item being dragged, if it lives in this row (it is dimmed). */
  draggingKey: string | null;
  profiles: Map<string, Profile>;
  registerTrack: (dayKey: DayKey, element: HTMLElement | null) => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenCluster: (cluster: FriendFreeCluster) => void;
}

/** Left/width of a time span along the track, as CSS percentages. */
function span(startMin: number, endMin: number) {
  return { left: percent(fractionOf(startMin)), width: percent(fractionOf(endMin) - fractionOf(startMin)) };
}

const DayRow = memo(function DayRow({
  day,
  isToday,
  isPast,
  nowMin,
  ghost,
  draggingKey,
  profiles,
  registerTrack,
  onOpenItem,
  onOpenCluster,
}: RowProps) {
  const height = rowHeight(day.laneCount);
  const main = laneCenter(day.laneCount, 0);
  const weekday = weekdayOf(day.dayKey);
  const dayNumber = Number(day.dayKey.slice(8));
  const isWeekend = weekday >= 6;

  return (
    <div role="row" className={`flex ${isPast ? "opacity-55" : ""}`} style={{ height }} data-day-row={day.dayKey}>
      {/* sticky day label */}
      <div
        role="rowheader"
        className="sticky left-0 z-20 flex shrink-0 items-center justify-center border-b-2 border-r-2 border-black bg-panel"
        style={{ width: GRID.dayColumn }}
      >
        <span
          className={`tile flex h-11 w-10 flex-col items-center justify-center leading-none ${isToday ? "tile-locked" : ""}`}
          aria-label={`${WEEKDAY_NAME[weekday]}, ${formatDayKey(day.dayKey, "long")}${isToday ? ", today" : ""}`}
        >
          <span className="font-display text-[8px]" aria-hidden="true">
            {WEEKDAY_LETTER[weekday]}
          </span>
          <span className="mt-1 text-[22px] leading-none" aria-hidden="true">
            {dayNumber}
          </span>
        </span>
      </div>

      {/* the track */}
      <div
        ref={(element) => registerTrack(day.dayKey, element)}
        role="gridcell"
        data-gesture="empty"
        aria-label={`${formatDayKey(day.dayKey, "long")}. Drag to add a block.`}
        className={`track relative flex-1 border-b-2 border-black ${isWeekend ? "track-weekend" : ""} ${
          isPast ? "cursor-default" : "cursor-crosshair"
        }`}
      >
        {/* the rail the beams travel along */}
        <div className="pointer-events-none absolute inset-x-0 h-[2px] bg-line/70" style={{ top: main - 1 }} aria-hidden="true" />

        {/* friends' free time: a thin wire, brighter where more of them overlap */}
        {day.friendFree.map((cluster) =>
          cluster.steps.map((step) => (
            <div
              key={`${cluster.key}:${step.startMin}`}
              className="wire pointer-events-none z-[1]"
              style={{ ...span(step.startMin, step.endMin), top: main - 2, opacity: Math.min(1, 0.45 + 0.25 * step.count) }}
              aria-hidden="true"
            />
          )),
        )}

        {/* my blocks */}
        {day.mine.map((item) => (
          <MyBeam
            key={item.key}
            item={item}
            onOpen={onOpenItem}
            dimmed={item.key === draggingKey}
            style={{ ...span(item.startMin, item.endMin), top: main - GRID.beam / 2, height: GRID.beam }}
          />
        ))}

        {/* friends' events */}
        {day.friendEvents.map((item) => (
          <FriendEventBeam
            key={item.key}
            item={item}
            host={profiles.get(item.block.owner_id)}
            onOpen={onOpenItem}
            style={{
              ...span(item.startMin, item.endMin),
              top: laneCenter(day.laneCount, item.lane) - GRID.friendBeam / 2,
              height: GRID.friendBeam,
            }}
          />
        ))}

        {/* friends' faces, centred where the most of them are free */}
        {day.friendFree.map((cluster) => (
          <FriendStack
            key={cluster.key}
            cluster={cluster}
            people={cluster.userIds.map((id) => profiles.get(id))}
            onOpen={onOpenCluster}
            style={{
              left: percent(fractionOf((cluster.peak.startMin + cluster.peak.endMin) / 2)),
              top: main,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}

        {/* now marker */}
        {nowMin !== null && nowMin >= DAY_START_MIN && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[7] w-[2px] bg-locked"
            style={{ left: percent(fractionOf(nowMin)), boxShadow: "0 0 6px var(--color-locked)" }}
            role="img"
            aria-label={`Now: ${formatMinutes(nowMin)}`}
          />
        )}

        {ghost && (
          <GhostBeam ghost={ghost} style={{ ...span(ghost.startMin, ghost.endMin), top: main - GRID.beam / 2, height: GRID.beam }} />
        )}
      </div>
    </div>
  );
});

function weekLabel(firstDay: DayKey, thisWeek: DayKey): string {
  const range = `${formatDayKey(firstDay).split(", ")[1]} – ${formatDayKey(addDays(firstDay, 6)).split(", ")[1]}`;
  if (firstDay === thisWeek) return `This week · ${range}`;
  if (firstDay === addDays(thisWeek, 7)) return `Next week · ${range}`;
  if (firstDay === addDays(thisWeek, -7)) return `Last week · ${range}`;
  return range;
}

export interface WeekGridProps {
  days: DayModel[];
  today: DayKey;
  thisWeek: DayKey;
  nowMin: number;
  profiles: Map<string, Profile>;
  /** A day to bring into view (from a notification link). */
  focusDay?: DayKey | null;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onCreate: (range: DayRange) => void;
  onChange: (item: CalendarItem, next: DayRange) => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenCluster: (cluster: FriendFreeCluster) => void;
}

/**
 * The main calendar: one row per day, one column per hour.
 * It scrolls in both directions inside its frame; the hour header stays on
 * top and the day column stays on the left.
 */
export function WeekGrid({
  days,
  today,
  thisWeek,
  nowMin,
  profiles,
  focusDay,
  canLoadMore,
  onLoadMore,
  onCreate,
  onChange,
  onOpenItem,
  onOpenCluster,
}: WeekGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const tracks = useRef(new Map<DayKey, HTMLElement>());

  const registerTrack = useCallback((dayKey: DayKey, element: HTMLElement | null) => {
    if (element) tracks.current.set(dayKey, element);
    else tracks.current.delete(dayKey);
  }, []);

  const myItems = useMemo(() => new Map(days.flatMap((d) => d.mine).map((item) => [item.key, item])), [days]);

  /** Which day row and time is under this screen position? The nearest row wins. */
  const locate = useCallback((clientX: number, clientY: number) => {
    let best: { dayKey: DayKey; rect: DOMRect } | null = null;
    let bestDistance = Infinity;
    for (const [dayKey, element] of tracks.current) {
      const rect = element.getBoundingClientRect();
      const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { dayKey, rect };
        if (distance === 0) break;
      }
    }
    if (!best) return null;
    return { dayKey: best.dayKey, minute: minutesAt(clientX - best.rect.left, best.rect.width) };
  }, []);

  const { ghost, onPointerDown } = useBlockGestures({
    containerRef: scroller,
    locate,
    itemByKey: (key) => myItems.get(key),
    canCreateOn: (dayKey) => dayKey >= today,
    onCreate,
    onChange,
    onOpen: onOpenItem,
  });

  // Load another week when the bottom of the list scrolls into view.
  useEffect(() => {
    const target = sentinel.current;
    const root = scroller.current;
    if (!target || !root || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, onLoadMore, days.length]);

  // On first show, scroll sideways so "now" (or the morning) is in view on narrow screens.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    const root = scroller.current;
    if (!root || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const trackWidth = root.scrollWidth - GRID.dayColumn;
    const target = Math.max(DAY_START_MIN, nowMin - 90);
    root.scrollLeft = Math.max(0, fractionOf(target) * trackWidth - 8);
  }, [nowMin]);

  // Bring a requested day into view.
  useEffect(() => {
    if (!focusDay) return;
    const row = scroller.current?.querySelector<HTMLElement>(`[data-day-row="${focusDay}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusDay, days.length]);

  return (
    <div className="mesh flex min-h-0 flex-1 flex-col p-[6px]">
      <div
        ref={scroller}
        role="grid"
        aria-label="Calendar: days down, hours across"
        aria-rowcount={days.length}
        onPointerDown={onPointerDown}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-void/90 [-webkit-touch-callout:none]"
      >
        <div style={{ minWidth: GRID_MIN_WIDTH }}>
          {/* hour header */}
          <div role="row" className="sticky top-0 z-30 flex border-b-2 border-black bg-panel-2" style={{ height: GRID.header }}>
            <div className="sticky left-0 z-40 shrink-0 border-r-2 border-black bg-panel-2" style={{ width: GRID.dayColumn }} />
            <div className="relative flex-1">
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  role="columnheader"
                  className="absolute top-0 flex h-full items-center border-l-2 border-line/60 pl-1 font-display text-[8px] text-ink-dim"
                  style={{ left: percent(fractionOf(hour * 60)), width: percent(1 / VISIBLE_HOURS) }}
                >
                  {formatMinutes(hour * 60)}
                </span>
              ))}
              <span className="sr-only">Columns run from {formatMinutes(DAY_START_HOUR * 60)} to {formatMinutes(DAY_END_HOUR * 60)}.</span>
            </div>
          </div>

          {days.map((day, index) => {
            const startsWeek = weekdayOf(day.dayKey) === 1 || index === 0;
            const rowGhost = ghost && ghost.dayKey === day.dayKey ? ghost : null;
            const dragging = ghost?.item && ghost.item.dayKey === day.dayKey ? ghost.item.key : null;
            return (
              <div key={day.dayKey}>
                {startsWeek && (
                  <div className="flex h-6 items-center border-b-2 border-black bg-panel-3/80">
                    <span className="sticky left-0 px-2 font-display text-[8px] uppercase text-ink-dim">
                      {weekLabel(day.dayKey, thisWeek)}
                    </span>
                  </div>
                )}
                <DayRow
                  day={day}
                  isToday={day.dayKey === today}
                  isPast={day.dayKey < today}
                  nowMin={day.dayKey === today ? nowMin : null}
                  ghost={rowGhost}
                  draggingKey={dragging}
                  profiles={profiles}
                  registerTrack={registerTrack}
                  onOpenItem={onOpenItem}
                  onOpenCluster={onOpenCluster}
                />
              </div>
            );
          })}

          <div ref={sentinel} className="flex h-12 items-center justify-center">
            <span className="sticky left-0 right-0 px-3 text-[17px] text-ink-faint">
              {canLoadMore ? "Loading more weeks…" : "That's as far ahead as dropby goes for now (about two months)."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
