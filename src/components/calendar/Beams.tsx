"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { BlockStatus, CalendarItem, FriendFreeCluster } from "@/lib/calendar/model";
import { formatDayKey, formatMinuteRange } from "@/lib/time";
import type { Profile } from "@/lib/types";
import type { Ghost } from "./useBlockGestures";

/**
 * The things drawn on a calendar track. Each takes a ready-made `style`
 * (position and size) so the same components serve the week grid, where time
 * runs left to right, and the day view, where it runs top to bottom.
 */

export const STATUS_LABEL: Record<BlockStatus, string> = {
  free: "Free",
  join: "Join me",
  locked: "Locked in",
};

export const STATUS_BEAM: Record<BlockStatus, string> = {
  free: "",
  join: "beam-join",
  locked: "beam-locked",
};

export function describeItem(item: CalendarItem): string {
  const title = [item.block.emoji, item.block.title].filter(Boolean).join(" ");
  const when = `${formatDayKey(item.dayKey)}, ${formatMinuteRange(item.startMin, item.endMin)}`;
  const repeat = item.block.repeat_weekly ? ", repeats weekly" : "";
  return `${STATUS_LABEL[item.status]}${title ? `: ${title}` : ""}, ${when}${repeat}`;
}

function BeamLabel({ item, vertical }: { item: CalendarItem; vertical: boolean }) {
  const { block, status, inCount } = item;
  const text = block.title?.trim();
  if (!block.emoji && !text && status !== "locked") return null;
  return (
    <span
      className={`pointer-events-none absolute flex min-w-0 items-center gap-1 ${
        vertical ? "inset-x-1 top-4 flex-col items-start" : "inset-y-0 left-4 right-4"
      }`}
    >
      <span className="plate">
        {status === "locked" && <PixelIcon name="lock" size={11} className="shrink-0 text-locked" />}
        {block.emoji && <span className="shrink-0 text-[17px] leading-none">{block.emoji}</span>}
        {text && <span className="truncate">{text}</span>}
        {status === "locked" && inCount > 0 && <span className="shrink-0 text-locked">+{inCount}</span>}
        {block.repeat_weekly && <PixelIcon name="repeat" size={10} className="shrink-0 text-ink-faint" />}
      </span>
    </span>
  );
}

/** One of the viewer's own blocks: draggable, resizable, opens on tap/Enter. */
export function MyBeam({
  item,
  style,
  vertical = false,
  dimmed = false,
  onOpen,
}: {
  item: CalendarItem;
  style: CSSProperties;
  vertical?: boolean;
  dimmed?: boolean;
  onOpen: (item: CalendarItem) => void;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(item);
    }
  };
  const capStart = vertical ? "inset-x-[-2px] top-[-2px] h-3 w-auto cursor-ns-resize" : "left-[-2px] cursor-ew-resize";
  const capEnd = vertical ? "inset-x-[-2px] bottom-[-2px] top-auto h-3 w-auto cursor-ns-resize" : "right-[-2px] cursor-ew-resize";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${describeItem(item)}. Press Enter to open.`}
      title={describeItem(item)}
      data-gesture="move"
      data-item={item.key}
      onKeyDown={onKeyDown}
      style={style}
      className={`beam ${STATUS_BEAM[item.status]} ${vertical ? "vbeam" : ""} cursor-grab touch-manipulation select-none ${
        dimmed ? "opacity-30" : ""
      } ${item.block.type === "join" ? "z-[3]" : "z-[2]"}`}
    >
      {item.whole && <span className={`cap ${capStart}`} data-gesture="resize" data-item={item.key} data-edge="start" />}
      <BeamLabel item={item} vertical={vertical} />
      {item.whole && <span className={`cap ${capEnd}`} data-gesture="resize" data-item={item.key} data-edge="end" />}
    </div>
  );
}

/** A friend's hosted event: hollow, shows their emoji and face, opens the event page. */
export function FriendEventBeam({
  item,
  host,
  style,
  vertical = false,
  onOpen,
}: {
  item: CalendarItem;
  host: Profile | undefined;
  style: CSSProperties;
  vertical?: boolean;
  onOpen: (item: CalendarItem) => void;
}) {
  const hostName = host?.name ?? "A friend";
  const label = `${hostName} is hosting ${[item.block.emoji, item.block.title].filter(Boolean).join(" ")}, ${formatDayKey(item.dayKey)}, ${formatMinuteRange(item.startMin, item.endMin)}${item.status === "locked" ? ". You're in." : ""}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={label}
      title={label}
      style={style}
      className={`beam ${STATUS_BEAM[item.status]} beam-hollow z-[4] flex min-w-0 items-center gap-1 overflow-hidden px-1 text-left ${
        vertical ? "flex-col items-start py-1" : ""
      }`}
    >
      <span className="shrink-0 text-[17px] leading-none">{item.block.emoji}</span>
      <Avatar person={host} size={16} className="shrink-0" />
      {item.status === "locked" && <PixelIcon name="lock" size={10} className="shrink-0 text-locked" />}
      {item.block.title && <span className="truncate text-[16px] leading-none text-ink">{item.block.title}</span>}
    </button>
  );
}

/** The stack of friends' faces over the time they are free. */
export function FriendStack({
  cluster,
  people,
  style,
  onOpen,
}: {
  cluster: FriendFreeCluster;
  people: (Profile | undefined)[];
  style: CSSProperties;
  onOpen: (cluster: FriendFreeCluster) => void;
}) {
  const names = people.map((p) => p?.name ?? "A friend");
  const label = `${names.join(", ")} ${names.length === 1 ? "is" : "are"} free ${formatDayKey(cluster.dayKey)}, ${formatMinuteRange(cluster.startMin, cluster.endMin)}. Open for details.`;
  return (
    <button
      type="button"
      onClick={() => onOpen(cluster)}
      aria-label={label}
      title={label}
      style={style}
      className="absolute z-[5] flex items-center justify-center rounded-full hover:brightness-110"
    >
      <AvatarStack people={people} size={26} max={3} />
    </button>
  );
}

/** The outline shown while a block is being drawn, moved or resized. */
export function GhostBeam({ ghost, style, vertical = false }: { ghost: Ghost; style: CSSProperties; vertical?: boolean }) {
  const status = ghost.item?.status;
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`beam beam-ghost pointer-events-none z-[6] ${status ? STATUS_BEAM[status] : "beam-new"} ${vertical ? "vbeam" : ""}`}
    >
      <span className={`plate absolute whitespace-nowrap ${vertical ? "left-1 top-1" : "-top-6 left-0"}`}>
        {formatMinuteRange(ghost.startMin, ghost.endMin)}
      </span>
    </div>
  );
}
