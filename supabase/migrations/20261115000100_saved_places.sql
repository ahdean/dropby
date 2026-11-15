-- =============================================================================
-- dropby · 7 · Saved places
-- =============================================================================
-- A person's own list of places they host at, each with a nickname
-- ("Home" → "12 Elm St, Apt 4"), so an event's location can be filled in with
-- one tap. The list is private: nobody else can read it. When a place is used
-- on an event, only the address is copied onto that event.
-- =============================================================================

create table public.saved_places (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The nickname shown to the owner, e.g. "Home".
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  -- What is put into an event's "Where" field.
  address     text not null check (char_length(btrim(address)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index saved_places_owner_idx on public.saved_places (owner_id);
-- One place per nickname (ignoring capitals and stray spaces).
create unique index saved_places_owner_name_uniq on public.saved_places (owner_id, lower(btrim(name)));

create trigger saved_places_touch before update on public.saved_places
  for each row execute function private.touch_updated_at();

-- A sensible ceiling, so the list cannot be used to fill the database.
create function private.on_saved_place_inserting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.saved_places p where p.owner_id = new.owner_id) >= 50 then
    raise exception 'You can save up to 50 places. Delete one to add another.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger saved_places_before_insert before insert on public.saved_places
  for each row execute function private.on_saved_place_inserting();

revoke execute on function private.on_saved_place_inserting() from public, anon;

-- ---------------------------------------------------------------------------
-- Access: the owner only.
-- ---------------------------------------------------------------------------
alter table public.saved_places enable row level security;

revoke all on public.saved_places from anon, authenticated;
grant select, insert, delete      on public.saved_places to authenticated;
grant update (name, address)      on public.saved_places to authenticated;
grant all                         on public.saved_places to service_role;

create policy "saved_places: owner reads"
  on public.saved_places for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "saved_places: owner adds"
  on public.saved_places for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "saved_places: owner edits"
  on public.saved_places for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "saved_places: owner deletes"
  on public.saved_places for delete to authenticated
  using (owner_id = (select auth.uid()));
