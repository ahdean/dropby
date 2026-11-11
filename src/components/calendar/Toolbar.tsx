"use client";

import Link from "next/link";
import { Button, IconButton } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { addDays, formatDayKey, startOfWeek, weekdayOf, type DayKey } from "@/lib/time";

export type CalendarView = "grid" | "day";

function LegendItem({ beam, label }: { beam: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="relative inline-block h-4 w-9 shrink-0" aria-hidden="true">
        <span className={`beam ${beam} inset-0`} />
      </span>
      <span className="text-[18px] text-ink-dim">{label}</span>
    </li>
  );
}

const WEEKDAY_LETTER = ["", "M", "T", "W", "T", "F", "S", "S"];

/**
 * The strip above the calendar: what the colours mean, the grid/day switch,
 * previous/next navigation, "new block" and the way to Connections.
 */
export function Toolbar({
  view,
  onViewChange,
  rangeLabel,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onToday,
  onNew,
  today,
  selectedDay,
  onSelectDay,
  minDay,
  maxDay,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  rangeLabel: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onToday: () => void;
  onNew: () => void;
  today: DayKey;
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  minDay: DayKey;
  maxDay: DayKey;
}) {
  const unit = view === "grid" ? "week" : "day";
  const weekStart = startOfWeek(selectedDay);

  return (
    <div className="space-y-2 px-3 py-2 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="What the colours mean">
          <LegendItem beam="" label="Free" />
          <LegendItem beam="beam-join" label="Join me" />
          <LegendItem beam="beam-locked" label="Locked in" />
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex" role="radiogroup" aria-label="Calendar view">
            <button
              type="button"
              role="radio"
              aria-checked={view === "grid"}
              onClick={() => onViewChange("grid")}
              className={`btn btn-sm tile ${view === "grid" ? "tile-locked" : "tile-dark"}`}
            >
              <PixelIcon name="grid" size={13} />
              Weeks
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "day"}
              onClick={() => onViewChange("day")}
              className={`btn btn-sm tile ${view === "day" ? "tile-locked" : "tile-dark"}`}
            >
              <PixelIcon name="day" size={13} />
              Day
            </button>
          </div>
          <Link href="/connections" className="btn btn-sm tile tile-dark">
            <PixelIcon name="users" size={13} />
            Connections
          </Link>
          <Button size="sm" variant="free" icon="plus" onClick={onNew}>
            New
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton icon="left" label={`Previous ${unit}`} onClick={onBack} disabled={!canGoBack} className="!min-h-[36px] !w-9" size={13} />
          <Button size="sm" variant="dark" onClick={onToday}>
            Today
          </Button>
          <IconButton icon="right" label={`Next ${unit}`} onClick={onForward} disabled={!canGoForward} className="!min-h-[36px] !w-9" size={13} />
        </div>
        <h1 className="truncate text-right text-[10px] text-ink sm:text-[11px]" aria-live="polite">
          {rangeLabel}
        </h1>
      </div>

      {view === "day" && (
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Days of this week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
            const selected = day === selectedDay;
            const disabled = day < minDay || day > maxDay;
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={formatDayKey(day, "long")}
                disabled={disabled}
                onClick={() => onSelectDay(day)}
                className={`btn tile !min-h-[44px] flex-col !gap-0 !px-0 leading-none ${
                  selected ? "tile-locked" : day === today ? "" : "tile-dark"
                }`}
              >
                <span className="font-display text-[7px]">{WEEKDAY_LETTER[weekdayOf(day)]}</span>
                <span className="mt-1 text-[20px] leading-none">{Number(day.slice(8))}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
