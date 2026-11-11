"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "../supabase/client";
import type { NotificationRow } from "../types";
import { keys } from "./keys";

/** The bell: the most recent notifications, newest first. */
export function useNotifications() {
  const query = useQuery({
    queryKey: keys.notifications,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await getSupabase()
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const notifications = query.data ?? EMPTY;
  return { ...query, notifications, unreadCount: notifications.filter((n) => !n.read_at).length };
}
const EMPTY: NotificationRow[] = [];

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const patch = (update: (list: NotificationRow[]) => NotificationRow[]) =>
    queryClient.setQueryData<NotificationRow[]>(keys.notifications, (old) => (old ? update(old) : old));
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.notifications });

  return {
    markRead: async (id: string) => {
      const now = new Date().toISOString();
      patch((list) => list.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
      await getSupabase().from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null);
    },
    markAllRead: async () => {
      const now = new Date().toISOString();
      patch((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
      await getSupabase().from("notifications").update({ read_at: now }).is("read_at", null);
      await refresh();
    },
    clearAll: async () => {
      patch(() => []);
      // Row-level security limits this to the viewer's own notifications.
      await getSupabase().from("notifications").delete().not("id", "is", null);
      await refresh();
    },
  };
}
