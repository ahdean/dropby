"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSupabase } from "../supabase/client";
import type { DirectMessage } from "../types";
import { keys } from "./keys";
import { useSession } from "./session";

/**
 * Private messages: one conversation per pair of people.
 *
 * Row-level security returns only messages the viewer sent or received, so
 * the queries here never need to filter for privacy, only for "which person".
 */

const COLUMNS = "id, sender_id, recipient_id, body, block_id, occurrence, quote, read_at, created_at";

export interface Conversation {
  otherId: string;
  last: DirectMessage;
  /** Messages from them that the viewer has not opened yet. */
  unread: number;
}

/** True when the failure means "the private-messages table has not been created yet". */
export function isMessagingNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "PGRST205" || e.code === "42P01" || /direct_messages/i.test(e.message ?? "")));
}

/** Every conversation, most recent first, with unread counts. */
export function useConversations() {
  const { userId } = useSession();
  const query = useQuery({
    queryKey: keys.dmList,
    queryFn: async (): Promise<DirectMessage[]> => {
      const { data, error } = await getSupabase()
        .from("direct_messages")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as DirectMessage[];
    },
    // A missing table is a setup problem, not something to keep retrying.
    retry: (count, error) => !isMessagingNotSetUp(error) && count < 1,
  });

  const conversations = useMemo(() => {
    const byPerson = new Map<string, Conversation>();
    for (const message of query.data ?? []) {
      const otherId = message.sender_id === userId ? message.recipient_id : message.sender_id;
      const existing = byPerson.get(otherId);
      const unread = message.recipient_id === userId && !message.read_at ? 1 : 0;
      if (existing) existing.unread += unread;
      else byPerson.set(otherId, { otherId, last: message, unread });
    }
    return [...byPerson.values()];
  }, [query.data, userId]);

  return {
    ...query,
    conversations,
    unreadTotal: conversations.reduce((sum, c) => sum + c.unread, 0),
    notSetUp: query.isError && isMessagingNotSetUp(query.error),
  };
}

/** The messages between the viewer and one other person, oldest first. */
export function useThread(otherId: string | null) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.dmThread(otherId ?? "none"),
    enabled: otherId !== null,
    queryFn: async (): Promise<DirectMessage[]> => {
      const { data, error } = await getSupabase()
        .from("direct_messages")
        .select(COLUMNS)
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data as DirectMessage[];
    },
    retry: (count, error) => !isMessagingNotSetUp(error) && count < 1,
  });
}

export function useMessageSender() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMemo(
    () => ({
      /** Send a message, optionally quoting a block (the database writes the quote itself). */
      send: async (otherId: string, body: string, quote?: { blockId: string; occurrence: number }) => {
        const { data, error } = await getSupabase()
          .from("direct_messages")
          .insert({ recipient_id: otherId, body, block_id: quote?.blockId ?? null, occurrence: quote?.occurrence ?? 0 })
          .select(COLUMNS)
          .single();
        if (error) throw error;
        queryClient.setQueryData<DirectMessage[]>(keys.dmThread(otherId), (old) => [...(old ?? []), data as DirectMessage]);
        void queryClient.invalidateQueries({ queryKey: keys.dmList });
      },

      /** Mark everything this person sent the viewer as read (which also clears the bell). */
      markRead: async (otherId: string) => {
        const { error } = await getSupabase()
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .match({ sender_id: otherId, recipient_id: userId })
          .is("read_at", null);
        if (error) return; // not worth interrupting anyone over
        void queryClient.invalidateQueries({ queryKey: keys.dmList });
        void queryClient.invalidateQueries({ queryKey: keys.notifications });
      },

      remove: async (otherId: string, messageId: string) => {
        const { error } = await getSupabase().from("direct_messages").delete().eq("id", messageId);
        if (error) throw error;
        queryClient.setQueryData<DirectMessage[]>(keys.dmThread(otherId), (old) => old?.filter((m) => m.id !== messageId));
        void queryClient.invalidateQueries({ queryKey: keys.dmList });
      },
    }),
    [queryClient, userId],
  );
}
