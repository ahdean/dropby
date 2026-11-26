"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { VISIBLE_BOUNDS } from "@/lib/calendar/intervals";
import {
  buildDayModels,
  findSameTypeConflict,
  type CalendarItem,
  type FriendFreeCluster,
  type OffscreenEntry,
} from "@/lib/calendar/model";
import {
  INITIAL_WEEKS_AFTER,
  INITIAL_WEEKS_BEFORE,
  MAX_WEEKS_AHEAD,
  MAX_WEEKS_BACK,
  VISIBLE_HOURS,
  WEEKS_PER_LOAD,
} from "@/lib/constants";
import { useBlockActions, useCalendarBlocks } from "@/lib/data/blocks";
import type { Occurrence } from "@/lib/recurrence";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections, useGroups } from "@/lib/data/social";
import { DOOR_ICON, defaultTitleFor } from "@/lib/event-icon";
import {
  addDays,
  diffDays,
  formatDayKey,
  formatMinuteRange,
  formatSpan,
  formatMonth,
  startOfWeek,
  todayKey,
  utcToZoned,
  zonedToUtc,
  type DayKey,
} from "@/lib/time";
import type { CalendarBlock, Profile } from "@/lib/types";
import { useZone } from "@/lib/zone";
import { BlockEditor, type EditorState } from "./BlockEditor";
import { DayView } from "./DayView";
import { BlockSheet, type SheetRequest } from "./EventPeek";
import { QuickActionsContext, type QuickActions } from "./Beams";
import { FriendsDialog } from "./FriendsDialog";
import { InviteDialog } from "./InviteDialog";
import { OffscreenDialog, type OffscreenList } from "./OffscreenDialog";
import { Toolbar, type CalendarView } from "./Toolbar";
import { WeekGrid } from "./WeekGrid";
import type { DayRange } from "./useBlockGestures";

// Named before the app was renamed; kept so the saved choice survives.
const VIEW_STORAGE_KEY = "dropby:view";

/** Blocks are fetched for whole stretches of this many weeks, so scrolling a little does not refetch. */
const FETCH_CHUNK_WEEKS = 8;

/** The current time, refreshed every half minute (drives "today" and the now-marker). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The weeks currently loaded in the week view, as offsets from this week (end exclusive). */
interface LoadedWeeks {
  start: number;
  end: number;
}

function weeksAround(week: number): LoadedWeeks {
  return {
    start: Math.max(-MAX_WEEKS_BACK, week - INITIAL_WEEKS_BEFORE),
    end: Math.min(MAX_WEEKS_AHEAD, week + INITIAL_WEEKS_AFTER),
  };
}

/**
 * The main screen. Owns what is being looked at (which weeks are loaded, or
 * which day) and what is open (editor, friends, quick look, invite); the views
 * below only draw and report gestures.
 */
export function CalendarScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useSession();
  const { toast, toastError, choose } = useFeedback();
  const actions = useBlockActions();

  const zone = useZone();
  const now = useNow();
  const today = todayKey(zone, now);
  const nowMin = utcToZoned(now.toISOString(), zone).minutes;
  const thisWeek = startOfWeek(today);
  const minDay = addDays(thisWeek, -7 * MAX_WEEKS_BACK);
  const maxDay = addDays(thisWeek, 7 * MAX_WEEKS_AHEAD - 1);

  // --- what is on screen ----------------------------------------------------
  // This screen only ever renders in the browser (after the session is known),
  // so reading the saved preference while initialising is safe.
  const [view, setView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.localStorage.getItem(VIEW_STORAGE_KEY) === "day" ? "day" : "grid",
  );
  const [weeks, setWeeks] = useState<LoadedWeeks>(() => weeksAround(0));
  /** The day the week view should scroll to; a new `nonce` repeats the scroll. */
  const [anchor, setAnchor] = useState<{ day: DayKey; nonce: number }>(() => ({ day: thisWeek, nonce: 0 }));
  const [topDay, setTopDay] = useState<DayKey>(thisWeek);
  const [selectedDay, setSelectedDay] = useState<DayKey>(today);

  // On a phone held sideways the top rows are hidden while the calendar is on
  // screen (the rule is in globals.css); these two flags tell the page so.
  const [barsShown, setBarsShown] = useState(false);
  useEffect(() => {
    document.body.dataset.calendar = "on";
    return () => {
      delete document.body.dataset.calendar;
    };
  }, []);
  useEffect(() => {
    if (barsShown) document.body.dataset.showBars = "on";
    else delete document.body.dataset.showBars;
    return () => {
      delete document.body.dataset.showBars;
    };
  }, [barsShown]);

  const changeView = (next: CalendarView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  /** Go to a day: reload the weeks around it and put it at the top. */
  const jumpTo = useCallback(
    (day: DayKey, scrollTo: DayKey = day) => {
      const clamped = day < minDay ? minDay : day > maxDay ? maxDay : day;
      const week = Math.round(diffDays(thisWeek, startOfWeek(clamped)) / 7);
      setWeeks(weeksAround(week));
      setAnchor((a) => ({ day: scrollTo < minDay ? minDay : scrollTo > maxDay ? maxDay : scrollTo, nonce: a.nonce + 1 }));
      setSelectedDay(clamped);
    },
    [maxDay, minDay, thisWeek],
  );

  // A link such as /?day=2026-11-20 (from a notification) jumps to that day.
  const dayParam = searchParams.get("day");
  const [handledDayParam, setHandledDayParam] = useState<string | null>(null);
  if (dayParam !== handledDayParam) {
    // Adjust what is shown as soon as the link changes (React's "store the previous value" pattern).
    setHandledDayParam(dayParam);
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) jumpTo(dayParam);
  }

  const firstDay = addDays(thisWeek, weeks.start * 7);
  const dayCount = (weeks.end - weeks.start) * 7;

  // Fetch whole chunks around what is loaded, so the request changes only now and then.
  const fetchRange = useMemo(() => {
    const start = Math.floor(weeks.start / FETCH_CHUNK_WEEKS) * FETCH_CHUNK_WEEKS;
    const end = Math.ceil(weeks.end / FETCH_CHUNK_WEEKS) * FETCH_CHUNK_WEEKS;
    return { firstDay: addDays(thisWeek, start * 7), endDay: addDays(thisWeek, end * 7) };
  }, [thisWeek, weeks.end, weeks.start]);

  const { blocks, isLoading, isError } = useCalendarBlocks(zone, fetchRange);
  const { byId: profiles } = useProfiles();
  const { connectionIds } = useConnections();
  const { groups } = useGroups();

  // The week grid draws 8 AM–11 PM (anything else gets a tab at the end of its row); the day view draws the whole day.
  const gridDays = useMemo(
    () => buildDayModels(blocks, userId, zone, firstDay, dayCount, VISIBLE_BOUNDS),
    [blocks, userId, zone, firstDay, dayCount],
  );
  const singleDay = useMemo(
    () => buildDayModels(blocks, userId, zone, selectedDay, 1)[0],
    [blocks, userId, zone, selectedDay],
  );

  const loadEarlier = useCallback(
    () => setWeeks((w) => ({ start: Math.max(-MAX_WEEKS_BACK, w.start - WEEKS_PER_LOAD), end: w.end })),
    [],
  );
  const loadLater = useCallback(
    () => setWeeks((w) => ({ start: w.start, end: Math.min(MAX_WEEKS_AHEAD, w.end + WEEKS_PER_LOAD) })),
    [],
  );

  const hasOwnBlocks = useMemo(() => blocks.some((b) => b.owner_id === userId), [blocks, userId]);

  const connections = useMemo(
    () =>
      connectionIds
        .map((id) => profiles.get(id))
        .filter((p): p is Profile => Boolean(p))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [connectionIds, profiles],
  );

  // --- what is open ---------------------------------------------------------
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [cluster, setCluster] = useState<FriendFreeCluster | null>(null);
  /** The quick look over the calendar (events, and friends' free time), and which tab it opens on. */
  /** The window of the block that was tapped (or linked to). */
  const [sheet, setSheet] = useState<SheetRequest | null>(null);

  // A link such as /?block=<id>&o=2&with=<person> (from a notification, a
  // quoted message or an old event-page link) opens that block's window.
  const blockParam = searchParams.get("block");
  const linkKey = blockParam ? `${blockParam}:${searchParams.get("o") ?? ""}:${searchParams.get("with") ?? ""}` : null;
  const [handledLink, setHandledLink] = useState<string | null>(null);
  if (linkKey !== handledLink) {
    setHandledLink(linkKey);
    if (blockParam) {
      const o = Number(searchParams.get("o"));
      setSheet({ blockId: blockParam, occurrence: Number.isInteger(o) && o >= 0 ? o : undefined, to: searchParams.get("with") });
    }
  }
  const [invite, setInvite] = useState<{ blockId: string; occurrence: number } | null>(null);
  const [offscreen, setOffscreen] = useState<OffscreenList | null>(null);
  const inviteBlock = invite ? (blocks.find((b) => b.id === invite.blockId) ?? null) : null;
  // Read from the live list, so the card reflects an answer the moment it is given.

  /**
   * Dragging across a day, or tapping an empty spot, makes a Free block on the
   * spot (shared with all connections, like any new block). Tapping the block
   * afterwards opens its details, where it can become a hosted event.
   */
  const quickCreate = useCallback(
    async (range: DayRange) => {
      const sameDayMine = buildDayModels(blocks, userId, zone, range.dayKey, 1)[0].mine;
      const conflict = findSameTypeConflict({ ...range, type: "free" }, sameDayMine);
      if (conflict) {
        toast(`You already have Free time then (${formatSpan(conflict.dayKey, conflict.fullStartMin, conflict.fullEndMin)}). Stretch that block instead.`, "error");
        return;
      }
      try {
        const blockId = await actions.create({
          type: "free",
          start_at: zonedToUtc(range.dayKey, range.startMin, zone),
          end_at: zonedToUtc(range.dayKey, range.endMin, zone),
          tz: zone,
          repeat_weekly: false,
          title: null,
          emoji: null,
          location: null,
          description: null,
          rsvp_enabled: true,
          audience: "all_connections",
          shared_user_ids: [],
          shared_group_ids: [],
        });
        toast(`Free ${formatMinuteRange(range.startMin, range.endMin)} added. Tap it to add details or host something.`, "success", {
          label: "Undo",
          onClick: () => void actions.removeById(blockId).catch((error) => toastError(error)),
        });
      } catch (error) {
        toastError(error, "Could not add the block. Please try again.");
      }
    },
    [actions, blocks, toast, toastError, userId, zone],
  );

  /**
   * Tapping a block: your own opens straight in the editor (its chat is at the
   * bottom); a friend's opens its window, with details and the chat.
   */
  const openItem = useCallback((item: CalendarItem) => {
    if (item.mine) setEditor({ mode: "edit", block: item.block, occurrence: item.occurrence });
    else setSheet({ blockId: item.block.id, occurrence: item.occurrence.index });
  }, []);

  /** The buttons that drop down from a block on hover (computers): answer, or write a message. */
  const quickActions = useMemo<QuickActions>(
    () => ({
      rsvp: (item, status) => {
        const current = item.block.rsvps.find((r) => r.occurrence === item.occurrence.index && r.user_id === userId)?.status ?? null;
        const next = current === status ? null : status; // the same answer again clears it
        actions
          .setRsvp(item.block, item.occurrence.index, next)
          .then(() => {
            if (next === "in") toast("You're in! It's locked in.", "success");
          })
          .catch((error) => toastError(error, "Could not save your answer."));
      },
      message: (item) => {
        if (item.mine) setEditor({ mode: "edit", block: item.block, occurrence: item.occurrence, focusChat: true });
        else setSheet({ blockId: item.block.id, occurrence: item.occurrence.index, focus: true });
      },
      messageCluster: (c) => {
        if (c.userIds.length === 1) setSheet({ blockId: c.items[0].block.id, occurrence: c.items[0].occurrence.index, focus: true });
        else setCluster(c);
      },
    }),
    [actions, toast, toastError, userId],
  );

  /** A link (notification, quoted message) to one of your own blocks: the editor, scrolled to its chat. */
  const openOwnFromLink = useCallback((block: CalendarBlock, occurrence: Occurrence, to: string | null) => {
    setSheet(null);
    setEditor({ mode: "edit", block, occurrence, chatTo: to, focusChat: true });
  }, []);

  /** Something outside the week grid's hours: open it as if it had been tapped on the calendar. */
  const openEntry = useCallback(
    (entry: OffscreenEntry) => {
      if (entry.kind === "friends") setCluster(entry.cluster);
      else openItem(entry.item);
    },
    [openItem],
  );

  /** The tab at the end of a week row: one thing opens straight away, several are listed. */
  const openOffscreen = useCallback(
    (dayKey: DayKey, side: "before" | "after", entries: OffscreenEntry[]) => {
      if (entries.length === 1) openEntry(entries[0]);
      else setOffscreen({ dayKey, side, entries });
    },
    [openEntry],
  );

  /** A block was dragged or resized to a new time. */
  const changeItem = useCallback(
    async (item: CalendarItem, next: DayRange) => {
      const sameDayMine = buildDayModels(blocks, userId, zone, next.dayKey, 1)[0].mine;
      const conflict = findSameTypeConflict({ ...next, type: item.block.type }, sameDayMine, item.block.id);
      if (conflict) {
        toast(`That would overlap your other ${item.block.type === "free" ? "Free" : "Join me"} block (${formatSpan(conflict.dayKey, conflict.fullStartMin, conflict.fullEndMin)}).`, "error");
        return;
      }
      const startIso = zonedToUtc(next.dayKey, next.startMin, zone);
      const endIso = zonedToUtc(next.dayKey, next.endMin, zone);
      try {
        if (item.block.repeat_weekly) {
          const scope = await choose({
            title: "This repeats weekly",
            body: `Move to ${formatDayKey(next.dayKey)}, ${formatSpan(next.dayKey, next.startMin, next.endMin)}?`,
            choices: [
              { value: "one", label: "Just this one", variant: "stone" },
              { value: "all", label: "Every week", variant: "free" },
            ],
          });
          if (!scope) return;
          if (scope === "one") {
            await actions.detachOccurrence(item.block, item.occurrence.index, { start_at: startIso, end_at: endIso, tz: zone });
          } else {
            await actions.setTimes(item.block, item.occurrence.index, startIso, endIso);
          }
        } else {
          await actions.setTimes(item.block, 0, startIso, endIso);
        }
      } catch (error) {
        toastError(error, "Could not move the block. It has been put back.");
      }
    },
    [actions, blocks, choose, toast, toastError, userId, zone],
  );

  /** From the friends dialog: host something in the time those friends share. */
  const hostFor = (c: FriendFreeCluster) => {
    const when = c.common ?? c.peak;
    setCluster(null);
    setEditor({
      mode: "create",
      range: { dayKey: c.dayKey, startMin: when.startMin, endMin: when.endMin },
      preset: {
        type: "join",
        emoji: DOOR_ICON,
        title: defaultTitleFor(DOOR_ICON),
        audience: { audience: "custom", userIds: c.userIds, groupIds: [] },
      },
    });
  };

  const goToday = () => jumpTo(today, thisWeek);

  const label = view === "grid" ? formatMonth(topDay, "short") : formatDayKey(selectedDay);

  return (
    <main
      className="flex min-h-0 flex-col"
      // Fill the screen below the header so the calendar scrolls inside its frame.
      style={{
        height: "calc(100dvh - var(--header-h) - env(safe-area-inset-top))",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        ["--hours" as string]: VISIBLE_HOURS,
      }}
    >
      {/* Only shown on a phone held sideways (see globals.css), where the top rows are tucked away. */}
      <button
        type="button"
        className="bars-toggle btn tile tile-dark !min-h-[36px] !w-9 !p-0"
        aria-label={barsShown ? "Hide the menu rows" : "Show the menu rows"}
        aria-pressed={barsShown}
        onClick={() => setBarsShown((shown) => !shown)}
      >
        <PixelIcon name={barsShown ? "up" : "down"} size={12} />
      </button>
      <Toolbar
        view={view}
        onViewChange={changeView}
        label={label}
        onToday={goToday}
        onJump={(day) => jumpTo(day)}
        today={today}
        selectedDay={view === "grid" ? topDay : selectedDay}
        onSelectDay={setSelectedDay}
        minDay={minDay}
        maxDay={maxDay}
      />

      <div className="relative flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-5 sm:pb-4">
        {isError && (
          <p className="mb-2 text-danger" role="alert">
            Could not load the calendar. Check your connection; it will retry by itself.
          </p>
        )}
        {!isLoading && !isError && !hasOwnBlocks && (
          <p className="mb-2 px-1 text-ink-dim" role="note">
            Your calendar is empty. Drag across a day, or tap it, to mark when you&apos;re free. Tap a block to add details
            or turn it into something you&apos;re hosting.
          </p>
        )}
        <QuickActionsContext value={quickActions}>
        {view === "grid" ? (
          <WeekGrid
            days={gridDays}
            today={today}
            thisWeek={thisWeek}
            nowMin={nowMin}
            profiles={profiles}
            anchor={anchor}
            canLoadEarlier={weeks.start > -MAX_WEEKS_BACK}
            canLoadLater={weeks.end < MAX_WEEKS_AHEAD}
            onLoadEarlier={loadEarlier}
            onLoadLater={loadLater}
            onTopDayChange={setTopDay}
            onCreate={quickCreate}
            onChange={changeItem}
            onOpenItem={openItem}
            onOpenCluster={setCluster}
            onOpenOffscreen={openOffscreen}
          />
        ) : (
          <DayView
            day={singleDay}
            today={today}
            nowMin={nowMin}
            profiles={profiles}
            onCreate={quickCreate}
            onChange={changeItem}
            onOpenItem={openItem}
            onOpenCluster={setCluster}
          />
        )}
        </QuickActionsContext>
        {isLoading && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 animate-blink text-center font-display text-[10px] text-ink-dim" role="status">
            Loading…
          </p>
        )}
      </div>

      <BlockEditor
        state={editor}
        zone={zone}
        blocks={blocks}
        connections={connections}
        groups={groups}
        minDay={minDay}
        maxDay={maxDay}
        onClose={() => setEditor(null)}
        onSaved={({ blockId, occurrence, invite: wantsInvite }) => {
          setEditor(null);
          if (wantsInvite) setInvite({ blockId, occurrence });
        }}
      />
      <FriendsDialog
        cluster={cluster}
        profiles={profiles}
        onClose={() => setCluster(null)}
        onHost={hostFor}
        onOpen={(item) => {
          setCluster(null);
          setSheet({ blockId: item.block.id, occurrence: item.occurrence.index });
        }}
      />
      <BlockSheet
        request={sheet}
        zone={zone}
        onClose={() => {
          setSheet(null);
          // Opened from a link: tidy the address, so going back doesn't reopen it.
          if (blockParam) router.replace("/", { scroll: false });
        }}
        onOwnBlock={openOwnFromLink}
      />
      <OffscreenDialog
        list={offscreen}
        profiles={profiles}
        onClose={() => setOffscreen(null)}
        onOpenEntry={(entry) => {
          setOffscreen(null);
          openEntry(entry);
        }}
        onShowDay={(dayKey) => {
          setOffscreen(null);
          setSelectedDay(dayKey);
          changeView("day");
        }}
      />
      <InviteDialog
        open={invite !== null && inviteBlock !== null}
        onClose={() => setInvite(null)}
        block={inviteBlock as CalendarBlock | null}
        occurrence={invite?.occurrence ?? 0}
      />
    </main>
  );
}
