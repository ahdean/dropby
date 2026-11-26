"use client";

import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import type { OffscreenEntry } from "@/lib/calendar/model";
import { DAY_END_MIN, DAY_START_MIN } from "@/lib/constants";
import { formatDayKey, formatMinutes, type DayKey } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { describeEntry, entryStatus } from "./Beams";

export interface OffscreenList {
  dayKey: DayKey;
  side: "before" | "after";
  entries: OffscreenEntry[];
}

const BORDER = { free: "border-free", join: "border-join", locked: "border-locked" } as const;

/**
 * Opens from the tab at the end of a week row when several things lie outside
 * the hours shown: lists them, each opening as it would on the calendar, and
 * offers the day view, which shows the whole day.
 */
export function OffscreenDialog({
  list,
  profiles,
  onClose,
  onOpenEntry,
  onShowDay,
}: {
  list: OffscreenList | null;
  profiles: Map<string, Profile>;
  onClose: () => void;
  onOpenEntry: (entry: OffscreenEntry) => void;
  onShowDay: (dayKey: DayKey) => void;
}) {
  const title = list
    ? `${list.side === "before" ? `Before ${formatMinutes(DAY_START_MIN)}` : `After ${formatMinutes(DAY_END_MIN)}`} · ${formatDayKey(list.dayKey)}`
    : "";
  return (
    <Dialog
      open={list !== null}
      onClose={onClose}
      title={title}
      footer={
        list && (
          <Button variant="dark" icon="day" onClick={() => onShowDay(list.dayKey)}>
            See the whole day
          </Button>
        )
      }
    >
      {list && (
        <ul className="space-y-2">
          {list.entries.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => onOpenEntry(entry)}
                className={`slot flex w-full items-center gap-3 border-l-4 px-3 py-2 text-left hover:bg-panel-3 ${BORDER[entryStatus(entry)]}`}
              >
                <span className="flex w-10 shrink-0 justify-center">
                  {entry.kind === "friends" ? (
                    <AvatarStack people={entry.cluster.userIds.map((id) => profiles.get(id))} size={22} max={2} />
                  ) : entry.item.mine ? (
                    entry.item.block.type === "join" ? (
                      <EventIcon value={entry.item.block.emoji} size={18} max={1} />
                    ) : (
                      <span className="h-3 w-8 border-y-2 border-free bg-free/30" aria-hidden="true" />
                    )
                  ) : (
                    <Avatar person={profiles.get(entry.item.block.owner_id)} size={24} />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-ink">{describeEntry(entry, profiles)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
