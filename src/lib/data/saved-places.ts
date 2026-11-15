"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSupabase } from "../supabase/client";
import type { SavedPlace } from "../types";
import { keys } from "./keys";

/**
 * The viewer's saved places: nicknamed addresses for filling in an event's
 * location with one tap. Private to the owner (row-level security), so the
 * queries never mention a user id.
 */

/** True when the failure means "the saved-places table has not been created yet". */
function isNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "PGRST205" || e.code === "42P01" || /saved_places/i.test(e.message ?? "")));
}

/** Friendlier wording for the two rejections a person can actually cause. */
function explain(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new Error("You already have a place with that name.");
  if (isNotSetUp(error)) {
    return new Error("Saved places are not switched on yet: the newest database file has to be run in Supabase (see README).");
  }
  return new Error(error.message ?? "Could not save the place.");
}

export function useSavedPlaces() {
  const query = useQuery({
    queryKey: keys.savedPlaces,
    queryFn: async (): Promise<SavedPlace[]> => {
      const { data, error } = await getSupabase().from("saved_places").select("id, name, address").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
    // A missing table is a setup step, not something to keep retrying.
    retry: (count, error) => !isNotSetUp(error) && count < 1,
  });
  return {
    places: query.data ?? EMPTY,
    isLoading: query.isLoading,
    /** The database file for saved places has not been run yet. */
    notSetUp: query.isError && isNotSetUp(query.error),
  };
}
const EMPTY: SavedPlace[] = [];

export function useSavedPlaceActions() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: keys.savedPlaces });
    const patch = (update: (places: SavedPlace[]) => SavedPlace[]) =>
      queryClient.setQueryData<SavedPlace[]>(keys.savedPlaces, (old) => (old ? update(old) : old));

    return {
      add: async (name: string, address: string): Promise<SavedPlace> => {
        const { data, error } = await getSupabase()
          .from("saved_places")
          .insert({ name: name.trim(), address: address.trim() })
          .select("id, name, address")
          .single();
        if (error) throw explain(error);
        patch((places) => [...places, data].sort((a, b) => a.name.localeCompare(b.name)));
        void refresh();
        return data;
      },

      /** Rename it, change its address, or both. */
      update: async (id: string, fields: { name: string; address: string }): Promise<void> => {
        const next = { name: fields.name.trim(), address: fields.address.trim() };
        const { error } = await getSupabase().from("saved_places").update(next).eq("id", id);
        if (error) throw explain(error);
        patch((places) => places.map((p) => (p.id === id ? { ...p, ...next } : p)).sort((a, b) => a.name.localeCompare(b.name)));
        void refresh();
      },

      remove: async (id: string): Promise<void> => {
        patch((places) => places.filter((p) => p.id !== id));
        const { error } = await getSupabase().from("saved_places").delete().eq("id", id);
        void refresh();
        if (error) throw explain(error);
      },
    };
  }, [queryClient]);
}
