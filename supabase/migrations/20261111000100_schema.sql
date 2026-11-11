-- =============================================================================
-- dropby · 1/5 · Tables
-- =============================================================================
-- Conventions
--   * Every timestamp is `timestamptz` (stored in UTC). The app converts to the
--     viewer's time zone for display.
--   * `private` holds helper and trigger functions. It is NOT exposed through
--     the Supabase Data API, so clients cannot call those functions directly.
--   * Row-level security lives in 3/5. Nothing in this file grants access.
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.block_type as enum ('free', 'join');
create type public.audience_mode as enum ('all_connections', 'custom');
create type public.rsvp_status as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Name is the only required field.
-- The phone number is deliberately NOT copied here; it stays in auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 60),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is
  'Public-facing profile. Visible to the user, their connections and their mutuals.';

-- ---------------------------------------------------------------------------
-- connections: undirected edge between two users, stored once (user_a < user_b).
-- Rows are only ever created by trusted functions (sharing, invite links,
-- "connect" on a mutual). Either side may delete the row.
-- ---------------------------------------------------------------------------
create table public.connections (
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint connections_ordered check (user_a < user_b)
);
create index connections_user_b_idx on public.connections (user_b);

-- ---------------------------------------------------------------------------
-- user_blocks: "block this person". Directional, private to the blocker, and
-- it hides everything in both directions.
-- (Named user_blocks to avoid confusion with calendar `blocks`.)
-- ---------------------------------------------------------------------------
create table public.user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- groups + group_members: named sets of people ("Climbing crew").
-- The owner is always a member. Any member can share a block with the group.
-- Two people in the same group who are not connected are "mutuals".
-- ---------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);
create index groups_owner_idx on public.groups (owner_id);

create table public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- blocks: a stretch of time on someone's calendar.
--   type = 'free'  → "I'm available"            (blue)
--   type = 'join'  → "I'm hosting, join me"     (green; needs an emoji)
-- "Locked in" (gold) is not stored: it is derived from RSVPs.
--
-- Weekly repeats are stored as ONE row. Occurrence n (0, 1, 2 …) starts at the
-- same local wall-clock time, n weeks after start_at, in the zone `tz`. That
-- keeps "every Tuesday 6 PM" at 6 PM across daylight-saving changes.
--   repeat_count          → total occurrences (null = no end)
--   skipped_occurrences   → occurrence numbers deleted individually
-- ---------------------------------------------------------------------------
create table public.blocks (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type                 public.block_type not null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  tz                   text not null default 'UTC' check (char_length(tz) between 1 and 64),
  repeat_weekly        boolean not null default false,
  repeat_count         integer check (repeat_count is null or repeat_count > 0),
  skipped_occurrences  integer[] not null default '{}',
  title                text check (title is null or char_length(title) <= 80),
  emoji                text check (emoji is null or char_length(emoji) <= 16),
  location             text check (location is null or char_length(location) <= 200),
  description          text check (description is null or char_length(description) <= 2000),
  rsvp_enabled         boolean not null default true,
  audience             public.audience_mode not null default 'all_connections',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint blocks_time_order check (end_at > start_at),
  constraint blocks_max_length check (end_at - start_at <= interval '24 hours'),
  constraint blocks_join_needs_emoji check (type <> 'join' or (emoji is not null and char_length(btrim(emoji)) > 0)),
  constraint blocks_repeat_count_needs_repeat check (repeat_count is null or repeat_weekly)
);
create index blocks_owner_idx on public.blocks (owner_id);
create index blocks_time_idx on public.blocks (start_at, end_at);
create index blocks_repeat_idx on public.blocks (repeat_weekly) where repeat_weekly;

-- ---------------------------------------------------------------------------
-- Audience of a block. A block is visible to someone when ANY of these holds:
--   * blocks.audience = 'all_connections' and they are connected to the owner
--   * a row in block_user_shares names them
--   * a row in block_group_shares names a group they belong to
-- ---------------------------------------------------------------------------
create table public.block_user_shares (
  block_id    uuid not null references public.blocks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (block_id, user_id)
);
create index block_user_shares_user_idx on public.block_user_shares (user_id);

create table public.block_group_shares (
  block_id    uuid not null references public.blocks (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (block_id, group_id)
);
create index block_group_shares_group_idx on public.block_group_shares (group_id);

-- ---------------------------------------------------------------------------
-- rsvps: "I'm in" / "Can't make it" on a hosted (join) block.
-- `occurrence` is 0 for one-off blocks and the week number for weekly repeats,
-- so an RSVP follows its occurrence even if the host moves the series.
-- ---------------------------------------------------------------------------
create table public.rsvps (
  block_id    uuid not null references public.blocks (id) on delete cascade,
  occurrence  integer not null default 0 check (occurrence >= 0),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status      public.rsvp_status not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (block_id, occurrence, user_id)
);
create index rsvps_user_idx on public.rsvps (user_id);

-- ---------------------------------------------------------------------------
-- messages: the chat inside a hosted event. One thread per block.
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index messages_block_idx on public.messages (block_id, created_at);

-- ---------------------------------------------------------------------------
-- invites: unguessable links sent by text message to people who may not be on
-- the app yet. block_id = null means "just connect with me".
-- Opening the link shows a public preview; signing in from it connects the
-- two people (see redeem_invite in 4/5).
-- ---------------------------------------------------------------------------
create table public.invites (
  token       text primary key check (char_length(token) between 8 and 64),
  inviter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  block_id    uuid references public.blocks (id) on delete cascade,
  occurrence  integer not null default 0 check (occurrence >= 0),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  revoked_at  timestamptz
);
create index invites_inviter_idx on public.invites (inviter_id);
create index invites_block_idx on public.invites (block_id);

create table public.invite_redemptions (
  token       text not null references public.invites (token) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (token, user_id)
);

-- ---------------------------------------------------------------------------
-- notifications: the bell. Rows are written only by trigger functions.
-- `data` carries a small snapshot (names, title, time) so a notification can be
-- rendered without further lookups.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in (
                'event_shared',     -- someone shared a hosted event with you
                'free_shared',      -- someone shared free time with you (coalesced per person)
                'rsvp',             -- a guest answered your event
                'chat',             -- new chat messages in an event (coalesced per event)
                'connected',        -- someone connected with you
                'group_added',      -- you were added to a group
                'invite_accepted'   -- someone joined from your invite link
              )),
  actor_id    uuid references public.profiles (id) on delete cascade,
  block_id    uuid references public.blocks (id) on delete cascade,
  group_id    uuid references public.groups (id) on delete cascade,
  occurrence  integer,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- De-duplication rules, used by `insert … on conflict` in the trigger functions.
create unique index notifications_event_shared_uniq
  on public.notifications (user_id, block_id) where type = 'event_shared';
create unique index notifications_free_shared_uniq
  on public.notifications (user_id, actor_id) where type = 'free_shared' and read_at is null;
create unique index notifications_chat_uniq
  on public.notifications (user_id, block_id) where type = 'chat' and read_at is null;
create unique index notifications_rsvp_uniq
  on public.notifications (user_id, block_id, occurrence, actor_id) where type = 'rsvp';
create unique index notifications_connected_uniq
  on public.notifications (user_id, actor_id) where type = 'connected' and read_at is null;
create unique index notifications_group_added_uniq
  on public.notifications (user_id, group_id) where type = 'group_added';
