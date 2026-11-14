"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DAY_END_HOUR, DAY_START_HOUR, DAY_START_MIN, VISIBLE_HOURS } from "@/lib/constants";
import type { CalendarItem, DayModel, FriendFreeCluster } from "@/lib/calendar/model";
import { addDays, formatDayKey, formatHourShort, formatMinutes, weekdayOf, type DayKey } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { FriendEventBeam, FriendStack, GhostBeam, MyBeam } from "./Beams";
import { GRID, fractionOf, laneCenter, minutesAt, percent, rowHeight } from "./geometry";
import { useBlockGestures, type DayRange, type Ghost } from "./useBlockGestures";

const WEEKDAY_LETTER = ["", "M", "T", "W", "T", "F", "S", "S"];
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
  /** Hours are narrow (phone): draw fewer grid lines. */
  compact: boolean;
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
  compact,
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
    <div role="row" className={`flex ${isPast ? "opacity-70" : ""}`} style={{ height }} data-day-row={day.dayKey}>
      {/* sticky day label */}
      <div
        role="rowheader"
        className="flex w-[var(--day-col)] shrink-0 items-center justify-center border-b-2 border-r-2 border-black bg-panel"
      >
        <span className={`tile flex h-11 w-8 flex-col items-center justify-center leading-none sm:w-10 ${isToday ? "tile-locked" : ""}`}>
          <span className="sr-only">
            {formatDayKey(day.dayKey, "long")}
            {isToday ? ", today" : ""}
          </span>
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
        className={`track relative min-w-0 flex-1 border-b-2 border-black ${compact ? "track-compact" : ""} ${isWeekend ? "track-weekend" : ""} ${
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

function weekLabel(dayInWeek: DayKey, thisWeek: DayKey): string {
  const firstDay = addDays(dayInWeek, 1 - weekdayOf(dayInWeek));
  const range = `${formatDayKey(firstDay).split(", ")[1]} – ${formatDayKey(addDays(firstDay, 6)).split(", ")[1]}`;
  if (firstDay === thisWeek) return `This week · ${range}`;
  if (firstDay === addDays(thisWeek, 7)) return `Next week · ${range}`;
  if (firstDay === addDays(thisWeek, -7)) return `Last week · ${range}`;
  return range;
}

export interface WeekGridProps {
  /** The loaded days, in order. More are added at either end as the list is scrolled. */
  days: DayModel[];
  today: DayKey;
  thisWeek: DayKey;
  nowMin: number;
  profiles: Map<string, Profile>;
  /** Scroll this day to the top. Change `nonce` to do it again for the same day. */
  anchor: { day: DayKey; nonce: number };
  canLoadEarlier: boolean;
  canLoadLater: boolean;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
  /** Reports the day at the top of the visible list, for the toolbar's label. */
  onTopDayChange: (day: DayKey) => void;
  onCreate: (range: DayRange, how: "drag" | "tap") => void;
  onChange: (item: CalendarItem, next: DayRange) => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenCluster: (cluster: FriendFreeCluster) => void;
}

/**
 * The main calendar: one row per day, one column per hour.
 *
 * The whole day always fits the width, so the list only ever scrolls up and
 * down, and it does so endlessly: reaching either end loads more weeks. That
 * also frees sideways drags to mean "draw a block", on phones too.
 */
export function WeekGrid({
  days,
  today,
  thisWeek,
  nowMin,
  profiles,
  anchor,
  canLoadEarlier,
  canLoadLater,
  onLoadEarlier,
  onLoadLater,
  onTopDayChange,
  onCreate,
  onChange,
  onOpenItem,
  onOpenCluster,
}: WeekGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
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
    touchDrag: "x",
    locate,
    itemByKey: (key) => myItems.get(key),
    canCreateOn: (dayKey) => dayKey >= today,
    onCreate,
    onChange,
    onOpen: onOpenItem,
  });

  // --- how wide is an hour? (decides how much detail the header and tracks show)
  const [hourWidth, setHourWidth] = useState(64);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const measure = () => {
      const dayColumn = parseFloat(getComputedStyle(root).getPropertyValue("--day-col")) || 0;
      setHourWidth(Math.max(1, (root.clientWidth - dayColumn) / VISIBLE_HOURS));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const labelEvery = hourWidth >= 54 ? 1 : hourWidth >= 30 ? 2 : 3;
  const compact = hourWidth < 30;

  // --- keeping the view steady while the list grows -------------------------
  const firstDay = days[0]?.dayKey;
  /** What the top of the list looked like after the last render: its first day and where that row sat. */
  const previous = useRef<{ firstDay?: DayKey; firstRowTop: number; nonce: number }>({ firstRowTop: 0, nonce: -1 });
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root || !firstDay) return;
    const before = previous.current;
    const rowOf = (day: DayKey) => root.querySelector<HTMLElement>(`[data-day-row="${day}"]`);
    if (before.nonce !== anchor.nonce) {
      // A jump (opening the calendar, "Today", picking a date): put that day at the top.
      const row = rowOf(anchor.day);
      if (row) root.scrollTop = Math.max(0, row.offsetTop - GRID.header - 24);
    } else if (before.firstDay && firstDay < before.firstDay) {
      // Earlier weeks were added above. The row that used to be first has moved
      // down by exactly their height: scroll by the same amount, so nothing
      // appears to move.
      const formerFirst = rowOf(before.firstDay);
      if (formerFirst) root.scrollTop += formerFirst.offsetTop - before.firstRowTop;
    }
    previous.current = { firstDay, firstRowTop: rowOf(firstDay)?.offsetTop ?? 0, nonce: anchor.nonce };
  }, [anchor.day, anchor.nonce, firstDay, days.length]);

  // --- endless scrolling: load more weeks near either end -------------------
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === topSentinel.current) onLoadEarlier();
          else onLoadLater();
        }
      },
      { root, rootMargin: "500px 0px" },
    );
    if (canLoadEarlier && topSentinel.current) observer.observe(topSentinel.current);
    if (canLoadLater && bottomSentinel.current) observer.observe(bottomSentinel.current);
    return () => observer.disconnect();
    // Re-armed whenever the list grows, so a still-visible end keeps loading.
  }, [canLoadEarlier, canLoadLater, onLoadEarlier, onLoadLater, days.length]);

  // --- which day is at the top? (drives the label in the toolbar) -----------
  const reportTopDay = useCallback(() => {
    const root = scroller.current;
    if (!root) return;
    const edge = root.scrollTop + GRID.header + 4;
    const rows = root.querySelectorAll<HTMLElement>("[data-day-row]");
    for (const row of rows) {
      if (row.offsetTop + row.offsetHeight > edge) {
        onTopDayChange(row.dataset.dayRow as DayKey);
        return;
      }
    }
  }, [onTopDayChange]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        reportTopDay();
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    reportTopDay();
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reportTopDay, days.length, anchor.nonce]);

  return (
    <div className="mesh flex min-h-0 flex-1 flex-col p-[6px]">
      <div
        ref={scroller}
        role="grid"
        aria-label="Calendar: days down, hours across"
        aria-rowcount={days.length}
        onPointerDown={onPointerDown}
        // pan-y: the browser scrolls up and down; sideways movement is ours, for drawing blocks.
        // overflow-anchor none: when weeks are added above, we keep the view steady ourselves (see the
        // layout effect), because not every browser does it, and those that do would double the correction.
        className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain bg-void/90 [-webkit-touch-callout:none] [overflow-anchor:none]"
      >
        {/* hour header */}
        <div role="row" className="sticky top-0 z-30 flex border-b-2 border-black bg-panel-2" style={{ height: GRID.header }}>
          <div className="w-[var(--day-col)] shrink-0 border-r-2 border-black bg-panel-2" />
          <div className="relative min-w-0 flex-1">
            {HOURS.filter((hour) => (hour - DAY_START_HOUR) % labelEvery === 0).map((hour) => (
              <span
                key={hour}
                role="columnheader"
                aria-label={formatMinutes(hour * 60)}
                className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-l-2 border-line/60 pl-1 font-display text-[8px] text-ink-dim"
                style={{ left: percent(fractionOf(hour * 60)), width: percent(labelEvery / VISIBLE_HOURS) }}
              >
                {labelEvery === 1 ? formatMinutes(hour * 60) : formatHourShort(hour)}
              </span>
            ))}
            <span className="sr-only">
              Columns run from {formatMinutes(DAY_START_HOUR * 60)} to {formatMinutes(DAY_END_HOUR * 60)}.
            </span>
          </div>
        </div>

        <div ref={topSentinel} className="flex h-10 items-center justify-center text-[17px] text-ink-faint">
          {canLoadEarlier ? "Loading earlier weeks…" : "This is as far back as dropby goes."}
        </div>

        {days.map((day, index) => {
          const startsWeek = weekdayOf(day.dayKey) === 1 || index === 0;
          const rowGhost = ghost && ghost.dayKey === day.dayKey ? ghost : null;
          const dragging = ghost?.item && ghost.item.dayKey === day.dayKey ? ghost.item.key : null;
          return (
            <div key={day.dayKey}>
              {startsWeek && (
                <div className="flex h-6 items-center border-b-2 border-black bg-panel-3/80">
                  <span className="px-2 font-display text-[8px] uppercase text-ink-dim">{weekLabel(day.dayKey, thisWeek)}</span>
                </div>
              )}
              <DayRow
                day={day}
                isToday={day.dayKey === today}
                isPast={day.dayKey < today}
                nowMin={day.dayKey === today ? nowMin : null}
                ghost={rowGhost}
                draggingKey={dragging}
                compact={compact}
                profiles={profiles}
                registerTrack={registerTrack}
                onOpenItem={onOpenItem}
                onOpenCluster={onOpenCluster}
              />
            </div>
          );
        })}

        <div ref={bottomSentinel} className="flex h-12 items-center justify-center px-3 text-center text-[17px] text-ink-faint">
          {canLoadLater ? "Loading more weeks…" : "That's as far ahead as dropby goes for now (about two years)."}
        </div>
      </div>
    </div>
  );
}
