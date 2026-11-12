"use client";

import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { assignLanes } from "@/lib/calendar/intervals";
import type { CalendarItem, DayModel, FriendFreeCluster } from "@/lib/calendar/model";
import { DAY_START_HOUR, DAY_START_MIN, VISIBLE_HOURS } from "@/lib/constants";
import { formatDayKey, formatMinuteRange, formatMinutes, type DayKey } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { FriendEventBeam, GhostBeam, MyBeam } from "./Beams";
import { DAY, fractionOf, minutesAt, percent } from "./geometry";
import { useBlockGestures, type DayRange } from "./useBlockGestures";

const HOURS = Array.from({ length: VISIBLE_HOURS }, (_, i) => DAY_START_HOUR + i);

/** Top/height of a time span down the track, as CSS percentages. */
function vspan(startMin: number, endMin: number) {
  return { top: percent(fractionOf(startMin)), height: percent(fractionOf(endMin) - fractionOf(startMin)) };
}

/**
 * One day, hours running top to bottom: my blocks on the left, friends on the
 * right. Roomier than a row of the week grid, which suits phones.
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
  onCreate: (range: DayRange) => void;
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
      return { dayKey: day.dayKey, minute: minutesAt(clientY - rect.top, rect.height) };
    },
    [day.dayKey],
  );

  const { ghost, onPointerDown } = useBlockGestures({
    containerRef: scroller,
    locate,
    itemByKey: (key) => myItems.get(key),
    canCreateOn: (dayKey) => dayKey >= today,
    onCreate,
    onChange,
    onOpen: onOpenItem,
  });

  // Start with "now" (or the morning) in view.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const target = isToday ? Math.max(DAY_START_MIN, nowMin - 90) : 8 * 60;
    root.scrollTop = fractionOf(target) * VISIBLE_HOURS * DAY.hourHeight;
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
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-void/90 [-webkit-touch-callout:none]"
        aria-label={`${formatDayKey(day.dayKey, "long")}: hours down the page`}
      >
        {/* column headings */}
        <div className="sticky top-0 z-30 flex border-b-2 border-black bg-panel-2 font-display text-[8px] uppercase text-ink-dim">
          <div className="shrink-0 border-r-2 border-black" style={{ width: DAY.timeColumn }} />
          <div className="flex-1 px-2 py-2">Me</div>
          <div className="flex-1 border-l-2 border-black px-2 py-2">Friends</div>
        </div>

        <div className={`flex ${isPast ? "opacity-70" : ""}`} style={{ height: VISIBLE_HOURS * DAY.hourHeight }}>
          {/* hour labels */}
          <div className="relative shrink-0 border-r-2 border-black bg-panel" style={{ width: DAY.timeColumn }} aria-hidden="true">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-1 font-display text-[8px] text-ink-dim"
                style={{ top: `calc(${percent(fractionOf(hour * 60))} + 4px)` }}
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
            {ghost && <GhostBeam ghost={ghost} vertical style={{ ...vspan(ghost.startMin, ghost.endMin), left: 8, right: 8 }} />}
            {isToday && nowMin >= DAY_START_MIN && (
              <div
                className="pointer-events-none absolute inset-x-0 z-[7] h-[2px] bg-locked"
                style={{ top: percent(fractionOf(nowMin)), boxShadow: "0 0 6px var(--color-locked)" }}
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
              const label = `${person?.name ?? "A friend"} is free ${formatMinuteRange(item.startMin, item.endMin)}`;
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
