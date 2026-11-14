"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSupabase } from "../supabase/client";
import { keys } from "./keys";

/**
 * Live updates.
 *
 * Supabase Realtime sends a message whenever a row changes in one of the
 * tables below. It applies row-level security per subscriber, so a browser is
 * only told about rows its user may read. We do not try to patch the cache
 * from those messages; we simply refetch whatever could be affected. That is
 * a little more network traffic but it cannot drift out of sync, and
 * visibility changes (a block newly shared with you) just work.
 *
 * Which cached data each table can affect:
 */
const AFFECTS: Record<string, QueryKey[]> = {
  blocks: [keys.blocks, ["block"]],
  block_user_shares: [keys.blocks, ["block"]],
  block_group_shares: [keys.blocks, ["block"]],
  rsvps: [keys.blocks, ["block"]],
  notifications: [keys.notifications],
  connections: [keys.connections, keys.mutuals, keys.profiles, keys.blocks],
  groups: [keys.groups, keys.mutuals],
  group_members: [keys.groups, keys.mutuals, keys.profiles, keys.blocks],
  profiles: [keys.profiles, keys.mutuals],
};

/** Bursts of changes (e.g. saving a block and its audience) are answered with one refetch. */
const DEBOUNCE_MS = 250;

export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    const pending = new Map<string, QueryKey>();
    let timer: number | undefined;

    const flush = () => {
      timer = undefined;
      for (const queryKey of pending.values()) queryClient.invalidateQueries({ queryKey });
      pending.clear();
    };

    const onChange = (table: string) => {
      for (const queryKey of AFFECTS[table] ?? []) pending.set(JSON.stringify(queryKey), queryKey);
      if (timer === undefined) timer = window.setTimeout(flush, DEBOUNCE_MS);
    };

    let channel = supabase.channel("db-changes");
    for (const table of Object.keys(AFFECTS)) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange(table));
    }
    channel.subscribe();

    // Private messages get their own channel: if that table has not been
    // created yet (the newest database file not run), only this subscription
    // fails and everything else stays live.
    const messages = supabase
      .channel("dm-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => {
        pending.set(JSON.stringify(keys.dms), keys.dms);
        if (timer === undefined) timer = window.setTimeout(flush, DEBOUNCE_MS);
      })
      .subscribe();

    // Coming back to the tab or regaining the network: catch up on anything missed.
    const catchUp = () => {
      if (document.visibilityState === "visible") queryClient.invalidateQueries();
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
      supabase.removeChannel(channel);
      supabase.removeChannel(messages);
    };
  }, [queryClient]);

  return null;
}
