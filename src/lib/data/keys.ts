/**
 * Cache keys for server data. Everything fetched from Supabase is cached under
 * one of these, and realtime events invalidate them (see realtime.tsx).
 */
export const keys = {
  profiles: ["profiles"] as const,
  blocks: ["blocks"] as const,
  block: (id: string) => ["block", id] as const,
  blockPeople: (id: string) => ["block", id, "people"] as const,
  messages: (blockId: string) => ["block", blockId, "messages"] as const,
  invites: (blockId: string | null) => ["invites", blockId ?? "connect"] as const,
  connections: ["connections"] as const,
  groups: ["groups"] as const,
  mutuals: ["mutuals"] as const,
  blocked: ["blocked"] as const,
  notifications: ["notifications"] as const,
};
