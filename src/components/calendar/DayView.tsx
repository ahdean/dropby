"use client";

import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { DAY_BOUNDS, assignLanes, type Interval } from "@/lib/calendar/intervals";
import type { CalendarItem, DayModel, FriendFreeCluster } from "@/lib/calendar/model";
import { DAY_START_MIN } from "@/lib/constants";
import { formatDayKey, formatMinutes, formatSpan, type DayKey } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { FriendEventBeam, GhostBeam, MyBeam } from "./Beams";
import { DAY, clampToBounds, fractionOf, minutesAt, percent } from "./geometry";
import { useBlockGestures, type DayRange } from "./useBlockGestures";

/** The day view shows all 24 hours, midnight to midnight. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Top/height of a time span down the track, as CSS percentages. */
function vspan(startMin: number, endMin: number) {
  return {
    top: percent(fractionOf(startMin, DAY_BOUNDS)),
    height: percent(fractionOf(endMin, DAY_BOUNDS) - fractionOf(startMin, DAY_BOUNDS)),
  };
}

/**
 * One day, hours running top to bottom: my blocks on the left, friends on the
 * right. Roomier than a row of the week grid, which suits phones, and it shows
 * the whole day, so blocks earlier or later than the week grid's hours can be
 * seen and dragged here too. It opens on the morning (or on now, today).
 */
export function DayView({
  day,
  today,
  nowMin,
  profiles,
  onCreate,
  onChange,
  onOpenItem,
  onOpenCluster,
}: {
  day: DayModel;
  today: DayKey;
  nowMin: number;
  profiles: Map<string, Profile>;
  onCreate: (range: DayRange, how: "drag" | "tap") => void;
  onChange: (item: CalendarItem, next: DayRange) => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenCluster: (cluster: FriendFreeCluster) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const isToday = day.dayKey === today;
  const isPast = day.dayKey < today;

  const myItems = useMemo(() => new Map(day.mine.map((item) => [item.key, item])), [day.mine]);

  // Friends' free time and events share the right-hand column, side by side when they overlap.
  const friends = useMemo(() => {
    const free = day.friendFree.flatMap((cluster) => cluster.items.map((item) => ({ ...item, cluster })));
    const events = day.friendEvents.map((item) => ({ ...item, cluster: null as FriendFreeCluster | null }));
    return assignLanes([...free, ...events]);
  }, [day.friendFree, day.friendEvents]);

  const locate = useCallback(
    (_clientX: number, clientY: number) => {
      const rect = track.current?.getBoundingClientRect();
      if (!rect) return null;
      return { dayKey: day.dayKey, minute: minutesAt(clientY - rect.top, rect.height, DAY_BOUNDS), pxPerMinute: rect.height / 1440 };
    },
    [day.dayKey],
  );

  const { ghost, onPointerDown } = useBlockGestures({
    containerRef: scroller,
    // Time runs down the screen here, the same way the page scrolls, so touch needs press-and-hold.
    touchDrag: "none",
    bounds: DAY_BOUNDS,
    locate,
    itemByKey: (key) => myItems.get(key),
    itemsOn: () => day.mine,
    canCreateOn: (dayKey) => dayKey >= today,
    onCreate,
    onChange,
    onOpen: onOpenItem,
  });

  // Start with "now" in view today; on other days the morning, or the first
  // thing that day if it is earlier than that.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const earliest = Math.min(...[...day.mine, ...friends.placed].map((item: Interval) => item.startMin));
    const target = isToday ? Math.max(0, nowMin - 90) : Math.max(0, Math.min(DAY_START_MIN, earliest - 30));
    root.scrollTop = fractionOf(target, DAY_BOUNDS) * 24 * DAY.hourHeight;
    // Only when the day changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.dayKey]);

  const laneStyle = (lane: number): CSSProperties => ({
    left: `calc(${(lane / friends.laneCount) * 100}% + 3px)`,
    width: `calc(${100 / friends.laneCount}% - 6px)`,
  });

  return (
    <div className="mesh flex min-h-0 flex-1 flex-col p-[6px]">
      <div
        ref={scroller}
        onPointerDown={onPointerDown}
        // All 24 hours here (the week grid sets --hours to the hours it shows), for the hour lines.
        style={{ ["--hours" as string]: 24 }}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-void/90 [-webkit-touch-callout:none]"
        aria-label={`${formatDayKey(day.dayKey, "long")}: hours down the page`}
      >
        {/* column headings */}
        <div className="sticky top-0 z-30 flex border-b-2 border-black bg-panel-2 font-display text-[8px] uppercase text-ink-dim">
          <div className="shrink-0 border-r-2 border-black" style={{ width: DAY.timeColumn }} />
          <div className="flex-1 px-2 py-2">Me</div>
          <div className="flex-1 border-l-2 border-black px-2 py-2">Friends</div>
        </div>

        <div className={`flex ${isPast ? "opacity-70" : ""}`} style={{ height: 24 * DAY.hourHeight }}>
          {/* hour labels */}
          <div className="relative shrink-0 border-r-2 border-black bg-panel" style={{ width: DAY.timeColumn }} aria-hidden="true">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-1 font-display text-[8px] text-ink-dim"
                style={{ top: `calc(${percent(fractionOf(hour * 60, DAY_BOUNDS))} + 4px)` }}
              >
                {formatMinutes(hour * 60)}
              </span>
            ))}
          </div>

          {/* my column */}
          <div
            ref={track}
            data-gesture="empty"
            role="group"
            aria-label="My blocks. Drag to add one."
            className={`vtrack relative min-w-0 flex-1 ${isPast ? "" : "cursor-crosshair"}`}
          >
            {day.mine.map((item) => (
              <MyBeam
                key={item.key}
                item={item}
                vertical
                onOpen={onOpenItem}
                dimmed={ghost?.item?.key === item.key}
                style={{ ...vspan(item.startMin, item.endMin), left: item.block.type === "join" ? 30 : 8, right: 8 }}
              />
            ))}
            {ghost && (() => {
              // A block running into the next day keeps its real end; draw the part on this day.
              const shown = clampToBounds(ghost, DAY_BOUNDS);
              return <GhostBeam ghost={ghost} vertical style={{ ...vspan(shown.startMin, shown.endMin), left: 8, right: 8 }} />;
            })()}
            {isToday && (
              <div
                className="pointer-events-none absolute inset-x-0 z-[7] h-[2px] bg-locked"
                style={{ top: percent(fractionOf(nowMin, DAY_BOUNDS)), boxShadow: "0 0 6px var(--color-locked)" }}
                role="img"
                aria-label={`Now: ${formatMinutes(nowMin)}`}
              />
            )}
          </div>

          {/* friends column */}
          <div className="vtrack relative min-w-0 flex-1 border-l-2 border-black" role="group" aria-label="Friends">
            {friends.placed.map((item) => {
              const person = profiles.get(item.block.owner_id);
              if (item.block.type === "join") {
                return (
                  <FriendEventBeam
                    key={item.key}
                    item={item}
                    host={person}
                    vertical
                    onOpen={onOpenItem}
                    style={{ ...vspan(item.startMin, item.endMin), ...laneStyle(item.lane) }}
                  />
                );
              }
              const label = `${person?.name ?? "A friend"} is free ${formatSpan(item.dayKey, item.fullStartMin, item.fullEndMin)}`;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => item.cluster && onOpenCluster(item.cluster)}
                  aria-label={label}
                  title={label}
                  className="absolute z-[2] flex flex-col items-center"
                  style={{ ...vspan(item.startMin, item.endMin), ...laneStyle(item.lane) }}
                >
                  <span className="vwire inset-y-0" style={{ left: "calc(50% - 2px)" }} aria-hidden="true" />
                  <span className="relative mt-1">
                    <Avatar person={person} size={28} />
                  </span>
                  <span className="plate relative mt-1 max-w-full">
                    <span className="truncate">{person?.name?.split(" ")[0] ?? "Friend"}</span>
                  </span>
                </button>
              );
            })}
            {friends.placed.length === 0 && (
              <p className="absolute inset-x-2 top-6 text-center text-[17px] text-ink-faint">No friends&apos; time shared for this day yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
