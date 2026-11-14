"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { MAX_WEEKS_AHEAD, MAX_WEEKS_BACK } from "../constants";
import { shiftSeries } from "../recurrence";
import { getSupabase } from "../supabase/client";
import { addDays, startOfWeek, todayKey, zonedToUtc, type DayKey } from "../time";
import type { BlockDraft, BlockRow, CalendarBlock, RsvpRow, RsvpStatus } from "../types";
import { keys } from "./keys";
import { useSession } from "./session";

/** A block plus the related rows the calendar needs, in one request. */
const BLOCK_SELECT =
  "*, rsvps(block_id, occurrence, user_id, status), block_user_shares(user_id), block_group_shares(group_id)";

type BlockWithRelations = BlockRow & {
  rsvps: RsvpRow[] | null;
  block_user_shares: { user_id: string }[] | null;
  block_group_shares: { group_id: string }[] | null;
};

function toCalendarBlock(row: BlockWithRelations): CalendarBlock {
  const { rsvps, block_user_shares, block_group_shares, ...block } = row;
  return {
    ...block,
    skipped_occurrences: block.skipped_occurrences ?? [],
    rsvps: rsvps ?? [],
    shared_user_ids: (block_user_shares ?? []).map((s) => s.user_id),
    shared_group_ids: (block_group_shares ?? []).map((s) => s.group_id),
  };
}

/** How far the calendar can go, and where "this week" is. */
export function calendarLimits(zone: string, now: Date = new Date()) {
  const thisWeek = startOfWeek(todayKey(zone, now));
  const firstDay: DayKey = addDays(thisWeek, -7 * MAX_WEEKS_BACK);
  const endDay: DayKey = addDays(thisWeek, 7 * MAX_WEEKS_AHEAD);
  return { thisWeek, firstDay, endDay };
}

/** Supabase returns at most this many rows per request, so larger results are read in pages. */
const PAGE_SIZE = 1000;

async function fetchBlocks(fromIso: string, toIso: string): Promise<CalendarBlock[]> {
  // Weekly repeats are stored once, so fetch all of them plus one-offs in range.
  // Row-level security limits the result to the viewer's own blocks and blocks shared with them.
  const rows: BlockWithRelations[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await getSupabase()
      .from("blocks")
      .select(BLOCK_SELECT)
      .or(`repeat_weekly.eq.true,and(start_at.lt."${toIso}",end_at.gt."${fromIso}")`)
      .order("id")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data as BlockWithRelations[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows.map(toCalendarBlock);
}

/**
 * All blocks the viewer can see between two days (`endDay` exclusive).
 * Without a range: the weeks around now, which is what the event page and the
 * editor need for spotting overlaps.
 */
export function useCalendarBlocks(zone: string, range?: { firstDay: DayKey; endDay: DayKey }) {
  const limits = useMemo(() => calendarLimits(zone), [zone]);
  const firstDay = range?.firstDay ?? addDays(limits.thisWeek, -28);
  const endDay = range?.endDay ?? addDays(limits.thisWeek, 7 * 13);
  const fromIso = zonedToUtc(firstDay, 0, zone);
  const toIso = zonedToUtc(endDay, 0, zone);
  const query = useQuery({
    queryKey: [...keys.blocks, fromIso, toIso],
    queryFn: () => fetchBlocks(fromIso, toIso),
    // While a wider range loads (scrolling), keep showing what we have.
    placeholderData: keepPreviousData,
  });
  return { ...query, blocks: query.data ?? EMPTY, window: limits };
}
const EMPTY: CalendarBlock[] = [];

/** One block by id (for the event page). Null if it does not exist or is not shared with the viewer. */
export function useBlock(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.block(id),
    queryFn: async (): Promise<CalendarBlock | null> => {
      const { data, error } = await getSupabase().from("blocks").select(BLOCK_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toCalendarBlock(data as BlockWithRelations) : null;
    },
    // Show it instantly if any loaded stretch of the calendar already has it.
    placeholderData: () =>
      queryClient
        .getQueriesData<CalendarBlock[]>({ queryKey: keys.blocks })
        .flatMap(([, cached]) => cached ?? [])
        .find((b) => b.id === id),
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function clean(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** The columns of `blocks` that come from the editor form. */
function draftColumns(draft: BlockDraft) {
  const isJoin = draft.type === "join";
  return {
    type: draft.type,
    start_at: draft.start_at,
    end_at: draft.end_at,
    tz: draft.tz,
    repeat_weekly: draft.repeat_weekly,
    title: clean(draft.title),
    emoji: isJoin ? clean(draft.emoji) : null,
    location: isJoin ? clean(draft.location) : null,
    description: isJoin ? clean(draft.description) : null,
    rsvp_enabled: draft.rsvp_enabled,
    audience: draft.audience,
  };
}

/** Make the stored audience lists match the wanted ones: remove what left, add what is new. */
async function syncShares(
  blockId: string,
  current: { userIds: string[]; groupIds: string[] },
  wanted: { userIds: string[]; groupIds: string[] },
) {
  const supabase = getSupabase();
  const removedUsers = current.userIds.filter((id) => !wanted.userIds.includes(id));
  const addedUsers = wanted.userIds.filter((id) => !current.userIds.includes(id));
  const removedGroups = current.groupIds.filter((id) => !wanted.groupIds.includes(id));
  const addedGroups = wanted.groupIds.filter((id) => !current.groupIds.includes(id));

  if (removedUsers.length > 0) {
    const { error } = await supabase.from("block_user_shares").delete().eq("block_id", blockId).in("user_id", removedUsers);
    if (error) throw error;
  }
  if (removedGroups.length > 0) {
    const { error } = await supabase.from("block_group_shares").delete().eq("block_id", blockId).in("group_id", removedGroups);
    if (error) throw error;
  }
  if (addedUsers.length > 0) {
    const { error } = await supabase
      .from("block_user_shares")
      .insert(addedUsers.map((user_id) => ({ block_id: blockId, user_id })));
    if (error) throw error;
  }
  if (addedGroups.length > 0) {
    const { error } = await supabase
      .from("block_group_shares")
      .insert(addedGroups.map((group_id) => ({ block_id: blockId, group_id })));
    if (error) throw error;
  }
}

/** With "all connections" there is no per-person list to keep; groups can still be added on top. */
function wantedShares(draft: BlockDraft) {
  return {
    userIds: draft.audience === "custom" ? draft.shared_user_ids : [],
    groupIds: draft.shared_group_ids,
  };
}

async function insertBlock(id: string, draft: BlockDraft) {
  const { error } = await getSupabase().from("blocks").insert({ id, ...draftColumns(draft) });
  if (error) throw error;
  await syncShares(id, { userIds: [], groupIds: [] }, wantedShares(draft));
}

function draftFromBlock(block: CalendarBlock): BlockDraft {
  return {
    type: block.type,
    start_at: block.start_at,
    end_at: block.end_at,
    tz: block.tz,
    repeat_weekly: block.repeat_weekly,
    title: block.title,
    emoji: block.emoji,
    location: block.location,
    description: block.description,
    rsvp_enabled: block.rsvp_enabled,
    audience: block.audience,
    shared_user_ids: block.shared_user_ids,
    shared_group_ids: block.shared_group_ids,
  };
}

/**
 * Everything the UI can do to blocks. Each action updates the cached calendar
 * straight away (so dragging feels instant), saves to the database, and
 * refetches; if saving fails, the refetch puts the true state back.
 */
export function useBlockActions() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  const refresh = useCallback(
    (blockId?: string) => {
      const jobs = [queryClient.invalidateQueries({ queryKey: keys.blocks })];
      if (blockId) jobs.push(queryClient.invalidateQueries({ queryKey: keys.block(blockId) }));
      return Promise.all(jobs);
    },
    [queryClient],
  );

  const patchCache = useCallback(
    (update: (blocks: CalendarBlock[]) => CalendarBlock[]) => {
      // Every loaded stretch of the calendar is cached separately; patch them all.
      queryClient.setQueriesData<CalendarBlock[]>({ queryKey: keys.blocks }, (old) => (old ? update(old) : old));
    },
    [queryClient],
  );

  /** Run a write; always resync afterwards, and rethrow so the caller can tell the user. */
  const run = useCallback(
    async <T,>(blockId: string | undefined, write: () => Promise<T>): Promise<T> => {
      try {
        return await write();
      } finally {
        await refresh(blockId);
      }
    },
    [refresh],
  );

  return useMemo(() => {
    const create = (draft: BlockDraft): Promise<string> => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      patchCache((blocks) => [
        ...blocks,
        {
          id,
          owner_id: userId,
          ...draftColumns(draft),
          repeat_count: null,
          skipped_occurrences: [],
          created_at: now,
          updated_at: now,
          rsvps: [],
          shared_user_ids: wantedShares(draft).userIds,
          shared_group_ids: wantedShares(draft).groupIds,
        },
      ]);
      return run(id, async () => {
        await insertBlock(id, draft);
        return id;
      });
    };

    const update = (block: CalendarBlock, draft: BlockDraft): Promise<void> => {
      const columns = draftColumns(draft);
      // Turning off the weekly repeat keeps only the first occurrence.
      const repeatFields = draft.repeat_weekly ? {} : { repeat_count: null, skipped_occurrences: [] };
      patchCache((blocks) => blocks.map((b) => (b.id === block.id ? { ...b, ...columns, ...repeatFields } : b)));
      return run(block.id, async () => {
        const { error } = await getSupabase().from("blocks").update({ ...columns, ...repeatFields }).eq("id", block.id);
        if (error) throw error;
        await syncShares(
          block.id,
          { userIds: block.shared_user_ids, groupIds: block.shared_group_ids },
          wantedShares(draft),
        );
      });
    };

    /** Move/resize. For a weekly repeat this shifts the whole series. */
    const setTimes = (block: CalendarBlock, occurrenceIndex: number, startIso: string, endIso: string): Promise<void> => {
      const times = shiftSeries(block, occurrenceIndex, startIso, endIso);
      patchCache((blocks) => blocks.map((b) => (b.id === block.id ? { ...b, ...times } : b)));
      return run(block.id, async () => {
        const { error } = await getSupabase().from("blocks").update(times).eq("id", block.id);
        if (error) throw error;
      });
    };

    const removeById = (blockId: string): Promise<void> => {
      patchCache((blocks) => blocks.filter((b) => b.id !== blockId));
      return run(blockId, async () => {
        const { error } = await getSupabase().from("blocks").delete().eq("id", blockId);
        if (error) throw error;
      });
    };
    const remove = (block: CalendarBlock): Promise<void> => removeById(block.id);

    /** Delete a single week of a weekly repeat. */
    const skipOccurrence = (block: CalendarBlock, occurrenceIndex: number): Promise<void> => {
      const skipped = [...new Set([...block.skipped_occurrences, occurrenceIndex])].sort((a, b) => a - b);
      patchCache((blocks) => blocks.map((b) => (b.id === block.id ? { ...b, skipped_occurrences: skipped } : b)));
      return run(block.id, async () => {
        const { error } = await getSupabase().from("blocks").update({ skipped_occurrences: skipped }).eq("id", block.id);
        if (error) throw error;
      });
    };

    /** Delete this week and every week after it. */
    const endSeriesAt = (block: CalendarBlock, occurrenceIndex: number): Promise<void> => {
      if (occurrenceIndex <= 0) return remove(block);
      patchCache((blocks) => blocks.map((b) => (b.id === block.id ? { ...b, repeat_count: occurrenceIndex } : b)));
      return run(block.id, async () => {
        const { error } = await getSupabase().from("blocks").update({ repeat_count: occurrenceIndex }).eq("id", block.id);
        if (error) throw error;
      });
    };

    /**
     * Change a single week of a weekly repeat: that week is removed from the
     * series and re-created as a one-off block with the changes applied.
     */
    const detachOccurrence = async (
      block: CalendarBlock,
      occurrenceIndex: number,
      changes: Partial<BlockDraft>,
    ): Promise<string> => {
      await skipOccurrence(block, occurrenceIndex);
      return create({ ...draftFromBlock(block), ...changes, repeat_weekly: false });
    };

    const setRsvp = (block: CalendarBlock, occurrenceIndex: number, status: RsvpStatus | null): Promise<void> => {
      const mine = (r: RsvpRow) => r.user_id === userId && r.occurrence === occurrenceIndex;
      const patch = (b: CalendarBlock): CalendarBlock => ({
        ...b,
        rsvps: [
          ...b.rsvps.filter((r) => !mine(r)),
          ...(status ? [{ block_id: b.id, occurrence: occurrenceIndex, user_id: userId, status }] : []),
        ],
      });
      patchCache((blocks) => blocks.map((b) => (b.id === block.id ? patch(b) : b)));
      queryClient.setQueryData<CalendarBlock | null>(keys.block(block.id), (old) => (old ? patch(old) : old));

      return run(block.id, async () => {
        const supabase = getSupabase();
        const match = { block_id: block.id, occurrence: occurrenceIndex, user_id: userId };
        if (status === null) {
          const { error } = await supabase.from("rsvps").delete().match(match);
          if (error) throw error;
          return;
        }
        // Update first; insert if there was nothing to update.
        const { data, error } = await supabase.from("rsvps").update({ status }).match(match).select("user_id");
        if (error) throw error;
        if (data.length === 0) {
          const { error: insertError } = await supabase.from("rsvps").insert({ ...match, status });
          if (insertError) throw insertError;
        }
      });
    };

    /** Take yourself off the audience of someone else's block. */
    const leave = (block: CalendarBlock): Promise<void> =>
      run(block.id, async () => {
        const { error } = await getSupabase().from("block_user_shares").delete().match({ block_id: block.id, user_id: userId });
        if (error) throw error;
      });

    return { create, update, setTimes, remove, removeById, skipOccurrence, endSeriesAt, detachOccurrence, setRsvp, leave, refresh };
  }, [patchCache, queryClient, refresh, run, userId]);
}

export { draftFromBlock };
