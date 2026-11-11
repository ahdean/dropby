"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSupabase } from "../supabase/client";
import type { BlockPerson, InviteRow, MessageRow } from "../types";
import { keys } from "./keys";

/**
 * Data for an event page: who is involved, the chat, and invite links.
 */

interface BlockPersonRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  is_host: boolean;
  shared_directly: boolean;
  via_groups: string[];
}

/** Names and avatars of the host, invitees named individually or via groups, and anyone who answered or chatted. */
export function useBlockPeople(blockId: string) {
  return useQuery({
    queryKey: keys.blockPeople(blockId),
    queryFn: async (): Promise<BlockPerson[]> => {
      const { data, error } = await getSupabase().rpc("get_block_people", { _block_id: blockId });
      if (error) throw error;
      return (data as BlockPersonRow[]).map(({ user_id, ...rest }) => ({ id: user_id, ...rest }));
    },
  });
}

/** The chat thread of an event, kept live while the page is open. */
export function useMessages(blockId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.messages(blockId),
    enabled,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await getSupabase()
        .from("messages")
        .select("id, block_id, user_id, body, created_at")
        .eq("block_id", blockId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`messages:${blockId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `block_id=eq.${blockId}` },
        (payload) => {
          const message = payload.new as MessageRow;
          queryClient.setQueryData<MessageRow[]>(keys.messages(blockId), (old) =>
            !old || old.some((m) => m.id === message.id) ? old : [...old, message],
          );
          // A new author may not be in the people list yet.
          queryClient.invalidateQueries({ queryKey: keys.blockPeople(blockId) });
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (!id) return;
        queryClient.setQueryData<MessageRow[]>(keys.messages(blockId), (old) => old?.filter((m) => m.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [blockId, enabled, queryClient]);

  return query;
}

export function useMessageActions(blockId: string, userId: string) {
  const queryClient = useQueryClient();
  return {
    send: async (body: string) => {
      const id = crypto.randomUUID();
      const message: MessageRow = { id, block_id: blockId, user_id: userId, body, created_at: new Date().toISOString() };
      queryClient.setQueryData<MessageRow[]>(keys.messages(blockId), (old) => [...(old ?? []), message]);
      const { error } = await getSupabase().from("messages").insert({ id, block_id: blockId, body });
      if (error) {
        queryClient.setQueryData<MessageRow[]>(keys.messages(blockId), (old) => old?.filter((m) => m.id !== id));
        throw error;
      }
    },
    remove: async (messageId: string) => {
      const { error } = await getSupabase().from("messages").delete().eq("id", messageId);
      if (error) throw error;
      queryClient.setQueryData<MessageRow[]>(keys.messages(blockId), (old) => old?.filter((m) => m.id !== messageId));
    },
  };
}

// ---------------------------------------------------------------------------
// Invite links
// ---------------------------------------------------------------------------

/**
 * Create a fresh, unguessable link. `blockId = null` makes a plain
 * "connect with me" link that is not tied to an event.
 */
export async function createInvite(blockId: string | null, occurrence = 0): Promise<string> {
  const { data, error } = await getSupabase()
    .from("invites")
    .insert({ block_id: blockId, occurrence })
    .select("token")
    .single();
  if (error) throw error;
  return data.token;
}

/** Links the viewer created for a block (or their connect-only links) that still work. */
export function useInvites(blockId: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.invites(blockId),
    enabled,
    queryFn: async (): Promise<InviteRow[]> => {
      let request = getSupabase()
        .from("invites")
        .select("token, inviter_id, block_id, occurrence, created_at, expires_at, revoked_at")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      request = blockId ? request.eq("block_id", blockId) : request.is("block_id", null);
      const { data, error } = await request;
      if (error) throw error;
      return data;
    },
  });
}

export async function revokeInvite(token: string): Promise<void> {
  const { error } = await getSupabase().from("invites").update({ revoked_at: new Date().toISOString() }).eq("token", token);
  if (error) throw error;
}

export interface RedeemResult {
  kind: "block" | "connect";
  block_id: string | null;
  block_type: "free" | "join" | null;
  occurrence: number;
  inviter_id: string;
}

/** Called after signing in from an invite link: connects the two people. */
export async function redeemInvite(token: string): Promise<RedeemResult> {
  const { data, error } = await getSupabase().rpc("redeem_invite", { _token: token });
  if (error) throw error;
  return data as RedeemResult;
}
