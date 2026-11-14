"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMessaging } from "@/components/messages/Messaging";
import { useFeedback } from "@/components/ui/Feedback";
import { buildDayModels, findSameTypeConflict, type CalendarItem, type FriendFreeCluster } from "@/lib/calendar/model";
import {
  INITIAL_WEEKS_AFTER,
  INITIAL_WEEKS_BEFORE,
  MAX_WEEKS_AHEAD,
  MAX_WEEKS_BACK,
  VISIBLE_HOURS,
  WEEKS_PER_LOAD,
} from "@/lib/constants";
import { useBlockActions, useCalendarBlocks } from "@/lib/data/blocks";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections, useGroups } from "@/lib/data/social";
import { DOOR_ICON, defaultTitleFor } from "@/lib/event-icon";
import { eventPath } from "@/lib/navigation";
import type { Occurrence } from "@/lib/recurrence";
import {
  addDays,
  diffDays,
  formatDayKey,
  formatMinuteRange,
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
import { EventPeek } from "./EventPeek";
import { FriendsDialog } from "./FriendsDialog";
import { InviteDialog } from "./InviteDialog";
import { Toolbar, type CalendarView } from "./Toolbar";
import { WeekGrid } from "./WeekGrid";
import type { DayRange } from "./useBlockGestures";

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
  const messaging = useMessaging();

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

  const gridDays = useMemo(
    () => buildDayModels(blocks, userId, zone, firstDay, dayCount),
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
  const [peek, setPeek] = useState<{ blockId: string; occurrence: Occurrence } | null>(null);
  const [invite, setInvite] = useState<{ blockId: string; occurrence: number } | null>(null);
  const inviteBlock = invite ? (blocks.find((b) => b.id === invite.blockId) ?? null) : null;
  // Read from the live list, so the card reflects an answer the moment it is given.
  const peekBlock = peek ? (blocks.find((b) => b.id === peek.blockId) ?? null) : null;

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
        toast(`You already have Free time then (${formatMinuteRange(conflict.startMin, conflict.endMin)}). Stretch that block instead.`, "error");
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

  const openItem = useCallback(
    (item: CalendarItem) => {
      if (!item.mine) {
        // A friend's event: a quick look, right here.
        if (item.block.type === "join") setPeek({ blockId: item.block.id, occurrence: item.occurrence });
      } else if (item.block.type === "join") {
        router.push(eventPath(item.block.id, item.occurrence.index));
      } else {
        setEditor({ mode: "edit", block: item.block, occurrence: item.occurrence });
      }
    },
    [router],
  );

  /** A block was dragged or resized to a new time. */
  const changeItem = useCallback(
    async (item: CalendarItem, next: DayRange) => {
      const sameDayMine = buildDayModels(blocks, userId, zone, next.dayKey, 1)[0].mine;
      const conflict = findSameTypeConflict({ ...next, type: item.block.type }, sameDayMine, item.block.id);
      if (conflict) {
        toast(`That would overlap your other ${item.block.type === "free" ? "Free" : "Join me"} block (${formatMinuteRange(conflict.startMin, conflict.endMin)}).`, "error");
        return;
      }
      const startIso = zonedToUtc(next.dayKey, next.startMin, zone);
      const endIso = zonedToUtc(next.dayKey, next.endMin, zone);
      try {
        if (item.block.repeat_weekly) {
          const scope = await choose({
            title: "This repeats weekly",
            body: `Move to ${formatDayKey(next.dayKey)}, ${formatMinuteRange(next.startMin, next.endMin)}?`,
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
      style={{ height: "calc(100dvh - 58px - env(safe-area-inset-top))", ["--hours" as string]: VISIBLE_HOURS }}
    >
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
        onMessage={(friendId, item) => {
          setCluster(null);
          messaging.openThread(friendId, { blockId: item.block.id, occurrence: item.occurrence.index });
        }}
      />
      <EventPeek
        block={peekBlock}
        occurrence={peek?.occurrence ?? null}
        host={peekBlock ? profiles.get(peekBlock.owner_id) : undefined}
        zone={zone}
        onClose={() => setPeek(null)}
        onMessageHost={(block, occurrence) => {
          setPeek(null);
          messaging.openThread(block.owner_id, { blockId: block.id, occurrence: occurrence.index });
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
