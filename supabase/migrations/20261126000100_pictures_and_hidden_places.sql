-- =============================================================================
-- wheet · 8 · Event pictures, and hiding "Used before" places
-- =============================================================================
-- Only adds things: older versions of the app keep working with it.
--
-- 1. An event can carry a picture. The file lives in the public storage bucket
--    "event-pictures", in a folder named after the host's user id; the event
--    stores only that path. Like profile pictures, a file can be viewed by
--    anyone who has its (unguessable) address, and that address is only given
--    out with the event itself, which row-level security already guards.
--    The invite preview shows it too, as it shows the title.
-- 2. A person can hide places from their "Used before" suggestions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event pictures
-- ---------------------------------------------------------------------------
alter table public.blocks
  add column picture_path text
  -- Only a file in the host's own folder, with an ordinary picture name. (No
  -- links to other websites: a picture from elsewhere could tell that site
  -- who looked at the event.)
  constraint blocks_picture_path_own_folder check (
    picture_path is null
    or (char_length(picture_path) <= 200
        and picture_path ~ ('^' || owner_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'))
  );

grant update (picture_path) on public.blocks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-pictures', 'event-pictures', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "event-pictures: owner lists own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event-pictures: owner uploads to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event-pictures: owner replaces own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event-pictures: owner deletes own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The invite preview now includes the picture (same function, one more field).
create or replace function public.get_invite_preview(_token text)
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
      'repeat_weekly', b.repeat_weekly,
      'picture_path',  b.picture_path
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

revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Places hidden from "Used before"
-- ---------------------------------------------------------------------------
-- "Used before" is worked out from the locations on a person's own events.
-- This is the list of the ones they crossed out. Stored in the app's
-- comparison form (lower case, single spaces), one row per place.
create table public.hidden_places (
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_key   text not null check (char_length(place_key) between 1 and 200),
  created_at  timestamptz not null default now(),
  primary key (owner_id, place_key)
);

create function private.on_hidden_place_inserting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.hidden_places h where h.owner_id = new.owner_id) >= 300 then
    raise exception 'You have hidden a lot of places already. Bring one back to hide another.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger hidden_places_before_insert before insert on public.hidden_places
  for each row execute function private.on_hidden_place_inserting();

revoke execute on function private.on_hidden_place_inserting() from public, anon;

alter table public.hidden_places enable row level security;

revoke all on public.hidden_places from anon, authenticated;
grant select, insert, delete on public.hidden_places to authenticated;
grant all                    on public.hidden_places to service_role;

create policy "hidden_places: owner reads"
  on public.hidden_places for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "hidden_places: owner adds"
  on public.hidden_places for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "hidden_places: owner deletes"
  on public.hidden_places for delete to authenticated
  using (owner_id = (select auth.uid()));
