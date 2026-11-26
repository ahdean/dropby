"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { EventIcon } from "@/components/ui/EventIcon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { iconAsText } from "@/lib/event-icon";
import type { BlockStatus, CalendarItem, FriendFreeCluster, OffscreenEntry } from "@/lib/calendar/model";
import { addDays, formatDayKey, formatMinutesShort, formatSpan } from "@/lib/time";
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

/**
 * "Sun, Nov 15, 7 – 9 PM": the real times, even where only part of the block
 * is drawn, told from the day it starts ("Fri, Nov 27, 10 PM – Sat 1 AM").
 */
export function describeItemTime(item: CalendarItem): string {
  const days = Math.floor(item.fullStartMin / 1440);
  const startDay = addDays(item.dayKey, days);
  return `${formatDayKey(startDay)}, ${formatSpan(startDay, item.fullStartMin - days * 1440, item.fullEndMin - days * 1440)}`;
}

export function describeItem(item: CalendarItem): string {
  const title = [iconAsText(item.block.emoji), item.block.title].filter(Boolean).join(" ");
  const repeat = item.block.repeat_weekly ? ", repeats weekly" : "";
  return `${STATUS_LABEL[item.status]}${title ? `: ${title}` : ""}, ${describeItemTime(item)}${repeat}`;
}

/** One line for a friend's event: "Mika is hosting 🍕 Pizza, Sun, Nov 15, 7 – 9 PM". */
export function describeFriendEvent(item: CalendarItem, host: Profile | undefined): string {
  const what = [iconAsText(item.block.emoji), item.block.title].filter(Boolean).join(" ");
  return `${host?.name ?? "A friend"} is hosting ${what}, ${describeItemTime(item)}${item.status === "locked" ? ". You're in." : ""}`;
}

/** One line for friends free at the same time: "Mika and Sam are free 6 – 7 AM". */
export function describeFriendsFree(cluster: FriendFreeCluster, profiles: Map<string, Profile>): string {
  const names = cluster.userIds.map((id) => profiles.get(id)?.name ?? "A friend");
  const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const from = Math.min(...cluster.items.map((i) => i.fullStartMin));
  const to = Math.max(...cluster.items.map((i) => i.fullEndMin));
  return `${who} ${names.length === 1 ? "is" : "are"} free ${formatSpan(cluster.dayKey, from, to)}`;
}

/** Arrow drawn on the end of a bar that carries on out of view. */
function CutMark({ edge, vertical }: { edge: "start" | "end"; vertical: boolean }) {
  const name = vertical ? (edge === "start" ? "up" : "down") : edge === "start" ? "left" : "right";
  const place = vertical
    ? edge === "start" ? "inset-x-0 top-0 justify-center pt-[2px]" : "inset-x-0 bottom-0 justify-center pb-[2px]"
    : edge === "start" ? "inset-y-0 left-0 items-center pl-[2px]" : "inset-y-0 right-0 items-center pr-[2px]";
  return (
    <span className={`pointer-events-none absolute flex text-[var(--core)] ${place}`} aria-hidden="true">
      <PixelIcon name={name} size={9} />
    </span>
  );
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
        <EventIcon value={block.emoji} size={17} max={2} />
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
      {/* An end that carries on out of view has no handle to grab, just an arrow. */}
      {item.cutStart ? (
        <CutMark edge="start" vertical={vertical} />
      ) : (
        <span className={`cap ${capStart}`} data-gesture="resize" data-item={item.key} data-edge="start" />
      )}
      <BeamLabel item={item} vertical={vertical} />
      {item.cutEnd ? (
        <CutMark edge="end" vertical={vertical} />
      ) : (
        <span className={`cap ${capEnd}`} data-gesture="resize" data-item={item.key} data-edge="end" />
      )}
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
  const label = describeFriendEvent(item, host);
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
      <EventIcon value={item.block.emoji} size={17} max={1} />
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
  const from = Math.min(...cluster.items.map((i) => i.fullStartMin));
  const to = Math.max(...cluster.items.map((i) => i.fullEndMin));
  const label = `${names.join(", ")} ${names.length === 1 ? "is" : "are"} free ${formatDayKey(cluster.dayKey)}, ${formatSpan(cluster.dayKey, from, to)}. Open for details.`;
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

/** What an entry outside the hours shown is, in words (for its tab and the list). */
export function describeEntry(entry: OffscreenEntry, profiles: Map<string, Profile>): string {
  if (entry.kind === "friends") return describeFriendsFree(entry.cluster, profiles);
  const { item } = entry;
  return item.mine ? describeItem(item) : describeFriendEvent(item, profiles.get(item.block.owner_id));
}

export function entryStatus(entry: OffscreenEntry): BlockStatus {
  return entry.kind === "friends" ? "free" : entry.item.status;
}

const STATUS_TEXT: Record<BlockStatus, string> = { free: "text-free", join: "text-join", locked: "text-locked" };

/**
 * A small tab at the start or end of a day's row: there is something before
 * the first hour shown, or after the last. It names the time of the first such
 * thing and how many more there are; a tap opens it (or a list of them).
 */
export function OffscreenTab({
  side,
  entries,
  profiles,
  style,
  onOpen,
}: {
  side: "before" | "after";
  entries: OffscreenEntry[];
  profiles: Map<string, Profile>;
  style: CSSProperties;
  onOpen: () => void;
}) {
  const first = entries[0];
  // When it starts on this day (for something carried over from the day before, that is midnight).
  const start = first.kind === "item" ? first.item.startMin : first.cluster.startMin;
  const label = `${side === "before" ? "Earlier" : "Later"} than the hours shown: ${entries.map((e) => describeEntry(e, profiles)).join("; ")}. Open.`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      style={style}
      className={`absolute z-[8] flex h-[16px] items-center gap-[3px] border-2 border-current bg-panel px-[3px] font-display text-[8px] leading-none hover:bg-panel-3 ${STATUS_TEXT[entryStatus(first)]}`}
    >
      {side === "before" && <PixelIcon name="left" size={8} />}
      <span>{formatMinutesShort(start)}</span>
      {entries.length > 1 && <span className="text-ink">+{entries.length - 1}</span>}
      {side === "after" && <PixelIcon name="right" size={8} />}
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
      <span className={`plate absolute whitespace-nowrap !px-2 !text-[19px] ${vertical ? "left-1 top-1" : "-top-9 left-0"}`}>
        {formatSpan(ghost.dayKey, ghost.startMin, ghost.endMin)}
      </span>
    </div>
  );
}
