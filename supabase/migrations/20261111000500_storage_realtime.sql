-- =============================================================================
-- dropby · 5/5 · File storage (profile pictures) and realtime
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for avatars. Anyone with the (unguessable) URL
-- can view a picture; a user can only write inside the folder named after
-- their own user id:  avatars/<user id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: owner reads own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner uploads to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner replaces own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner deletes own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes to subscribed browsers. Supabase Realtime
-- re-checks row-level security for every subscriber, so a change is only
-- delivered to people who are allowed to read the row.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.blocks,
  public.block_user_shares,
  public.block_group_shares,
  public.rsvps,
  public.messages,
  public.notifications,
  public.connections,
  public.groups,
  public.group_members,
  public.profiles;
