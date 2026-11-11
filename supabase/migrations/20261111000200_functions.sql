-- =============================================================================
-- dropby · 2/5 · Private helper functions and triggers
-- =============================================================================
-- Everything here is `security definer` (runs with the table owner's rights) so
-- that row-level-security policies can ask questions such as "are these two
-- people connected?" without the policies recursing into each other.
--
-- They live in the `private` schema, which the Data API does not expose, so a
-- client can never call them with arbitrary arguments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Relationship predicates
-- ---------------------------------------------------------------------------

-- True when either person has blocked the other.
create function private.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

create function private.are_connected(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.user_a = least(a, b) and c.user_b = greatest(a, b)
  );
$$;

create function private.is_group_member(_group uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = _group and gm.user_id = _user
  );
$$;

create function private.is_group_owner(_group uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = _group and g.owner_id = _user
  );
$$;

-- "Mutual" test: the two people belong to at least one common group.
create function private.share_group(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select a <> b and exists (
    select 1
    from public.group_members x
    join public.group_members y on y.group_id = x.group_id
    where x.user_id = a and y.user_id = b
  );
$$;

-- Who may `sharer` put on a block's audience list? Connections and mutuals.
create function private.can_share_with(sharer uuid, target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select sharer is not null
     and target is not null
     and sharer <> target
     and not private.is_blocked_pair(sharer, target)
     and (private.are_connected(sharer, target) or private.share_group(sharer, target));
$$;

-- ---------------------------------------------------------------------------
-- THE visibility rule. Every policy that protects a block (or anything hanging
-- off a block: RSVPs, chat, share rows) goes through this one function.
-- ---------------------------------------------------------------------------
create function private.can_view_block(
  _block_id uuid,
  _owner    uuid,
  _audience public.audience_mode,
  _viewer   uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select _viewer is not null and (
    _owner = _viewer
    or (
      not private.is_blocked_pair(_owner, _viewer)
      and (
        (_audience = 'all_connections' and private.are_connected(_owner, _viewer))
        or exists (
          select 1 from public.block_user_shares s
          where s.block_id = _block_id and s.user_id = _viewer
        )
        or exists (
          select 1
          from public.block_group_shares gs
          join public.group_members gm on gm.group_id = gs.group_id
          where gs.block_id = _block_id and gm.user_id = _viewer
        )
      )
    )
  );
$$;

-- Convenience wrapper for child tables that only know the block id.
create function private.can_view_block_id(_block_id uuid, _viewer uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_block(b.id, b.owner_id, b.audience, _viewer)
    from public.blocks b where b.id = _block_id
  ), false);
$$;

create function private.owns_block(_block_id uuid, _user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b where b.id = _block_id and b.owner_id = _user
  );
$$;

-- Hosted events are the only blocks with RSVPs and chat.
create function private.block_accepts(_block_id uuid, _what text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where b.id = _block_id
      and b.type = 'join'
      and (_what <> 'rsvp' or b.rsvp_enabled)
  );
$$;

-- Everyone a block is currently shared with (never includes the owner or
-- anyone in a blocked pair with the owner).
create function private.block_audience(_block_id uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with b as (
    select id, owner_id, audience from public.blocks where id = _block_id
  ),
  everyone as (
    select case when c.user_a = b.owner_id then c.user_b else c.user_a end as user_id
    from b
    join public.connections c on b.owner_id in (c.user_a, c.user_b)
    where b.audience = 'all_connections'
    union
    select s.user_id from public.block_user_shares s where s.block_id = _block_id
    union
    select gm.user_id
    from public.block_group_shares gs
    join public.group_members gm on gm.group_id = gs.group_id
    where gs.block_id = _block_id
  )
  select e.user_id
  from everyone e, b
  where e.user_id <> b.owner_id
    and not private.is_blocked_pair(e.user_id, b.owner_id);
$$;

-- ---------------------------------------------------------------------------
-- Small utilities
-- ---------------------------------------------------------------------------

-- Random URL-safe token without look-alike characters (no 0/O, 1/l/I).
create function private.gen_token(len integer default 12)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := ''::bytea;
  result text := '';
begin
  -- Bytes 10–16 of a v4 UUID are fully random; collect enough of them.
  while octet_length(bytes) < len loop
    bytes := bytes || substring(uuid_send(gen_random_uuid()) from 10 for 7);
  end loop;
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return result;
end;
$$;

alter table public.invites alter column token set default private.gen_token(12);

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger blocks_touch before update on public.blocks
  for each row execute function private.touch_updated_at();
create trigger rsvps_touch before update on public.rsvps
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

-- Create the edge between two people. Returns true only if it is new.
create function private.connect(a uuid, b uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  inserted integer;
begin
  if a is null or b is null or a = b or private.is_blocked_pair(a, b) then
    return false;
  end if;
  insert into public.connections (user_a, user_b)
  values (least(a, b), greatest(a, b))
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- Remove RSVPs left behind by people who can no longer see the block, so the
-- "who's in" list and the gold "locked in" state never count them.
create function private.prune_rsvps_for_block(_block_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.rsvps r
  using public.blocks b
  where r.block_id = _block_id
    and b.id = r.block_id
    and not private.can_view_block(b.id, b.owner_id, b.audience, r.user_id);
$$;

create function private.prune_rsvps_for_user(_user uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.rsvps r
  using public.blocks b
  where r.user_id = _user
    and b.id = r.block_id
    and not private.can_view_block(b.id, b.owner_id, b.audience, r.user_id);
$$;

-- Undo everything two people shared directly with each other. Used when a
-- connection is removed and when one blocks the other.
create function private.sever(a uuid, b uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- blocks shared person-to-person
  delete from public.block_user_shares s
  using public.blocks bl
  where s.block_id = bl.id
    and ((bl.owner_id = a and s.user_id = b) or (bl.owner_id = b and s.user_id = a));

  -- membership of each other's own groups
  delete from public.group_members gm
  using public.groups g
  where gm.group_id = g.id
    and ((g.owner_id = a and gm.user_id = b) or (g.owner_id = b and gm.user_id = a));

  perform private.prune_rsvps_for_user(a);
  perform private.prune_rsvps_for_user(b);
end;
$$;

create function private.on_connection_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.sever(old.user_a, old.user_b);
  return old;
end;
$$;

create trigger connections_after_delete after delete on public.connections
  for each row execute function private.on_connection_deleted();

create function private.on_user_blocked()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.connections c
  where c.user_a = least(new.blocker_id, new.blocked_id)
    and c.user_b = greatest(new.blocker_id, new.blocked_id);
  -- sever() also runs from the connection trigger, but the two may never have
  -- been connected (e.g. mutuals), so run it unconditionally.
  perform private.sever(new.blocker_id, new.blocked_id);

  delete from public.notifications n
  where (n.user_id = new.blocker_id and n.actor_id = new.blocked_id)
     or (n.user_id = new.blocked_id and n.actor_id = new.blocker_id);
  return new;
end;
$$;

create trigger user_blocks_after_insert after insert on public.user_blocks
  for each row execute function private.on_user_blocked();

-- ---------------------------------------------------------------------------
-- Profiles: created automatically when someone signs up.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(left(btrim(new.raw_user_meta_data ->> 'name'), 60), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create function private.block_snapshot(_block public.blocks)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'actor_name',    (select p.name from public.profiles p where p.id = _block.owner_id),
    'block_type',    _block.type,
    'title',         _block.title,
    'emoji',         _block.emoji,
    'start_at',      _block.start_at,
    'end_at',        _block.end_at,
    'tz',            _block.tz,
    'repeat_weekly', _block.repeat_weekly
  );
$$;

-- Tell one person that a block was shared with them.
--   hosted event → one notification per event, never repeated
--   free time    → a single unread notification per friend, refreshed in place
create function private.notify_block_shared(_block public.blocks, _user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if _user is null or _user = _block.owner_id
     or private.is_blocked_pair(_user, _block.owner_id) then
    return;
  end if;

  if _block.type = 'join' then
    insert into public.notifications (user_id, type, actor_id, block_id, data)
    values (_user, 'event_shared', _block.owner_id, _block.id, private.block_snapshot(_block))
    on conflict (user_id, block_id) where type = 'event_shared' do nothing;
  else
    insert into public.notifications (user_id, type, actor_id, block_id, data)
    values (_user, 'free_shared', _block.owner_id, _block.id, private.block_snapshot(_block))
    on conflict (user_id, actor_id) where type = 'free_shared' and read_at is null
    do update set block_id = excluded.block_id, data = excluded.data, created_at = now();
  end if;
end;
$$;

create function private.notify_block_audience(_block public.blocks)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _user uuid;
begin
  for _user in select private.block_audience(_block.id) loop
    perform private.notify_block_shared(_block, _user);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Block triggers
-- ---------------------------------------------------------------------------

create function private.on_block_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.audience = 'all_connections' then
    perform private.notify_block_audience(new);
  end if;
  return new;
end;
$$;

create trigger blocks_after_insert after insert on public.blocks
  for each row execute function private.on_block_inserted();

create function private.on_block_updated()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.audience is distinct from old.audience then
    if new.audience = 'all_connections' then
      perform private.notify_block_audience(new);
    else
      -- narrowed to a custom list: people may have lost access
      perform private.prune_rsvps_for_block(new.id);
    end if;
  end if;

  if new.type is distinct from old.type then
    if new.type = 'join' then
      -- free time became a hosted event: that is worth an invitation
      perform private.notify_block_audience(new);
    else
      -- no longer an event: RSVPs and the "you're invited" notices are moot
      delete from public.rsvps r where r.block_id = new.id;
      delete from public.notifications n
      where n.block_id = new.id and n.type in ('event_shared', 'rsvp', 'chat');
    end if;
  end if;
  return new;
end;
$$;

create trigger blocks_after_update after update on public.blocks
  for each row execute function private.on_block_updated();

-- Sharing with a person: connects the two and notifies the recipient.
create function private.on_user_share_inserted()
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
  perform private.connect(_block.owner_id, new.user_id);
  perform private.notify_block_shared(_block, new.user_id);
  return new;
end;
$$;

create trigger block_user_shares_after_insert after insert on public.block_user_shares
  for each row execute function private.on_user_share_inserted();

-- Sharing with a group: the sharer becomes connected to every member (they
-- have now "shared an event with" each of them) and each member is notified.
create function private.on_group_share_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
  _member uuid;
begin
  select * into _block from public.blocks b where b.id = new.block_id;
  if not found then
    return new;
  end if;
  for _member in
    select gm.user_id from public.group_members gm
    where gm.group_id = new.group_id and gm.user_id <> _block.owner_id
  loop
    perform private.connect(_block.owner_id, _member);
    perform private.notify_block_shared(_block, _member);
  end loop;
  return new;
end;
$$;

create trigger block_group_shares_after_insert after insert on public.block_group_shares
  for each row execute function private.on_group_share_inserted();

create function private.on_share_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.prune_rsvps_for_block(old.block_id);
  return old;
end;
$$;

create trigger block_user_shares_after_delete after delete on public.block_user_shares
  for each row execute function private.on_share_deleted();
create trigger block_group_shares_after_delete after delete on public.block_group_shares
  for each row execute function private.on_share_deleted();

-- ---------------------------------------------------------------------------
-- Group triggers
-- ---------------------------------------------------------------------------

-- The owner is always a member of their own group.
create function private.on_group_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id)
  values (new.id, new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger groups_after_insert after insert on public.groups
  for each row execute function private.on_group_inserted();

create function private.on_group_member_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _group public.groups;
  _sharer uuid;
begin
  select * into _group from public.groups g where g.id = new.group_id;
  if not found or new.user_id = _group.owner_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, group_id, data)
  select new.user_id, 'group_added', _group.owner_id, _group.id,
         jsonb_build_object(
           'actor_name', (select p.name from public.profiles p where p.id = _group.owner_id),
           'group_name', _group.name)
  where not private.is_blocked_pair(new.user_id, _group.owner_id)
  on conflict (user_id, group_id) where type = 'group_added' do nothing;

  -- A late joiner can see blocks already shared with the group, which makes
  -- them a connection of each person who shared one.
  for _sharer in
    select distinct b.owner_id
    from public.block_group_shares gs
    join public.blocks b on b.id = gs.block_id
    where gs.group_id = new.group_id and b.owner_id <> new.user_id
  loop
    perform private.connect(_sharer, new.user_id);
  end loop;
  return new;
end;
$$;

create trigger group_members_after_insert after insert on public.group_members
  for each row execute function private.on_group_member_inserted();

-- Leaving (or being removed from) a group withdraws the blocks that person
-- shared with it, and drops RSVPs to events they can no longer see.
create function private.on_group_member_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.block_group_shares gs
  using public.blocks b
  where gs.group_id = old.group_id
    and gs.block_id = b.id
    and b.owner_id = old.user_id;

  perform private.prune_rsvps_for_user(old.user_id);

  delete from public.notifications n
  where n.user_id = old.user_id and n.group_id = old.group_id and n.type = 'group_added';
  return old;
end;
$$;

create trigger group_members_after_delete after delete on public.group_members
  for each row execute function private.on_group_member_deleted();

-- ---------------------------------------------------------------------------
-- RSVP and chat triggers
-- ---------------------------------------------------------------------------

-- Tell the host when a guest answers (or changes their answer).
create function private.on_rsvp_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
begin
  select * into _block from public.blocks b where b.id = new.block_id;
  if not found or _block.owner_id = new.user_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, block_id, occurrence, data)
  values (
    _block.owner_id, 'rsvp', new.user_id, _block.id, new.occurrence,
    private.block_snapshot(_block) || jsonb_build_object(
      'actor_name', (select p.name from public.profiles p where p.id = new.user_id),
      'status', new.status)
  )
  on conflict (user_id, block_id, occurrence, actor_id) where type = 'rsvp'
  do update set data = excluded.data, read_at = null, created_at = now();
  return new;
end;
$$;

create trigger rsvps_after_change after insert or update on public.rsvps
  for each row execute function private.on_rsvp_changed();

-- New chat message: notify the host, everyone who said "I'm in", and everyone
-- who has already written in the thread. One unread notification per event.
create function private.on_message_inserted()
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

  insert into public.notifications (user_id, type, actor_id, block_id, data)
  select r.user_id, 'chat', new.user_id, _block.id, _data
  from (
    select _block.owner_id as user_id
    union
    select rs.user_id from public.rsvps rs where rs.block_id = _block.id and rs.status = 'in'
    union
    select m.user_id from public.messages m where m.block_id = _block.id
  ) r
  where r.user_id <> new.user_id
    and not private.is_blocked_pair(r.user_id, new.user_id)
    and private.can_view_block(_block.id, _block.owner_id, _block.audience, r.user_id)
  on conflict (user_id, block_id) where type = 'chat' and read_at is null
  do update set actor_id = excluded.actor_id, data = excluded.data, created_at = now();
  return new;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.on_message_inserted();
