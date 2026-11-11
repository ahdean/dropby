"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/ui/Feedback";
import { buildDayModels, findSameTypeConflict, type CalendarItem, type FriendFreeCluster } from "@/lib/calendar/model";
import {
  DAY_END_MIN,
  DEFAULT_BLOCK_MINUTES,
  INITIAL_WEEKS,
  MAX_WEEKS_AHEAD,
  MAX_WEEKS_BACK,
  SNAP_MINUTES,
  VISIBLE_HOURS,
} from "@/lib/constants";
import { useBlockActions, useCalendarBlocks } from "@/lib/data/blocks";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections, useGroups } from "@/lib/data/social";
import { eventPath } from "@/lib/navigation";
import {
  addDays,
  deviceZone,
  diffDays,
  formatDayKey,
  formatMinuteRange,
  startOfWeek,
  todayKey,
  utcToZoned,
  zonedToUtc,
  type DayKey,
} from "@/lib/time";
import type { CalendarBlock, Profile } from "@/lib/types";
import { BlockEditor, type EditorState } from "./BlockEditor";
import { DayView } from "./DayView";
import { FriendsDialog } from "./FriendsDialog";
import { InviteDialog } from "./InviteDialog";
import { Toolbar, type CalendarView } from "./Toolbar";
import { WeekGrid } from "./WeekGrid";
import type { DayRange } from "./useBlockGestures";

const VIEW_STORAGE_KEY = "dropby:view";

/** The current time, refreshed every half minute (drives "today" and the now-marker). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The main screen. Owns what is being looked at (which weeks or which day) and
 * what is open (editor, friends, invite); the views below only draw and report
 * gestures.
 */
export function CalendarScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useSession();
  const { toast, toastError, choose } = useFeedback();
  const actions = useBlockActions();

  const zone = useMemo(() => deviceZone(), []);
  const now = useNow();
  const today = todayKey(zone, now);
  const nowMin = utcToZoned(now.toISOString(), zone).minutes;

  const { blocks, window: range, isLoading, isError } = useCalendarBlocks(zone);
  const { byId: profiles } = useProfiles();
  const { connectionIds } = useConnections();
  const { groups } = useGroups();

  const minDay = range.firstDay;
  const maxDay = addDays(range.endDay, -1);

  // --- what is on screen ----------------------------------------------------
  const [view, setView] = useState<CalendarView>("grid");
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeksShown, setWeeksShown] = useState(INITIAL_WEEKS);
  const [selectedDay, setSelectedDay] = useState<DayKey>(today);
  const [focusDay, setFocusDay] = useState<DayKey | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "day" || stored === "grid") setView(stored);
  }, []);

  const changeView = (next: CalendarView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  // A link such as /?day=2026-11-20 (from a notification) jumps to that day.
  const dayParam = searchParams.get("day");
  useEffect(() => {
    if (!dayParam || !/^\d{4}-\d{2}-\d{2}$/.test(dayParam) || dayParam < minDay || dayParam > maxDay) return;
    const offset = Math.round(diffDays(range.thisWeek, startOfWeek(dayParam)) / 7);
    setWeekOffset(offset);
    setWeeksShown(INITIAL_WEEKS);
    setSelectedDay(dayParam);
    setFocusDay(dayParam);
  }, [dayParam, minDay, maxDay, range.thisWeek]);

  const firstDay = addDays(range.thisWeek, weekOffset * 7);
  const weeksAvailable = MAX_WEEKS_AHEAD - weekOffset;
  const dayCount = Math.min(weeksShown, weeksAvailable) * 7;
  const canLoadMore = weeksShown < weeksAvailable;

  const gridDays = useMemo(
    () => buildDayModels(blocks, userId, zone, firstDay, dayCount),
    [blocks, userId, zone, firstDay, dayCount],
  );
  const singleDay = useMemo(
    () => buildDayModels(blocks, userId, zone, selectedDay, 1)[0],
    [blocks, userId, zone, selectedDay],
  );

  const loadMore = useCallback(() => setWeeksShown((n) => n + 1), []);

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
  const [invite, setInvite] = useState<{ blockId: string; occurrence: number } | null>(null);
  const inviteBlock = invite ? (blocks.find((b) => b.id === invite.blockId) ?? null) : null;

  const openCreate = useCallback((range: DayRange) => setEditor({ mode: "create", range }), []);

  const openItem = useCallback(
    (item: CalendarItem) => {
      if (item.block.type === "join") {
        router.push(eventPath(item.block.id, item.occurrence.index));
      } else if (item.mine) {
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

  /** "+ New": start with the next round hour today (or the selected day in day view). */
  const newBlock = () => {
    const dayKey = view === "day" && selectedDay >= today ? selectedDay : today;
    const base = dayKey === today ? Math.ceil((nowMin + 1) / SNAP_MINUTES) * SNAP_MINUTES : 18 * 60;
    const startMin = Math.min(Math.max(base, 6 * 60), DAY_END_MIN - DEFAULT_BLOCK_MINUTES);
    openCreate({ dayKey, startMin, endMin: startMin + DEFAULT_BLOCK_MINUTES });
  };

  /** From the friends dialog: host something in the time those friends share. */
  const hostFor = (c: FriendFreeCluster) => {
    const when = c.common ?? c.peak;
    setCluster(null);
    setEditor({
      mode: "create",
      range: { dayKey: c.dayKey, startMin: when.startMin, endMin: when.endMin },
      preset: { type: "join", audience: { audience: "custom", userIds: c.userIds, groupIds: [] } },
    });
  };

  // --- navigation -----------------------------------------------------------
  const goBack = () => {
    if (view === "grid") {
      setWeekOffset((o) => Math.max(-MAX_WEEKS_BACK, o - 1));
      setWeeksShown(INITIAL_WEEKS);
    } else {
      setSelectedDay((d) => (d > minDay ? addDays(d, -1) : d));
    }
  };
  const goForward = () => {
    if (view === "grid") {
      setWeekOffset((o) => Math.min(MAX_WEEKS_AHEAD - 1, o + 1));
      setWeeksShown(INITIAL_WEEKS);
    } else {
      setSelectedDay((d) => (d < maxDay ? addDays(d, 1) : d));
    }
  };
  const goToday = () => {
    setWeekOffset(0);
    setWeeksShown(INITIAL_WEEKS);
    setSelectedDay(today);
    setFocusDay(null);
    // Re-trigger the scroll even if today was already the focus.
    window.setTimeout(() => setFocusDay(today), 0);
  };

  const rangeLabel =
    view === "grid"
      ? `${formatDayKey(firstDay).split(", ")[1]} – ${formatDayKey(addDays(firstDay, dayCount - 1)).split(", ")[1]}`
      : formatDayKey(selectedDay);

  return (
    <main
      className="flex min-h-0 flex-col"
      // Fill the screen below the header so the calendar scrolls inside its frame.
      style={{ height: "calc(100dvh - 58px - env(safe-area-inset-top))", ["--hours" as string]: VISIBLE_HOURS }}
    >
      <Toolbar
        view={view}
        onViewChange={changeView}
        rangeLabel={rangeLabel}
        canGoBack={view === "grid" ? weekOffset > -MAX_WEEKS_BACK : selectedDay > minDay}
        canGoForward={view === "grid" ? weekOffset < MAX_WEEKS_AHEAD - 1 : selectedDay < maxDay}
        onBack={goBack}
        onForward={goForward}
        onToday={goToday}
        onNew={newBlock}
        today={today}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        minDay={minDay}
        maxDay={maxDay}
      />

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 sm:px-5 sm:pb-4">
        {isError && (
          <p className="mb-2 text-danger" role="alert">
            Could not load the calendar. Check your connection; it will retry by itself.
          </p>
        )}
        {view === "grid" ? (
          <WeekGrid
            days={gridDays}
            today={today}
            thisWeek={range.thisWeek}
            nowMin={nowMin}
            profiles={profiles}
            focusDay={focusDay}
            canLoadMore={canLoadMore}
            onLoadMore={loadMore}
            onCreate={openCreate}
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
            onCreate={openCreate}
            onChange={changeItem}
            onOpenItem={openItem}
            onOpenCluster={setCluster}
          />
        )}
        {isLoading && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center font-display text-[10px] text-ink-dim animate-blink" role="status">
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
      <FriendsDialog cluster={cluster} profiles={profiles} onClose={() => setCluster(null)} onHost={hostFor} />
      <InviteDialog open={invite !== null && inviteBlock !== null} onClose={() => setInvite(null)} block={inviteBlock as CalendarBlock | null} occurrence={invite?.occurrence ?? 0} />
    </main>
  );
}
