"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getSupabase } from "../supabase/client";
import type { Activity, IdeaVote } from "../types";
import { keys } from "./keys";
import { useSession } from "./session";

/**
 * The viewer's activities ("Brunch", "Book club"), and the "I'm up for this"
 * picks on ideas. Activities are private to their owner (row-level
 * security), so the queries never mention a user id.
 */

/** True when the failure means "the activities database file has not been run yet". */
export function isActivitiesNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "PGRST205" || e.code === "42P01" || /activities|idea_votes/i.test(e.message ?? "")));
}

export const ACTIVITIES_NOT_SET_UP =
  "Activities are not switched on yet: the newest database file has to be run in Supabase (see README).";

function explain(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new Error("You already have an activity with that name.");
  if (isActivitiesNotSetUp(error)) return new Error(ACTIVITIES_NOT_SET_UP);
  return new Error(error.message ?? "Could not save the activity.");
}

const COLUMNS = "id, name, emoji, place_kinds, place_ids";
const byName = (a: Activity, b: Activity) => a.name.localeCompare(b.name);

export function useActivities() {
  const query = useQuery({
    queryKey: keys.activities,
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await getSupabase().from("activities").select(COLUMNS).order("name");
      if (error) throw error;
      return data as Activity[];
    },
    staleTime: 5 * 60_000,
    retry: (count, error) => !isActivitiesNotSetUp(error) && count < 1,
  });
  return {
    activities: query.data ?? EMPTY,
    isLoading: query.isLoading,
    notSetUp: query.isError && isActivitiesNotSetUp(query.error),
  };
}
const EMPTY: Activity[] = [];

export type ActivityFields = Pick<Activity, "name" | "emoji" | "place_kinds" | "place_ids">;

function tidy(fields: ActivityFields): ActivityFields {
  return {
    name: fields.name.trim().replace(/\s+/g, " ").slice(0, 60),
    emoji: fields.emoji?.trim() || null,
    place_kinds: [...new Set(fields.place_kinds.map((k) => k.trim()).filter(Boolean))].slice(0, 8),
    place_ids: [...new Set(fields.place_ids)].slice(0, 10),
  };
}

export function useActivityActions() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: keys.activities });
    const patch = (update: (list: Activity[]) => Activity[]) =>
      queryClient.setQueryData<Activity[]>(keys.activities, (old) => update(old ?? []));

    return {
      add: async (fields: ActivityFields): Promise<Activity> => {
        const { data, error } = await getSupabase().from("activities").insert(tidy(fields)).select(COLUMNS).single();
        if (error) throw explain(error);
        patch((list) => [...list, data as Activity].sort(byName));
        void refresh();
        return data as Activity;
      },

      update: async (id: string, fields: ActivityFields): Promise<void> => {
        const next = tidy(fields);
        patch((list) => list.map((a) => (a.id === id ? { ...a, ...next } : a)).sort(byName));
        const { error } = await getSupabase().from("activities").update(next).eq("id", id);
        void refresh();
        if (error) throw explain(error);
      },

      remove: async (id: string): Promise<void> => {
        patch((list) => list.filter((a) => a.id !== id));
        const { error } = await getSupabase().from("activities").delete().eq("id", id);
        void refresh();
        if (error) throw explain(error);
      },
    };
  }, [queryClient]);
}

// ---------------------------------------------------------------------------
// "I'm up for this"
// ---------------------------------------------------------------------------

/**
 * Who is up for which idea on a block, for one week of it, kept live. Empty
 * (and quiet) until the activities database file has been run.
 */
export function useIdeaVotes(blockId: string, occurrence: number, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = keys.ideaVotes(blockId, occurrence);
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async (): Promise<IdeaVote[]> => {
      const { data, error } = await getSupabase()
        .from("idea_votes")
        .select("block_id, occurrence, idea_id, user_id")
        .eq("block_id", blockId)
        .eq("occurrence", occurrence)
        .order("created_at");
      if (error) throw error;
      return data as IdeaVote[];
    },
    retry: (count, error) => !isActivitiesNotSetUp(error) && count < 1,
  });

  // Live: picks by other people appear as they are made.
  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`idea-votes-${blockId}-${occurrence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_votes", filter: `block_id=eq.${blockId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: keys.ideaVotes(blockId, occurrence) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [blockId, enabled, occurrence, queryClient]);

  return {
    votes: query.data ?? NO_VOTES,
    notSetUp: query.isError && isActivitiesNotSetUp(query.error),
  };
}
const NO_VOTES: IdeaVote[] = [];

/** Say (or take back) "I'm up for this". */
export function useIdeaVoteActions() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  return useMemo(
    () => ({
      set: async (blockId: string, occurrence: number, ideaId: string, upFor: boolean): Promise<void> => {
        const queryKey = keys.ideaVotes(blockId, occurrence);
        const mine = (v: IdeaVote) => v.user_id === userId && v.idea_id === ideaId;
        queryClient.setQueryData<IdeaVote[]>(queryKey, (old) => [
          ...(old ?? []).filter((v) => !mine(v)),
          ...(upFor ? [{ block_id: blockId, occurrence, idea_id: ideaId, user_id: userId }] : []),
        ]);
        const supabase = getSupabase();
        const match = { block_id: blockId, occurrence, idea_id: ideaId, user_id: userId };
        const { error } = upFor
          ? await supabase.from("idea_votes").insert(match)
          : await supabase.from("idea_votes").delete().match(match);
        void queryClient.invalidateQueries({ queryKey });
        // Picking twice (another tab got there first) is fine.
        if (error && error.code !== "23505") {
          throw isActivitiesNotSetUp(error) ? new Error(ACTIVITIES_NOT_SET_UP) : error;
        }
      },
    }),
    [queryClient, userId],
  );
}
