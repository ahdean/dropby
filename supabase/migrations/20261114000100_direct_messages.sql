-- =============================================================================
-- dropby · 6 · Private messages
-- =============================================================================
-- One private conversation per pair of people. A message can quote a block
-- ("about your Free time on Tuesday"), so the other person knows what it is
-- about without the message going to the whole group.
--
-- Rules, enforced here in the database:
--   * only the two people in a conversation can read it
--   * you can only message your connections, and nobody you are in a blocked
--     pair with
--   * a quoted block must be visible to both people, and the quote is written
--     by the database from the real block, so it cannot be forged
-- =============================================================================

create table public.direct_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  -- The block this message is about, if any, and which week of a weekly repeat.
  block_id      uuid references public.blocks (id) on delete set null,
  occurrence    integer not null default 0 check (occurrence >= 0),
  -- A snapshot of that block (title, icon, time), so the quote still reads
  -- after the block is changed or deleted. Filled in by a trigger.
  quote         jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

-- A conversation is "all messages between these two people", whichever way round.
create index direct_messages_pair_idx
  on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index direct_messages_unread_idx
  on public.direct_messages (recipient_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Who may message whom: connections only, never across a block.
-- ---------------------------------------------------------------------------
create function private.can_message(sender uuid, recipient uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select sender is not null
     and recipient is not null
     and sender <> recipient
     and not private.is_blocked_pair(sender, recipient)
     and private.are_connected(sender, recipient);
$$;

-- ---------------------------------------------------------------------------
-- Before a message is stored: the database, not the sender, decides the
-- timestamps and writes the quote.
-- ---------------------------------------------------------------------------
create function private.on_direct_message_inserting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
  _start timestamptz;
  _end timestamptz;
begin
  new.created_at := now();
  new.read_at := null;

  if new.block_id is null then
    new.occurrence := 0;
    new.quote := null;
    return new;
  end if;

  select * into _block from public.blocks b where b.id = new.block_id;
  if not found then
    new.block_id := null;
    new.occurrence := 0;
    new.quote := null;
    return new;
  end if;

  if not _block.repeat_weekly then
    new.occurrence := 0;
  end if;

  -- The quoted week of a weekly repeat, at the same local time in the block's zone.
  begin
    _start := ((_block.start_at at time zone _block.tz) + make_interval(days => 7 * new.occurrence)) at time zone _block.tz;
    _end   := ((_block.end_at   at time zone _block.tz) + make_interval(days => 7 * new.occurrence)) at time zone _block.tz;
  exception when others then
    -- Unknown zone name: fall back to plain 7-day steps.
    _start := _block.start_at + make_interval(days => 7 * new.occurrence);
    _end   := _block.end_at   + make_interval(days => 7 * new.occurrence);
  end;

  new.quote := jsonb_build_object(
    'owner_id',   _block.owner_id,
    'owner_name', (select p.name from public.profiles p where p.id = _block.owner_id),
    'block_type', _block.type,
    'title',      _block.title,
    'emoji',      _block.emoji,
    'start_at',   _start,
    'end_at',     _end
  );
  return new;
end;
$$;

create trigger direct_messages_before_insert before insert on public.direct_messages
  for each row execute function private.on_direct_message_inserting();

-- ---------------------------------------------------------------------------
-- The bell: one unread notification per person who wrote to you.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'event_shared', 'free_shared', 'rsvp', 'chat', 'connected', 'group_added', 'invite_accepted',
  'dm'  -- someone sent you a private message (coalesced per person)
));

create unique index notifications_dm_uniq
  on public.notifications (user_id, actor_id) where type = 'dm' and read_at is null;

create function private.on_direct_message_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, actor_id, data)
  values (
    new.recipient_id, 'dm', new.sender_id,
    jsonb_build_object(
      'actor_name', (select p.name from public.profiles p where p.id = new.sender_id),
      'preview', left(new.body, 120))
  )
  on conflict (user_id, actor_id) where type = 'dm' and read_at is null
  do update set data = excluded.data, created_at = now();
  return new;
end;
$$;

create trigger direct_messages_after_insert after insert on public.direct_messages
  for each row execute function private.on_direct_message_inserted();

-- Reading the messages also clears the bell for that person.
create function private.on_direct_message_read()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.read_at is not null and old.read_at is null then
    update public.notifications n
    set read_at = now()
    where n.user_id = new.recipient_id and n.actor_id = new.sender_id
      and n.type = 'dm' and n.read_at is null;
  end if;
  return new;
end;
$$;

create trigger direct_messages_after_read after update on public.direct_messages
  for each row execute function private.on_direct_message_read();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.direct_messages enable row level security;

revoke all on public.direct_messages from anon, authenticated;
grant select, insert, delete on public.direct_messages to authenticated;
grant update (read_at)      on public.direct_messages to authenticated;
grant all                   on public.direct_messages to service_role;

revoke execute on function private.can_message(uuid, uuid)        from public, anon;
revoke execute on function private.on_direct_message_inserting()  from public, anon;
revoke execute on function private.on_direct_message_inserted()   from public, anon;
revoke execute on function private.on_direct_message_read()       from public, anon;
grant  execute on function private.can_message(uuid, uuid)        to authenticated, service_role;

create policy "direct_messages: the two people read"
  on public.direct_messages for select to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and not private.is_blocked_pair(sender_id, recipient_id)
  );

create policy "direct_messages: write to a connection, as yourself"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.can_message((select auth.uid()), recipient_id)
    and (
      block_id is null
      or (
        private.can_view_block_id(block_id, (select auth.uid()))
        and private.can_view_block_id(block_id, recipient_id)
      )
    )
  );

create policy "direct_messages: recipient marks read"
  on public.direct_messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "direct_messages: sender deletes own"
  on public.direct_messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Live delivery (row-level security still decides who receives what).
alter publication supabase_realtime add table public.direct_messages;
