-- =============================================================================
-- wheet · 10 · Activities and ideas
-- =============================================================================
-- 1. Saved places get a type ("House", "Park", "Restaurant", or one of the
--    person's own), so activities can be matched to places.
-- 2. Activities: a person's own list of things they like doing ("Brunch",
--    "Book club"), each with the kinds of place it happens in and, if they
--    like, favourite spots for it from their saved places (a pair, like
--    "Book club · Mika's"). Private to the owner, like saved places.
-- 3. Ideas on a block: Free time can carry a few ideas of what to do
--    ("Brunch?", "Park hang?"). Everyone who can see the block sees them.
-- 4. "I'm up for this": friends who can see the block tap the ideas they'd
--    do, per week of a weekly repeat. The owner is told, and sees who picked
--    what.
--
-- Only adds things: an older version of the app keeps working with it.
-- =============================================================================

-- A list of short bits of text: each one 1 to _max characters (ignoring stray spaces).
create function private.all_short(_items text[], _max integer)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(char_length(btrim(item)) between 1 and _max), true)
  from unnest(_items) as item;
$$;

-- ---------------------------------------------------------------------------
-- 1. A type for each saved place
-- ---------------------------------------------------------------------------
alter table public.saved_places
  add column kind text check (kind is null or char_length(btrim(kind)) between 1 and 30);

grant update (kind) on public.saved_places to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Activities
-- ---------------------------------------------------------------------------
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  -- Its icon: an emoji, or one of wheet's picture codes (see lib/event-icon.ts).
  emoji        text check (emoji is null or char_length(emoji) <= 16),
  -- The kinds of place it happens in, e.g. {House, Park}. Empty: anywhere.
  place_kinds  text[] not null default '{}'
                 check (cardinality(place_kinds) <= 8 and private.all_short(place_kinds, 30)),
  -- Favourite spots for it, from the owner's saved places.
  place_ids    uuid[] not null default '{}' check (cardinality(place_ids) <= 10),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index activities_owner_idx on public.activities (owner_id);
-- One activity per name (ignoring capitals and stray spaces).
create unique index activities_owner_name_uniq on public.activities (owner_id, lower(btrim(name)));

create trigger activities_touch before update on public.activities
  for each row execute function private.touch_updated_at();

-- Keep the favourite spots to the owner's own saved places (and each one once),
-- and keep the list to a sensible size.
create function private.on_activity_saving()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.activities a where a.owner_id = new.owner_id) >= 100 then
    raise exception 'You can save up to 100 activities. Delete one to add another.' using errcode = 'P0001';
  end if;
  new.place_ids := coalesce((
    select array_agg(p.id order by array_position(new.place_ids, p.id))
    from public.saved_places p
    where p.owner_id = new.owner_id and p.id = any (new.place_ids)
  ), '{}');
  return new;
end;
$$;

create trigger activities_before_save before insert or update on public.activities
  for each row execute function private.on_activity_saving();

-- A saved place that is deleted stops being anyone's favourite spot.
create function private.on_saved_place_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.activities a
  set place_ids = array_remove(a.place_ids, old.id)
  where a.owner_id = old.owner_id and old.id = any (a.place_ids);
  return old;
end;
$$;

create trigger saved_places_after_delete after delete on public.saved_places
  for each row execute function private.on_saved_place_deleted();

revoke execute on function private.on_activity_saving() from public, anon;
revoke execute on function private.on_saved_place_deleted() from public, anon;

alter table public.activities enable row level security;

revoke all on public.activities from anon, authenticated;
grant select, insert, delete                      on public.activities to authenticated;
grant update (name, emoji, place_kinds, place_ids) on public.activities to authenticated;
grant all                                         on public.activities to service_role;

create policy "activities: owner reads"
  on public.activities for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "activities: owner adds"
  on public.activities for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "activities: owner edits"
  on public.activities for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "activities: owner deletes"
  on public.activities for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Ideas on a block
-- ---------------------------------------------------------------------------
-- A list of at most 6 ideas, each like
--   {"id": "k3x9", "title": "Brunch", "emoji": "🥞", "kind": "Restaurant", "place": "Joe's Diner"}
-- "id" (1–40 characters, different for each idea) and "title" (1–60) are
-- needed; "emoji" (up to 16), "kind" (a type of place, up to 30) and "place"
-- (a location, up to 200) may be left out.
create function private.ideas_ok(_ideas jsonb)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  _idea jsonb;
  _ids text[] := '{}';
begin
  if jsonb_typeof(_ideas) <> 'array' or jsonb_array_length(_ideas) > 6 or octet_length(_ideas::text) > 6000 then
    return false;
  end if;
  for _idea in select value from jsonb_array_elements(_ideas) loop
    if jsonb_typeof(_idea) <> 'object'
      or jsonb_typeof(_idea -> 'id') is distinct from 'string'
      or char_length(_idea ->> 'id') not between 1 and 40
      or (_idea ->> 'id') = any (_ids)
      or jsonb_typeof(_idea -> 'title') is distinct from 'string'
      or char_length(btrim(_idea ->> 'title')) not between 1 and 60
      or coalesce(jsonb_typeof(_idea -> 'emoji'), 'null') not in ('string', 'null')
      or char_length(coalesce(_idea ->> 'emoji', '')) > 16
      or coalesce(jsonb_typeof(_idea -> 'kind'), 'null') not in ('string', 'null')
      or char_length(coalesce(_idea ->> 'kind', '')) > 30
      or coalesce(jsonb_typeof(_idea -> 'place'), 'null') not in ('string', 'null')
      or char_length(coalesce(_idea ->> 'place', '')) > 200
    then
      return false;
    end if;
    _ids := _ids || (_idea ->> 'id');
  end loop;
  return true;
end;
$$;

alter table public.blocks
  add column ideas jsonb not null default '[]'::jsonb
  constraint blocks_ideas_check check (private.ideas_ok(ideas));

grant update (ideas) on public.blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 4. "I'm up for this"
-- ---------------------------------------------------------------------------
create table public.idea_votes (
  block_id    uuid not null references public.blocks (id) on delete cascade,
  -- Which week of a weekly repeat (0 for a one-off), as for RSVPs.
  occurrence  integer not null default 0 check (occurrence >= 0),
  idea_id     text not null check (char_length(idea_id) between 1 and 40),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (block_id, occurrence, idea_id, user_id)
);
create index idea_votes_user_idx on public.idea_votes (user_id);

-- Is this one of the ideas on a block of Free time?
create function private.block_has_idea(_block_id uuid, _idea_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where b.id = _block_id
      and b.type = 'free'
      and exists (select 1 from jsonb_array_elements(b.ideas) i where i ->> 'id' = _idea_id)
  );
$$;

revoke execute on function private.block_has_idea(uuid, text) from public, anon;
grant execute on function private.block_has_idea(uuid, text) to authenticated, service_role;

alter table public.idea_votes enable row level security;

revoke all on public.idea_votes from anon, authenticated;
grant select, insert, delete on public.idea_votes to authenticated;
grant all                    on public.idea_votes to service_role;

-- Everyone who can see the block sees who picked what (from people who can still see it).
create policy "idea_votes: audience reads"
  on public.idea_votes for select to authenticated
  using (
    private.can_view_block_id(block_id, (select auth.uid()))
    and private.can_view_block_id(block_id, user_id)
  );

-- Friends pick for themselves, on ideas that are on the block. (The owner's own ideas need no vote.)
create policy "idea_votes: audience picks"
  on public.idea_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not private.owns_block(block_id, (select auth.uid()))
    and private.can_view_block_id(block_id, (select auth.uid()))
    and private.block_has_idea(block_id, idea_id)
  );

create policy "idea_votes: take back own pick"
  on public.idea_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- An idea taken off the block takes its picks with it.
create function private.on_block_ideas_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.idea_votes v
  where v.block_id = new.id
    and not exists (select 1 from jsonb_array_elements(new.ideas) i where i ->> 'id' = v.idea_id);
  return new;
end;
$$;

create trigger blocks_after_ideas_change after update of ideas on public.blocks
  for each row when (old.ideas is distinct from new.ideas)
  execute function private.on_block_ideas_changed();

revoke execute on function private.on_block_ideas_changed() from public, anon;

-- The bell: tell the owner. One unread notification per block, naming the
-- latest person and idea.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'event_shared', 'free_shared', 'rsvp', 'chat', 'connected', 'group_added', 'invite_accepted',
  'dm', 'block_dm',
  'idea_vote'  -- someone is up for one of the ideas on your Free time (coalesced per block)
));

create unique index notifications_idea_vote_uniq
  on public.notifications (user_id, block_id) where type = 'idea_vote' and read_at is null;

create function private.on_idea_vote_inserted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _block public.blocks;
  _idea jsonb;
begin
  select * into _block from public.blocks b where b.id = new.block_id;
  if not found or private.is_blocked_pair(_block.owner_id, new.user_id) then
    return new;
  end if;
  select i into _idea from jsonb_array_elements(_block.ideas) i where i ->> 'id' = new.idea_id limit 1;

  insert into public.notifications (user_id, type, actor_id, block_id, occurrence, data)
  values (
    _block.owner_id, 'idea_vote', new.user_id, _block.id, new.occurrence,
    private.block_snapshot(_block) || jsonb_build_object(
      'actor_name', (select p.name from public.profiles p where p.id = new.user_id),
      'preview', left(coalesce(_idea ->> 'title', ''), 120),
      'idea_emoji', _idea ->> 'emoji')
  )
  on conflict (user_id, block_id) where type = 'idea_vote' and read_at is null
  do update set actor_id = excluded.actor_id, occurrence = excluded.occurrence, data = excluded.data, created_at = now();
  return new;
end;
$$;

create trigger idea_votes_after_insert after insert on public.idea_votes
  for each row execute function private.on_idea_vote_inserted();

revoke execute on function private.on_idea_vote_inserted() from public, anon;

-- Live updates (Realtime applies the read rule above to every subscriber).
alter publication supabase_realtime add table public.idea_votes;
