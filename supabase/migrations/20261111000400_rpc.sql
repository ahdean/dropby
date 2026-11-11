-- =============================================================================
-- dropby · 4/5 · Functions the app calls (supabase.rpc)
-- =============================================================================
-- These are the only `security definer` functions in the exposed `public`
-- schema. Each one checks who is calling before it does anything.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- connect_with: the "Connect" button on a mutual.
-- Returns true when a new connection was created.
-- ---------------------------------------------------------------------------
create function public.connect_with(target uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  created boolean;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if target is null or target = me then
    raise exception 'You cannot connect with yourself' using errcode = '22023';
  end if;
  if private.are_connected(me, target) then
    return false;
  end if;
  -- Same answer for "blocked" and "not a mutual" so blocks are not revealed.
  if private.is_blocked_pair(me, target) or not private.share_group(me, target) then
    raise exception 'You can only connect with people you share a group with'
      using errcode = '42501';
  end if;

  created := private.connect(me, target);
  if created then
    insert into public.notifications (user_id, type, actor_id, data)
    values (target, 'connected', me,
            jsonb_build_object('actor_name', (select p.name from public.profiles p where p.id = me)))
    on conflict (user_id, actor_id) where type = 'connected' and read_at is null
    do update set created_at = now();
  end if;
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_mutuals: people who share a group with me but are not connections.
-- Returns name and avatar only.
-- ---------------------------------------------------------------------------
create function public.get_mutuals()
returns table (id uuid, name text, avatar_url text, group_names text[])
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.avatar_url,
         array_agg(distinct g.name order by g.name) as group_names
  from public.group_members mine
  join public.group_members theirs
    on theirs.group_id = mine.group_id and theirs.user_id <> mine.user_id
  join public.groups g on g.id = mine.group_id
  join public.profiles p on p.id = theirs.user_id
  where mine.user_id = auth.uid()
    and not private.are_connected(mine.user_id, theirs.user_id)
    and not private.is_blocked_pair(mine.user_id, theirs.user_id)
  group by p.id, p.name, p.avatar_url
  order by p.name;
$$;

-- ---------------------------------------------------------------------------
-- get_block_people: names and avatars for an event page: who it was shared
-- with by name, who answered, who chatted. Only for people who can see the
-- block. "All connections" audiences are not enumerated (that would leak the
-- host's whole friend list); the page shows them as "all of X's connections".
-- ---------------------------------------------------------------------------
create function public.get_block_people(_block_id uuid)
returns table (
  user_id          uuid,
  name             text,
  avatar_url       text,
  is_host          boolean,
  shared_directly  boolean,
  via_groups       text[]
)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select bl.id, bl.owner_id
    from public.blocks bl
    where bl.id = _block_id
      and private.can_view_block(bl.id, bl.owner_id, bl.audience, auth.uid())
  ),
  direct as (
    select s.user_id from public.block_user_shares s join b on b.id = s.block_id
  ),
  grouped as (
    select gm.user_id, array_agg(distinct g.name order by g.name) as names
    from public.block_group_shares gs
    join b on b.id = gs.block_id
    join public.groups g on g.id = gs.group_id
    join public.group_members gm on gm.group_id = gs.group_id
    group by gm.user_id
  ),
  involved as (
    select owner_id as user_id from b
    union select user_id from direct
    union select user_id from grouped
    union select r.user_id from public.rsvps r join b on b.id = r.block_id
    union select m.user_id from public.messages m join b on b.id = m.block_id
  )
  select i.user_id,
         p.name,
         p.avatar_url,
         i.user_id = b.owner_id,
         exists (select 1 from direct d where d.user_id = i.user_id),
         coalesce((select gr.names from grouped gr where gr.user_id = i.user_id), '{}')
  from involved i
  join b on true
  join public.profiles p on p.id = i.user_id
  where i.user_id = b.owner_id
     or i.user_id = auth.uid()
     or not private.is_blocked_pair(i.user_id, auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- get_invite_preview: what a signed-out visitor sees when they open an invite
-- link. Deliberately small: no ids, no location, no guest list.
-- Returns null for unknown, expired or revoked links.
-- ---------------------------------------------------------------------------
create function public.get_invite_preview(_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'kind', case when i.block_id is null then 'connect' else 'block' end,
    'inviter', jsonb_build_object('name', p.name, 'avatar_url', p.avatar_url),
    'occurrence', i.occurrence,
    'block', case when b.id is null then null else jsonb_build_object(
      'type',          b.type,
      'title',         b.title,
      'emoji',         b.emoji,
      'description',   b.description,
      'has_location',  b.location is not null and btrim(b.location) <> '',
      'start_at',      b.start_at,
      'end_at',        b.end_at,
      'tz',            b.tz,
      'repeat_weekly', b.repeat_weekly
    ) end
  )
  from public.invites i
  join public.profiles p on p.id = i.inviter_id
  left join public.blocks b on b.id = i.block_id
  where i.token = _token
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.block_id is null or b.id is not null);
$$;

-- ---------------------------------------------------------------------------
-- redeem_invite: called right after someone signs in from an invite link.
-- Connects them to the sharer and adds them to the block's audience.
-- ---------------------------------------------------------------------------
create function public.redeem_invite(_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  first_time integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into inv
  from public.invites i
  where i.token = _token and i.revoked_at is null and i.expires_at > now();

  if not found or private.is_blocked_pair(me, inv.inviter_id) then
    raise exception 'This invite link is no longer valid' using errcode = 'P0002';
  end if;

  if inv.inviter_id <> me then
    perform private.connect(me, inv.inviter_id);

    if inv.block_id is not null then
      insert into public.block_user_shares (block_id, user_id)
      values (inv.block_id, me)
      on conflict do nothing;

      -- They are looking at it right now; no need to ring their bell too.
      update public.notifications n
      set read_at = now()
      where n.user_id = me and n.block_id = inv.block_id
        and n.type in ('event_shared', 'free_shared') and n.read_at is null;
    end if;

    insert into public.invite_redemptions (token, user_id)
    values (inv.token, me)
    on conflict do nothing;
    get diagnostics first_time = row_count;

    if first_time > 0 then
      insert into public.notifications (user_id, type, actor_id, block_id, data)
      values (inv.inviter_id, 'invite_accepted', me, inv.block_id,
              jsonb_build_object('actor_name', (select p.name from public.profiles p where p.id = me)));
    end if;
  end if;

  return jsonb_build_object(
    'kind', case when inv.block_id is null then 'connect' else 'block' end,
    'block_id', inv.block_id,
    'block_type', (select b.type from public.blocks b where b.id = inv.block_id),
    'occurrence', inv.occurrence,
    'inviter_id', inv.inviter_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke execute on function public.connect_with(uuid)        from public, anon;
revoke execute on function public.get_mutuals()             from public, anon;
revoke execute on function public.get_block_people(uuid)    from public, anon;
revoke execute on function public.redeem_invite(text)       from public, anon;
revoke execute on function public.get_invite_preview(text)  from public;

grant execute on function public.connect_with(uuid)         to authenticated, service_role;
grant execute on function public.get_mutuals()              to authenticated, service_role;
grant execute on function public.get_block_people(uuid)     to authenticated, service_role;
grant execute on function public.redeem_invite(text)        to authenticated, service_role;
grant execute on function public.get_invite_preview(text)   to anon, authenticated, service_role;
