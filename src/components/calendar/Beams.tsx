"use client";

import { createContext, useContext, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { EventIcon } from "@/components/ui/EventIcon";
import { readIdeas } from "@/lib/activities";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { iconAsText } from "@/lib/event-icon";
import type { BlockStatus, CalendarItem, FriendFreeCluster, OffscreenEntry } from "@/lib/calendar/model";
import { addDays, formatDayKey, formatMinutesShort, formatSpan } from "@/lib/time";
import { useSession } from "@/lib/data/session";
import type { Profile, RsvpStatus } from "@/lib/types";
import { fractionOf } from "./geometry";
import type { Ghost } from "./useBlockGestures";

/**
 * The things drawn on a calendar track. Each takes a ready-made `style`
 * (position and size) so the same components serve the week grid, where time
 * runs left to right, and the day view, where it runs top to bottom.
 */

// ---------------------------------------------------------------------------
// Quick actions on hover (computers only): answer or write without opening anything
// ---------------------------------------------------------------------------

export interface QuickActions {
  /** Answer a friend's event ("I'm in" / "Can't make it"; the same answer again clears it). */
  rsvp: (item: CalendarItem, status: RsvpStatus) => void;
  /** Open a little chat box under the block (`anchor`), ready to type in. */
  message: (item: CalendarItem, anchor: HTMLElement) => void;
  /** Friends' free time: one friend's chat box opens straight away, several show the list. */
  messageCluster: (cluster: FriendFreeCluster, anchor: HTMLElement) => void;
}

/** Provided by the calendar screen; the beams below use it for their hover buttons. */
export const QuickActionsContext = createContext<QuickActions | null>(null);

/**
 * A little row of buttons that drops down while the pointer is over a block
 * (or a keyboard user tabs into it). Hidden on touch screens, where a tap
 * opens the block as usual; see .hover-actions in globals.css.
 *
 * Under a block, an invisible strip (the "bridge") as wide as the block and
 * as tall as the buttons keeps them open while the pointer travels down and
 * across to them, so a slanting path does not lose them on the way.
 */
function HoverActions({
  place,
  bridge = true,
  compact = false,
  children,
}: {
  place: string;
  bridge?: boolean;
  /** Small enough to sit inside a beam (your own blocks), so it covers nothing around it. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {bridge && <span className="hover-bridge" data-gesture="bridge" aria-hidden="true" />}
      <span
        className={`hover-actions absolute z-[1] gap-1 border-2 border-black bg-panel ${compact ? "hover-actions-compact p-0" : "p-[3px]"} ${place}`}
        // Keys pressed here are for these buttons, not for the block underneath.
        onKeyDown={(event) => event.stopPropagation()}
      >
        {children}
      </span>
    </>
  );
}

function ActionButton({
  icon,
  label,
  active = false,
  activeClass = "tile-locked",
  onClick,
}: {
  icon: "check" | "x" | "chat";
  label: string;
  active?: boolean;
  activeClass?: string;
  onClick: (button: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      aria-label={label}
      title={label}
      aria-pressed={icon === "chat" ? undefined : active}
      className={`btn tile !min-h-[28px] !w-8 !p-0 ${active ? activeClass : "tile-dark"}`}
    >
      <PixelIcon name={icon} size={12} />
    </button>
  );
}

/** The block a hover button belongs to (the chat box opens under it). */
function blockOf(button: HTMLElement): HTMLElement {
  return button.closest<HTMLElement>(".has-hover-actions") ?? button;
}

/** Where the drop-down sits: under the block (aligned to whichever end keeps it on screen), or inside a tall one. */
function actionsPlace(item: CalendarItem, vertical: boolean): string {
  if (vertical) return "right-1 top-1";
  return fractionOf(item.startMin) > 0.6 ? "right-0 top-full mt-[3px]" : "left-0 top-full mt-[3px]";
}

export const STATUS_LABEL: Record<BlockStatus, string> = {
  free: "Free",
  join: "Join me",
  locked: "Confirmed",
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
  const ideaList = block.type === "free" ? readIdeas(block.ideas) : [];
  const ideas = ideaList.length;
  if (!block.emoji && !text && status !== "locked" && ideas === 0) return null;
  return (
    <span
      className={`@container pointer-events-none absolute flex min-w-0 items-center gap-1 ${
        vertical ? "inset-x-1 top-4 flex-col items-start" : "inset-y-0 left-4 right-4"
      }`}
    >
      <span className="plate">
        <EventIcon value={block.emoji} size={17} max={2} />
        {text && <span className="truncate">{text}</span>}
        {status === "locked" && inCount > 0 && <span className="shrink-0 text-locked">+{inCount}</span>}
        {ideas > 0 && <IdeaMarks ideas={ideaList} roomy={text ? "@min-[230px]:flex" : "@min-[110px]:flex"} short={text ? "@min-[230px]:hidden" : "@min-[110px]:hidden"} />}
        {block.repeat_weekly && <PixelIcon name="repeat" size={10} className="shrink-0 text-ink-faint" />}
      </span>
    </span>
  );
}

/**
 * The ideas on a block of Free time: their icons where there is room (up to
 * three, then "+2"), otherwise a bulb and how many. `roomy`/`short` are the
 * container-width classes that switch between the two (the label is a size
 * container), so they can depend on what else is in the label.
 */
function IdeaMarks({ ideas, roomy, short }: { ideas: { title: string; emoji?: string | null }[]; roomy: string; short: string }) {
  const title = ideas.map((i) => i.title).join(", ");
  const icons = ideas.filter((i) => i.emoji?.trim()).slice(0, 3);
  const more = ideas.length - icons.length;
  return (
    <>
      {icons.length > 0 && (
        <span className={`hidden shrink-0 items-center gap-[3px] ${roomy}`} title={`Ideas: ${title}`}>
          {icons.map((idea, index) => (
            <EventIcon key={index} value={idea.emoji} size={15} max={1} />
          ))}
          {more > 0 && <span className="text-[15px] text-locked">+{more}</span>}
        </span>
      )}
      <span className={`flex shrink-0 items-center gap-[2px] text-locked ${icons.length > 0 ? short : ""}`} title={`Ideas: ${title}`}>
        <PixelIcon name="bulb" size={10} />
        {ideas.length}
      </span>
    </>
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
  const actions = useContext(QuickActionsContext);
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
      className={`beam has-hover-actions ${STATUS_BEAM[item.status]} ${vertical ? "vbeam" : ""} cursor-grab touch-manipulation select-none ${
        dimmed ? "opacity-30" : ""
      } ${item.block.type === "join" ? "z-[3]" : "z-[2]"}`}
    >
      {actions && (
        // Inside the beam, at its far end: your lane has friends' lanes right under it, which a drop-down would cover.
        <HoverActions place={vertical ? "right-1 top-1" : "right-[calc(var(--cap)+2px)] top-1/2 -translate-y-1/2"} bridge={false} compact={!vertical}>
          <ActionButton icon="chat" label="Chat" onClick={(button) => actions.message(item, blockOf(button))} />
        </HoverActions>
      )}
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

/**
 * A friend's hosted event: hollow, shows their emoji and face; a tap opens
 * it. On a computer, hovering drops down ✓ (I'm in), ✗ (can't make it) and
 * a chat button.
 */
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
  const actions = useContext(QuickActionsContext);
  const { userId } = useSession();
  const myAnswer = item.block.rsvps.find((r) => r.occurrence === item.occurrence.index && r.user_id === userId)?.status ?? null;
  return (
    <div style={style} className="has-hover-actions absolute z-[4]">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={label}
        title={label}
        className={`beam ${STATUS_BEAM[item.status]} beam-hollow inset-0 flex min-w-0 items-center gap-1 overflow-hidden px-1 text-left ${
          vertical ? "flex-col items-start py-1" : ""
        }`}
      >
        <EventIcon value={item.block.emoji} size={vertical ? 17 : 14} max={1} />
        <Avatar person={host} size={vertical ? 16 : 14} className="shrink-0" />
        {item.block.title && <span className={`truncate leading-none text-ink ${vertical ? "text-[16px]" : "text-[15px]"}`}>{item.block.title}</span>}
      </button>
      {actions && (
        <HoverActions place={actionsPlace(item, vertical)} bridge={!vertical}>
          {item.block.rsvp_enabled && (
            <>
              <ActionButton icon="check" label="I'm in" active={myAnswer === "in"} onClick={() => actions.rsvp(item, "in")} />
              <ActionButton icon="x" label="Can't make it" active={myAnswer === "out"} activeClass="tile-stone" onClick={() => actions.rsvp(item, "out")} />
            </>
          )}
          <ActionButton icon="chat" label="Chat" onClick={(button) => actions.message(item, blockOf(button))} />
        </HoverActions>
      )}
    </div>
  );
}

/**
 * Friends' free time on the week calendar: the stretch of the friends' lane
 * they are free in, with their faces where most of them overlap. Tapping the
 * faces opens the details. On a computer, pointing anywhere along the stretch
 * drops a chat button under the pointer: it chats with the friend free at
 * that spot (or, where several are, shows the list to choose from).
 */
export function FriendFreeTime({
  cluster,
  people,
  style,
  size = 26,
  onOpen,
}: {
  cluster: FriendFreeCluster;
  people: (Profile | undefined)[];
  /** Position and size of the whole stretch, within the row. */
  style: CSSProperties;
  /** Size of each face. */
  size?: number;
  onOpen: (cluster: FriendFreeCluster) => void;
}) {
  const names = people.map((p) => p?.name ?? "A friend");
  const from = Math.min(...cluster.items.map((i) => i.fullStartMin));
  const to = Math.max(...cluster.items.map((i) => i.fullEndMin));
  const clusterIdeas = cluster.items.flatMap((item) => readIdeas(item.block.ideas));
  const hasIdeas = clusterIdeas.length > 0;
  // Their ideas' icons (each once, up to three), shown beside the faces where the stretch is long enough.
  const ideaIcons = [...new Set(clusterIdeas.map((i) => i.emoji?.trim()).filter((e): e is string => Boolean(e)))].slice(0, 3);
  const label = `${names.join(", ")} ${names.length === 1 ? "is" : "are"} free ${formatDayKey(cluster.dayKey)}, ${formatSpan(cluster.dayKey, from, to)}${
    hasIdeas ? ", with ideas of what to do" : ""
  }. Open for details.`;
  const actions = useContext(QuickActionsContext);
  const zone = useRef<HTMLDivElement>(null);
  /** Where along the stretch the pointer last was (0 = its start, 1 = its end). */
  const pointer = useRef<number | null>(null);

  // The faces sit where most friends overlap, kept inside the stretch (and so inside the row).
  const length = Math.max(1, cluster.endMin - cluster.startMin);
  const middle = (cluster.peak.startMin + cluster.peak.endMin) / 2;
  const facesAt = (Math.min(cluster.endMin, Math.max(cluster.startMin, middle)) - cluster.startMin) / length;
  const facesLeft = `clamp(${size}px, ${(facesAt * 100).toFixed(3)}%, calc(100% - ${size}px))`;

  /** The chat button follows the pointer along the stretch; it stays put once the pointer heads down to it. */
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const element = zone.current;
    if (!element || (event.target as HTMLElement).closest(".hover-actions, .hover-bridge")) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    pointer.current = rect.width > 0 ? x / rect.width : null;
    const kept = rect.width > 48 ? Math.min(Math.max(x, 22), rect.width - 22) : rect.width / 2;
    element.style.setProperty("--chat-x", `${kept}px`);
  };

  const chat = (button: HTMLElement) => {
    if (!actions) return;
    const at = pointer.current === null ? null : cluster.startMin + pointer.current * length;
    const here = at === null ? [] : cluster.items.filter((item) => item.startMin <= at && at < item.endMin);
    const friends = new Set(here.map((item) => item.block.owner_id));
    if (friends.size === 1) actions.message(here[0], blockOf(button));
    else actions.messageCluster(cluster, blockOf(button));
  };

  return (
    <div
      ref={zone}
      style={{ ...style, ["--chat-x" as string]: facesLeft }}
      className="@container has-hover-actions absolute z-[5]"
      onMouseEnter={follow}
      onMouseMove={follow}
    >
      <button
        type="button"
        onClick={() => onOpen(cluster)}
        aria-label={label}
        title={label}
        className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full hover:brightness-110"
        style={{ left: facesLeft }}
      >
        <AvatarStack people={people} size={size} max={3} />
        {/* ideas of what to do: their icons beside the faces if there's room, otherwise a bulb; tap to see them */}
        {hasIdeas && (
          <span
            className={`idea-badge absolute -right-2 -top-2 flex items-center justify-center ${ideaIcons.length > 0 ? "@min-[200px]:hidden" : ""}`}
            aria-hidden="true"
          >
            <PixelIcon name="bulb" size={9} />
          </span>
        )}
        {ideaIcons.length > 0 && (
          <span
            className={`plate absolute top-1/2 hidden -translate-y-1/2 items-center gap-[3px] !max-w-none !px-1 @min-[200px]:flex ${
              facesAt < 0.5 ? "left-full ml-1" : "right-full mr-1"
            }`}
            aria-hidden="true"
          >
            {ideaIcons.map((icon) => (
              <EventIcon key={icon} value={icon} size={14} max={1} />
            ))}
          </span>
        )}
      </button>
      {actions && (
        <HoverActions place="left-[var(--chat-x)] top-full -translate-x-1/2 mt-[3px]">
          <ActionButton icon="chat" label={names.length === 1 ? `Chat with ${names[0]} about this` : "Chat"} onClick={chat} />
        </HoverActions>
      )}
    </div>
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
      className={`absolute z-[8] flex h-[14px] items-center gap-[3px] border-2 border-current bg-panel px-[3px] font-display text-[8px] leading-none hover:bg-panel-3 ${STATUS_TEXT[entryStatus(first)]}`}
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
