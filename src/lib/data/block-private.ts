"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo } from "react";
import { getSupabase } from "../supabase/client";
import type { BlockPrivateMessage } from "../types";
import { isBlockChatsNotSetUp } from "./events";
import { keys } from "./keys";

/**
 * Private conversations inside one block (and week): two people at a time.
 * Row-level security only returns the viewer's own conversations, so one
 * query fetches all of them; they are grouped by the other person here.
 */

export interface PrivateConversation {
  otherId: string;
  messages: BlockPrivateMessage[];
  /** Messages to the viewer that they have not read yet. */
  unread: number;
  lastAt: string;
}

export function useBlockPrivateMessages(blockId: string, occurrence: number, userId: string) {
  const queryClient = useQueryClient();
  const key = keys.blockPrivate(blockId, occurrence);
  // Each use gets its own channel name: two subscriptions under one name crash the page.
  const instance = useId();

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<BlockPrivateMessage[]> => {
      const { data, error } = await getSupabase()
        .from("block_private_messages")
        .select("id, block_id, occurrence, sender_id, recipient_id, body, read_at, created_at")
        .eq("block_id", blockId)
        .eq("occurrence", occurrence)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    // A missing table is a setup step, not something to keep retrying.
    retry: (count, error) => !isBlockChatsNotSetUp(error) && count < 1,
  });

  // Live: new messages, read receipts and deletions in this block.
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`block-private:${blockId}:${occurrence}:${instance}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "block_private_messages", filter: `block_id=eq.${blockId}` },
        () => void queryClient.invalidateQueries({ queryKey: keys.blockPrivate(blockId, occurrence) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [blockId, instance, occurrence, queryClient]);

  const conversations = useMemo(() => {
    const byPerson = new Map<string, PrivateConversation>();
    for (const message of query.data ?? []) {
      const otherId = message.sender_id === userId ? message.recipient_id : message.sender_id;
      const conversation = byPerson.get(otherId) ?? { otherId, messages: [], unread: 0, lastAt: message.created_at };
      conversation.messages.push(message);
      conversation.lastAt = message.created_at;
      if (message.recipient_id === userId && !message.read_at) conversation.unread += 1;
      byPerson.set(otherId, conversation);
    }
    return [...byPerson.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [query.data, userId]);

  return {
    /** Every private message the viewer can see here, oldest first. */
    messages: query.data ?? EMPTY_PRIVATE,
    conversations,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0),
    isLoading: query.isLoading,
    /** The database file that adds private block messages has not been run yet. */
    notSetUp: query.isError && isBlockChatsNotSetUp(query.error),
  };
}

const EMPTY_PRIVATE: BlockPrivateMessage[] = [];

export function useBlockPrivateActions(blockId: string, occurrence: number, userId: string) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const key = keys.blockPrivate(blockId, occurrence);
    const patch = (update: (rows: BlockPrivateMessage[]) => BlockPrivateMessage[]) =>
      queryClient.setQueryData<BlockPrivateMessage[]>(key, (old) => (old ? update(old) : old));
    const explain = (error: { code?: string; message?: string }) =>
      isBlockChatsNotSetUp(error)
        ? new Error("Private chats in blocks are not switched on yet: the newest database file has to be run in Supabase (see README).")
        : /row-level security/i.test(error.message ?? "")
          ? new Error("You can't write to this person here. They may not be able to see this block.")
          : new Error(error.message ?? "Could not send.");

    return {
      send: async (recipientId: string, body: string) => {
        const id = crypto.randomUUID();
        const message: BlockPrivateMessage = {
          id,
          block_id: blockId,
          occurrence,
          sender_id: userId,
          recipient_id: recipientId,
          body,
          read_at: null,
          created_at: new Date().toISOString(),
        };
        patch((rows) => [...rows, message]);
        const { error } = await getSupabase()
          .from("block_private_messages")
          .insert({ id, block_id: blockId, occurrence, recipient_id: recipientId, body });
        if (error) {
          patch((rows) => rows.filter((m) => m.id !== id));
          throw explain(error);
        }
      },

      /** Everything sent privately to the viewer here counts as read. */
      markAllRead: async () => {
        const now = new Date().toISOString();
        patch((rows) => rows.map((m) => (m.recipient_id === userId && !m.read_at ? { ...m, read_at: now } : m)));
        await getSupabase()
          .from("block_private_messages")
          .update({ read_at: now })
          .eq("block_id", blockId)
          .eq("occurrence", occurrence)
          .eq("recipient_id", userId)
          .is("read_at", null);
      },

      /** Everything this person sent the viewer here counts as read. */
      markRead: async (otherId: string) => {
        const now = new Date().toISOString();
        patch((rows) => rows.map((m) => (m.sender_id === otherId && m.recipient_id === userId && !m.read_at ? { ...m, read_at: now } : m)));
        await getSupabase()
          .from("block_private_messages")
          .update({ read_at: now })
          .eq("block_id", blockId)
          .eq("occurrence", occurrence)
          .eq("sender_id", otherId)
          .eq("recipient_id", userId)
          .is("read_at", null);
      },

      remove: async (messageId: string) => {
        const { error } = await getSupabase().from("block_private_messages").delete().eq("id", messageId);
        if (error) throw explain(error);
        patch((rows) => rows.filter((m) => m.id !== messageId));
      },
    };
  }, [blockId, occurrence, queryClient, userId]);
}
