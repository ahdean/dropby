-- =============================================================================
-- wheet · 9 · A chat in every time block
-- =============================================================================
-- 1. Every block, Free time as well as hosted events, has an open group chat
--    for everyone who can see it. A weekly repeat has one per week (like
--    RSVPs), so the chat table now records which week a message belongs to.
--    Earlier messages belong to the first week.
-- 2. Inside a block, two people can also write privately to each other.
--    These conversations stay with the block (and its week); the separate,
--    permanent private messages between two people are unchanged.
--
-- Only adds things: an older version of the app keeps working with it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The group chat: per week, and for Free time too
-- ---------------------------------------------------------------------------
alter table public.messages
  add column occurrence integer not null default 0 check (occurrence >= 0);

create index messages_block_occurrence_idx on public.messages (block_id, occurrence, created_at);

-- Anyone who can see the block may write, whatever kind of block it is.
drop policy "messages: audience writes" on public.messages;
create policy "messages: audience writes"
  on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_block_id(block_id, (select auth.uid()))
  );

-- New group-chat message: tell the host, everyone who said "I'm in" for that
-- week, and everyone who has written in that week's chat. One unread
-- notification per block, pointing at the latest week written in.
create or replace function private.on_message_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
  _data jsonb;
begin
  select * into _block from public.blocks b where b.id = new.block_id;
  if not found then
    return new;
  end if;

  _data := private.block_snapshot(_block) || jsonb_build_object(
    'actor_name', (select p.name from public.profiles p where p.id = new.user_id),
    'preview', left(new.body, 120));

  insert into public.notifications (user_id, type, actor_id, block_id, occurrence, data)
  select r.user_id, 'chat', new.user_id, _block.id, new.occurrence, _data
  from (
    select _block.owner_id as user_id
    union
    select rs.user_id from public.rsvps rs
    where rs.block_id = _block.id and rs.occurrence = new.occurrence and rs.status = 'in'
    union
    select m.user_id from public.messages m
    where m.block_id = _block.id and m.occurrence = new.occurrence
  ) r
  where r.user_id <> new.user_id
    and not private.is_blocked_pair(r.user_id, new.user_id)
    and private.can_view_block(_block.id, _block.owner_id, _block.audience, r.user_id)
  on conflict (user_id, block_id) where type = 'chat' and read_at is null
  do update set actor_id = excluded.actor_id, occurrence = excluded.occurrence, data = excluded.data, created_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Private messages inside a block
-- ---------------------------------------------------------------------------
create table public.block_private_messages (
  id            uuid primary key default gen_random_uuid(),
  block_id      uuid not null references public.blocks (id) on delete cascade,
  occurrence    integer not null default 0 check (occurrence >= 0),
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint block_private_messages_two_people check (sender_id <> recipient_id)
);
create index block_private_messages_block_idx on public.block_private_messages (block_id, occurrence, created_at);
create index block_private_messages_unread_idx on public.block_private_messages (recipient_id) where read_at is null;

-- Someone visibly taking part in a block: its host, people it was shared with
-- by name or through a group, and anyone who answered or wrote in its chat.
create function private.is_in_block(_block_id uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.blocks b where b.id = _block_id and b.owner_id = _user)
      or exists (select 1 from public.block_user_shares s where s.block_id = _block_id and s.user_id = _user)
      or exists (
        select 1 from public.block_group_shares gs
        join public.group_members gm on gm.group_id = gs.group_id
        where gs.block_id = _block_id and gm.user_id = _user)
      or exists (select 1 from public.rsvps r where r.block_id = _block_id and r.user_id = _user)
      or exists (select 1 from public.messages m where m.block_id = _block_id and m.user_id = _user);
$$;

-- May _sender write privately to _recipient inside this block? Both must be
-- able to see the block and not have blocked each other. And so that nobody
-- can message strangers who merely happen to see the same block, the
-- recipient must be taking part in it (see above), or have written privately
-- to the sender in this block first. The host may write to anyone who can
-- see their block.
create function private.can_private_message(_block_id uuid, _sender uuid, _recipient uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select _sender is not null and _recipient is not null and _sender <> _recipient
    and private.can_view_block_id(_block_id, _sender)
    and private.can_view_block_id(_block_id, _recipient)
    and not private.is_blocked_pair(_sender, _recipient)
    and (
      private.owns_block(_block_id, _sender)
      or private.is_in_block(_block_id, _recipient)
      or exists (
        select 1 from public.block_private_messages m
        where m.block_id = _block_id and m.sender_id = _recipient and m.recipient_id = _sender)
    );
$$;

revoke execute on function private.is_in_block(uuid, uuid) from public, anon;
revoke execute on function private.can_private_message(uuid, uuid, uuid) from public, anon;
grant execute on function private.is_in_block(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_private_message(uuid, uuid, uuid) to authenticated, service_role;

alter table public.block_private_messages enable row level security;

revoke all on public.block_private_messages from anon, authenticated;
grant select, insert, delete on public.block_private_messages to authenticated;
grant update (read_at)       on public.block_private_messages to authenticated;
grant all                    on public.block_private_messages to service_role;

-- Only the two people in a conversation can read it, and only while they can see the block.
create policy "block_private_messages: the two people read"
  on public.block_private_messages for select to authenticated
  using (
    (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
    and private.can_view_block_id(block_id, (select auth.uid()))
  );

create policy "block_private_messages: sender writes"
  on public.block_private_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and read_at is null
    and private.can_private_message(block_id, (select auth.uid()), recipient_id)
  );

create policy "block_private_messages: recipient marks read"
  on public.block_private_messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "block_private_messages: sender deletes"
  on public.block_private_messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- The bell: one unread notification per person per block.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'event_shared', 'free_shared', 'rsvp', 'chat', 'connected', 'group_added', 'invite_accepted',
  'dm',       -- someone sent you a permanent private message (coalesced per person)
  'block_dm'  -- someone wrote to you privately inside a block (coalesced per person and block)
));

create unique index notifications_block_dm_uniq
  on public.notifications (user_id, block_id, actor_id) where type = 'block_dm' and read_at is null;

create function private.on_block_private_message_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
begin
  select * into _block from public.blocks b where b.id = new.block_id;
  if not found then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, block_id, occurrence, data)
  values (
    new.recipient_id, 'block_dm', new.sender_id, _block.id, new.occurrence,
    private.block_snapshot(_block) || jsonb_build_object(
      'actor_name', (select p.name from public.profiles p where p.id = new.sender_id),
      'preview', left(new.body, 120))
  )
  on conflict (user_id, block_id, actor_id) where type = 'block_dm' and read_at is null
  do update set occurrence = excluded.occurrence, data = excluded.data, created_at = now();
  return new;
end;
$$;

create trigger block_private_messages_after_insert after insert on public.block_private_messages
  for each row execute function private.on_block_private_message_inserted();

revoke execute on function private.on_block_private_message_inserted() from public, anon;

-- Live updates (Realtime applies the read rule above to every subscriber).
alter publication supabase_realtime add table public.block_private_messages;
