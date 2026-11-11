/**
 * Shapes of the database rows the app reads and writes. Keep in sync with
 * `supabase/migrations`.
 */

export type BlockType = "free" | "join";
export type AudienceMode = "all_connections" | "custom";
export type RsvpStatus = "in" | "out";

export interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface BlockRow {
  id: string;
  owner_id: string;
  type: BlockType;
  /** UTC instant (ISO 8601). For weekly repeats: the first occurrence. */
  start_at: string;
  end_at: string;
  /** IANA zone the block was created in; anchors weekly repeats to local time. */
  tz: string;
  repeat_weekly: boolean;
  /** Total number of occurrences, or null for "no end". */
  repeat_count: number | null;
  /** Occurrence numbers that were deleted one by one. */
  skipped_occurrences: number[];
  title: string | null;
  emoji: string | null;
  location: string | null;
  description: string | null;
  rsvp_enabled: boolean;
  audience: AudienceMode;
  created_at: string;
  updated_at: string;
}

export interface RsvpRow {
  block_id: string;
  occurrence: number;
  user_id: string;
  status: RsvpStatus;
  updated_at?: string;
}

/** A block as loaded for the calendar: the row plus who answered and who it is shared with. */
export interface CalendarBlock extends BlockRow {
  rsvps: RsvpRow[];
  /** Only populated for the viewer's own blocks (RLS hides other people's lists). */
  shared_user_ids: string[];
  shared_group_ids: string[];
}

export interface Group {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  member_ids: string[];
}

export interface Mutual extends Profile {
  group_names: string[];
}

export interface MessageRow {
  id: string;
  block_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface BlockPerson extends Profile {
  is_host: boolean;
  shared_directly: boolean;
  via_groups: string[];
}

export type NotificationType =
  | "event_shared"
  | "free_shared"
  | "rsvp"
  | "chat"
  | "connected"
  | "group_added"
  | "invite_accepted";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  block_id: string | null;
  group_id: string | null;
  occurrence: number | null;
  data: {
    actor_name?: string;
    block_type?: BlockType;
    title?: string | null;
    emoji?: string | null;
    start_at?: string;
    end_at?: string;
    tz?: string;
    repeat_weekly?: boolean;
    status?: RsvpStatus;
    preview?: string;
    group_name?: string;
  };
  read_at: string | null;
  created_at: string;
}

export interface InviteRow {
  token: string;
  inviter_id: string;
  block_id: string | null;
  occurrence: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** What a signed-out visitor is shown for an invite link. */
export interface InvitePreview {
  kind: "block" | "connect";
  inviter: { name: string; avatar_url: string | null };
  occurrence: number;
  block: {
    type: BlockType;
    title: string | null;
    emoji: string | null;
    description: string | null;
    has_location: boolean;
    start_at: string;
    end_at: string;
    tz: string;
    repeat_weekly: boolean;
  } | null;
}

/** The fields a person fills in when creating or editing a block. */
export interface BlockDraft {
  type: BlockType;
  start_at: string;
  end_at: string;
  tz: string;
  repeat_weekly: boolean;
  title: string | null;
  emoji: string | null;
  location: string | null;
  description: string | null;
  rsvp_enabled: boolean;
  audience: AudienceMode;
  shared_user_ids: string[];
  shared_group_ids: string[];
}
