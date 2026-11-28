/**
 * Shapes of the database rows the app reads and writes. Keep in sync with
 * `supabase/migrations`.
 */
import type { BlockIdea } from "./activities";

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
  /**
   * Path of the event's picture in the "event-pictures" bucket, or null.
   * (Missing altogether until the database file that adds it has been run.)
   */
  picture_path?: string | null;
  /**
   * Ideas of what to do, on Free time (see lib/activities.ts). Missing until
   * the database file that adds activities has been run.
   */
  ideas?: unknown;
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

/** A message in a block's open group chat. */
export interface MessageRow {
  id: string;
  block_id: string;
  /** Which week of a weekly repeat (0 for a one-off). Missing before the block-chats database file is run. */
  occurrence?: number;
  user_id: string;
  body: string;
  created_at: string;
}

/** A private message between two people inside one block (and week). */
export interface BlockPrivateMessage {
  id: string;
  block_id: string;
  occurrence: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
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
  | "invite_accepted"
  | "dm"
  | "block_dm"
  | "idea_vote";

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
    /** idea_vote: the icon of the idea that was picked. */
    idea_emoji?: string | null;
  };
  read_at: string | null;
  created_at: string;
}

/** A place the viewer saved, with a nickname. Private to them. */
export interface SavedPlace {
  id: string;
  /** The nickname, e.g. "Home". */
  name: string;
  /** What is put into an event's "Where" field. */
  address: string;
  /** Its type ("House", "Park", or one of the person's own); null or missing: none. */
  kind?: string | null;
}

/** One of a person's activities ("Brunch"), with where it happens. Private to them. */
export interface Activity {
  id: string;
  name: string;
  /** Its icon(s), stored like an event's (lib/event-icon.ts). */
  emoji: string | null;
  /** The kinds of place it happens in ("House", "Park"). Empty: anywhere. */
  place_kinds: string[];
  /** Favourite spots for it: ids of the person's saved places. */
  place_ids: string[];
  /** Its section ("food", "home"…; see lib/activities.ts). Missing until the sections database file is run. */
  category?: string | null;
}

/** Someone saying "I'm up for this" to an idea on a block of Free time. */
export interface IdeaVote {
  block_id: string;
  occurrence: number;
  idea_id: string;
  user_id: string;
}

/** What a private message quotes: a snapshot of a block, written by the database. */
export interface MessageQuote {
  owner_id: string;
  owner_name: string | null;
  block_type: BlockType;
  title: string | null;
  emoji: string | null;
  start_at: string;
  end_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  /** Null when there is no quote, or the quoted block has since been deleted. */
  block_id: string | null;
  occurrence: number;
  quote: MessageQuote | null;
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
    picture_path?: string | null;
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
  /** The event's picture. Left out (undefined) to leave it as it is. */
  picture_path?: string | null;
  /** Ideas on Free time. Left out (undefined) to leave them as they are. */
  ideas?: BlockIdea[];
  rsvp_enabled: boolean;
  audience: AudienceMode;
  shared_user_ids: string[];
  shared_group_ids: string[];
}
