/**
 * Cache keys for server data. Everything fetched from Supabase is cached under
 * one of these, and realtime events invalidate them (see realtime.tsx).
 */
export const keys = {
  profiles: ["profiles"] as const,
  blocks: ["blocks"] as const,
  /** Locations the viewer has used on their own events. */
  places: ["places"] as const,
  /** The viewer's own nicknamed places. */
  savedPlaces: ["saved-places"] as const,
  /** Places the viewer crossed out of "Used before". */
  hiddenPlaces: ["hidden-places"] as const,
  block: (id: string) => ["block", id] as const,
  blockPeople: (id: string) => ["block", id, "people"] as const,
  /** A block's group chat for one week. */
  messages: (blockId: string, occurrence: number) => ["block", blockId, "messages", occurrence] as const,
  /** The viewer's private conversations inside one block and week. */
  blockPrivate: (blockId: string, occurrence: number) => ["block", blockId, "private", occurrence] as const,
  invites: (blockId: string | null) => ["invites", blockId ?? "connect"] as const,
  connections: ["connections"] as const,
  groups: ["groups"] as const,
  mutuals: ["mutuals"] as const,
  blocked: ["blocked"] as const,
  notifications: ["notifications"] as const,
  /** Everything to do with private messages (prefix). */
  dms: ["dm"] as const,
  dmList: ["dm", "list"] as const,
  dmThread: (otherId: string) => ["dm", "thread", otherId] as const,
};
