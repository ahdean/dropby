"use client";

import Link from "next/link";
import { Button, IconButton } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { addDays, formatDayKey, startOfWeek, weekdayOf, type DayKey } from "@/lib/time";

export type CalendarView = "grid" | "day";

function LegendItem({ beam, label }: { beam: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="relative inline-block h-4 w-8 shrink-0" aria-hidden="true">
        <span className={`beam ${beam} inset-0`} />
      </span>
      <span className="whitespace-nowrap text-[18px] text-ink-dim">{label}</span>
    </li>
  );
}

const WEEKDAY_LETTER = ["", "M", "T", "W", "T", "F", "S", "S"];

/**
 * The single strip above the calendar: "Today", where you are (tap it to jump
 * to any date), the colour key on wider screens, the weeks/day switch and the
 * way to Connections. Moving through time is done by scrolling the calendar.
 */
export function Toolbar({
  view,
  onViewChange,
  label,
  onToday,
  onJump,
  today,
  selectedDay,
  onSelectDay,
  minDay,
  maxDay,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  /** Where the calendar is: the month in view, or the selected day. */
  label: string;
  onToday: () => void;
  /** Go to a date chosen in the date picker. */
  onJump: (day: DayKey) => void;
  today: DayKey;
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  minDay: DayKey;
  maxDay: DayKey;
}) {
  const weekStart = startOfWeek(selectedDay);
  const clampDay = (day: DayKey) => (day < minDay ? minDay : day > maxDay ? maxDay : day);

  return (
    <div className="space-y-2 px-2 py-2 sm:px-5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="dark" onClick={onToday}>
          Today
        </Button>

        {/* The label doubles as "jump to a date": the real control is a date field laid over it. */}
        <span className="relative inline-flex min-w-0 items-center">
          <span className="btn btn-sm tile tile-dark pointer-events-none min-w-0" aria-hidden="true">
            <span className="truncate font-display text-[9px] sm:text-[10px]">{label}</span>
            <PixelIcon name="down" size={10} className="shrink-0" />
          </span>
          <input
            type="date"
            aria-label={`Showing ${label}. Jump to a date`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            min={minDay}
            max={maxDay}
            value={selectedDay}
            onClick={(event) => {
              // Desktop browsers only open the calendar from its tiny icon unless asked to.
              try {
                event.currentTarget.showPicker?.();
              } catch {
                // Not allowed or not supported: the field still works as a normal date input.
              }
            }}
            onChange={(event) => event.target.value && onJump(clampDay(event.target.value))}
          />
        </span>

        <ul className="ml-3 hidden items-center gap-x-4 lg:flex" aria-label="What the colours mean">
          <LegendItem beam="" label="Free" />
          <LegendItem beam="beam-join" label="Join me" />
          <LegendItem beam="beam-locked" label="Locked in" />
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex" role="radiogroup" aria-label="Calendar view">
            <button
              type="button"
              role="radio"
              aria-checked={view === "grid"}
              aria-label="Weeks view"
              onClick={() => onViewChange("grid")}
              className={`btn btn-sm tile ${view === "grid" ? "tile-locked" : "tile-dark"}`}
            >
              <PixelIcon name="grid" size={13} />
              <span className="hidden sm:inline">Weeks</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "day"}
              aria-label="Day view"
              onClick={() => onViewChange("day")}
              className={`btn btn-sm tile ${view === "day" ? "tile-locked" : "tile-dark"}`}
            >
              <PixelIcon name="day" size={13} />
              <span className="hidden sm:inline">Day</span>
            </button>
          </div>
          <Link href="/connections" className="btn btn-sm tile tile-dark" aria-label="Connections">
            <PixelIcon name="users" size={13} />
            <span className="hidden sm:inline">Connections</span>
          </Link>
        </div>
      </div>

      {view === "day" && (
        <div className="flex items-stretch gap-1">
          <IconButton
            icon="left"
            label="Previous week"
            onClick={() => onSelectDay(clampDay(addDays(selectedDay, -7)))}
            disabled={weekStart <= minDay}
            className="!min-h-[44px] !w-8 shrink-0"
            size={12}
          />
          <div className="grid flex-1 grid-cols-7 gap-1" role="tablist" aria-label="Days of this week">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
              const selected = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={formatDayKey(day, "long")}
                  disabled={day < minDay || day > maxDay}
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
          <IconButton
            icon="right"
            label="Next week"
            onClick={() => onSelectDay(clampDay(addDays(selectedDay, 7)))}
            disabled={addDays(weekStart, 7) > maxDay}
            className="!min-h-[44px] !w-8 shrink-0"
            size={12}
          />
        </div>
      )}
    </div>
  );
}
