"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSupabase } from "../supabase/client";
import type { Group, Mutual } from "../types";
import { keys } from "./keys";
import { useSession } from "./session";

/**
 * Connections, mutuals, groups and blocked people.
 *
 * Reads go straight to the tables; row-level security returns only what the
 * viewer may see. Connections are never inserted from here: they are created
 * by the database when something is shared (or via connect_with).
 */

/** Ids of everyone the viewer is connected to. */
export function useConnections() {
  const { userId } = useSession();
  const query = useQuery({
    queryKey: keys.connections,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await getSupabase().from("connections").select("user_a, user_b");
      if (error) throw error;
      return data.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
    },
  });
  return { ...query, connectionIds: query.data ?? EMPTY_IDS };
}
const EMPTY_IDS: string[] = [];

export function useGroups() {
  const query = useQuery({
    queryKey: keys.groups,
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await getSupabase()
        .from("groups")
        .select("id, owner_id, name, created_at, group_members(user_id)")
        .order("name");
      if (error) throw error;
      return data.map(({ group_members, ...group }) => ({
        ...group,
        member_ids: (group_members ?? []).map((m: { user_id: string }) => m.user_id),
      }));
    },
  });
  return { ...query, groups: query.data ?? EMPTY_GROUPS };
}
const EMPTY_GROUPS: Group[] = [];

export function useMutuals() {
  const query = useQuery({
    queryKey: keys.mutuals,
    queryFn: async (): Promise<Mutual[]> => {
      const { data, error } = await getSupabase().rpc("get_mutuals");
      if (error) throw error;
      return data as Mutual[];
    },
  });
  return { ...query, mutuals: query.data ?? EMPTY_MUTUALS };
}
const EMPTY_MUTUALS: Mutual[] = [];

/** Ids of people the viewer has blocked. */
export function useBlocked() {
  const query = useQuery({
    queryKey: keys.blocked,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await getSupabase().from("user_blocks").select("blocked_id");
      if (error) throw error;
      return data.map((row) => row.blocked_id);
    },
  });
  return { ...query, blockedIds: query.data ?? EMPTY_IDS };
}

export function useSocialActions() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMemo(() => {
    /** Anything social changed: refresh everything that depends on who can see whom. */
    const invalidate = () =>
      Promise.all(
        [keys.connections, keys.groups, keys.mutuals, keys.blocked, keys.profiles, keys.blocks].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );

    /** Run the write, then refresh, whether it succeeded or not. */
    const wrap =
      <Args extends unknown[]>(fn: (...args: Args) => Promise<void>) =>
      async (...args: Args) => {
        try {
          await fn(...args);
        } finally {
          await invalidate();
        }
      };

    const supabase = getSupabase();
    return {
      /** "Connect" on a mutual. */
      connectWith: wrap(async (targetId: string) => {
        const { error } = await supabase.rpc("connect_with", { target: targetId });
        if (error) throw error;
      }),

      removeConnection: wrap(async (otherId: string) => {
        const [user_a, user_b] = [userId, otherId].sort();
        const { error } = await supabase.from("connections").delete().match({ user_a, user_b });
        if (error) throw error;
      }),

      blockUser: wrap(async (otherId: string) => {
        const { error } = await supabase.from("user_blocks").insert({ blocker_id: userId, blocked_id: otherId });
        if (error && error.code !== "23505") throw error; // already blocked is fine
      }),

      unblockUser: wrap(async (otherId: string) => {
        const { error } = await supabase.from("user_blocks").delete().match({ blocker_id: userId, blocked_id: otherId });
        if (error) throw error;
      }),

      createGroup: wrap(async (name: string, memberIds: string[]) => {
        const { data, error } = await supabase.from("groups").insert({ name: name.trim() }).select("id").single();
        if (error) throw error;
        if (memberIds.length > 0) {
          const { error: membersError } = await supabase
            .from("group_members")
            .insert(memberIds.map((user_id) => ({ group_id: data.id, user_id })));
          if (membersError) throw membersError;
        }
      }),

      renameGroup: wrap(async (groupId: string, name: string) => {
        const { error } = await supabase.from("groups").update({ name: name.trim() }).eq("id", groupId);
        if (error) throw error;
      }),

      deleteGroup: wrap(async (groupId: string) => {
        const { error } = await supabase.from("groups").delete().eq("id", groupId);
        if (error) throw error;
      }),

      addGroupMembers: wrap(async (groupId: string, memberIds: string[]) => {
        if (memberIds.length === 0) return;
        const { error } = await supabase
          .from("group_members")
          .insert(memberIds.map((user_id) => ({ group_id: groupId, user_id })));
        if (error) throw error;
      }),

      /** Owner removing someone, or a member leaving (pass your own id). */
      removeGroupMember: wrap(async (groupId: string, memberId: string) => {
        const { error } = await supabase.from("group_members").delete().match({ group_id: groupId, user_id: memberId });
        if (error) throw error;
      }),
    };
  }, [queryClient, userId]);
}
