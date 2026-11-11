-- =============================================================================
-- dropby · 3/5 · Row-level security and grants
-- =============================================================================
-- Rule of thumb: nobody can read a block that was not shared with them, and
-- the database (not the app) is what enforces it.
--
-- Signed-out visitors (`anon`) get NO table access at all. The only thing they
-- can do is call get_invite_preview() (4/5).
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.connections         enable row level security;
alter table public.user_blocks         enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.blocks              enable row level security;
alter table public.block_user_shares   enable row level security;
alter table public.block_group_shares  enable row level security;
alter table public.rsvps               enable row level security;
alter table public.messages            enable row level security;
alter table public.invites             enable row level security;
alter table public.invite_redemptions  enable row level security;
alter table public.notifications       enable row level security;

-- ---------------------------------------------------------------------------
-- Grants. Start from nothing so the result is identical on every Supabase
-- project regardless of its default privileges.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

grant select                                  on public.profiles           to authenticated;
grant update (name, avatar_url)               on public.profiles           to authenticated;

grant select, delete                          on public.connections        to authenticated;
grant select, insert, delete                  on public.user_blocks        to authenticated;

grant select, insert, delete                  on public.groups             to authenticated;
grant update (name)                           on public.groups             to authenticated;
grant select, insert, delete                  on public.group_members      to authenticated;

grant select, insert, delete                  on public.blocks             to authenticated;
grant update (type, start_at, end_at, tz, repeat_weekly, repeat_count, skipped_occurrences,
              title, emoji, location, description, rsvp_enabled, audience)
                                              on public.blocks             to authenticated;

grant select, insert, delete                  on public.block_user_shares  to authenticated;
grant select, insert, delete                  on public.block_group_shares to authenticated;

grant select, insert, delete                  on public.rsvps              to authenticated;
grant update (status)                         on public.rsvps              to authenticated;

grant select, insert, delete                  on public.messages           to authenticated;

grant select, insert, delete                  on public.invites            to authenticated;
grant update (revoked_at)                     on public.invites            to authenticated;

grant select, delete                          on public.notifications      to authenticated;
grant update (read_at)                        on public.notifications      to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- profiles
--   read:   yourself, your connections, your mutuals (people in a shared
--           group), and people you have blocked (so you can unblock them).
--           Never anyone in a blocked pair otherwise.
--   write:  only your own name and picture.
-- ---------------------------------------------------------------------------
create policy "profiles: read self, connections, mutuals"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      not private.is_blocked_pair(id, (select auth.uid()))
      and (
        private.are_connected(id, (select auth.uid()))
        or private.share_group(id, (select auth.uid()))
      )
    )
    or exists (
      select 1 from public.user_blocks ub
      where ub.blocker_id = (select auth.uid()) and ub.blocked_id = profiles.id
    )
  );

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- connections: both sides can see and remove the edge. There is no insert
-- policy on purpose: edges are created only by trusted functions.
-- ---------------------------------------------------------------------------
create policy "connections: read own"
  on public.connections for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "connections: remove own"
  on public.connections for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- ---------------------------------------------------------------------------
-- user_blocks: visible to the blocker only. The blocked person is never told.
-- ---------------------------------------------------------------------------
create policy "user_blocks: read own"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "user_blocks: block someone"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks: unblock"
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- groups: members can see the group; only the owner can change it.
-- ---------------------------------------------------------------------------
create policy "groups: members read"
  on public.groups for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.is_group_member(id, (select auth.uid()))
  );

create policy "groups: create own"
  on public.groups for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "groups: owner renames"
  on public.groups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "groups: owner deletes"
  on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- group_members
--   read:    fellow members
--   add:     the owner, and only people the owner is connected to
--   remove:  the owner removes others; a member removes themself (leave).
--            The owner cannot leave; they delete the group instead.
-- ---------------------------------------------------------------------------
create policy "group_members: members read"
  on public.group_members for select to authenticated
  using (private.is_group_member(group_id, (select auth.uid())));

create policy "group_members: owner adds connections"
  on public.group_members for insert to authenticated
  with check (
    private.is_group_owner(group_id, (select auth.uid()))
    and user_id <> (select auth.uid())
    and private.are_connected(user_id, (select auth.uid()))
    and not private.is_blocked_pair(user_id, (select auth.uid()))
  );

create policy "group_members: owner removes, member leaves"
  on public.group_members for delete to authenticated
  using (
    (private.is_group_owner(group_id, (select auth.uid())) and user_id <> (select auth.uid()))
    or (user_id = (select auth.uid()) and not private.is_group_owner(group_id, (select auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- blocks: readable by the owner and the audience; writable by the owner.
-- ---------------------------------------------------------------------------
create policy "blocks: owner and audience read"
  on public.blocks for select to authenticated
  using (private.can_view_block(id, owner_id, audience, (select auth.uid())));

create policy "blocks: create own"
  on public.blocks for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "blocks: owner updates"
  on public.blocks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "blocks: owner deletes"
  on public.blocks for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- block_user_shares
--   read:    the block's owner, and the person named in the row
--   add:     the owner, for connections or mutuals only
--   remove:  the owner, or the recipient (to take themself off the list)
-- ---------------------------------------------------------------------------
create policy "block_user_shares: owner and recipient read"
  on public.block_user_shares for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.owns_block(block_id, (select auth.uid()))
  );

create policy "block_user_shares: owner shares with people they know"
  on public.block_user_shares for insert to authenticated
  with check (
    private.owns_block(block_id, (select auth.uid()))
    and private.can_share_with((select auth.uid()), user_id)
  );

create policy "block_user_shares: owner or recipient removes"
  on public.block_user_shares for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.owns_block(block_id, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- block_group_shares
--   read:    the block's owner and members of that group
--   add:     the owner, for groups they belong to
--   remove:  the owner
-- ---------------------------------------------------------------------------
create policy "block_group_shares: owner and members read"
  on public.block_group_shares for select to authenticated
  using (
    private.owns_block(block_id, (select auth.uid()))
    or private.is_group_member(group_id, (select auth.uid()))
  );

create policy "block_group_shares: owner shares with own groups"
  on public.block_group_shares for insert to authenticated
  with check (
    private.owns_block(block_id, (select auth.uid()))
    and private.is_group_member(group_id, (select auth.uid()))
  );

create policy "block_group_shares: owner removes"
  on public.block_group_shares for delete to authenticated
  using (private.owns_block(block_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- rsvps: anyone who can see the event can see who answered; guests answer for
-- themselves only, and only on hosted events that accept RSVPs.
-- ---------------------------------------------------------------------------
create policy "rsvps: audience reads"
  on public.rsvps for select to authenticated
  using (private.can_view_block_id(block_id, (select auth.uid())));

create policy "rsvps: guest answers"
  on public.rsvps for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not private.owns_block(block_id, (select auth.uid()))
    and private.can_view_block_id(block_id, (select auth.uid()))
    and private.block_accepts(block_id, 'rsvp')
  );

create policy "rsvps: guest changes answer"
  on public.rsvps for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.can_view_block_id(block_id, (select auth.uid()))
    and private.block_accepts(block_id, 'rsvp')
  );

create policy "rsvps: guest withdraws"
  on public.rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- messages: the audience of a hosted event can read and write its chat.
-- ---------------------------------------------------------------------------
create policy "messages: audience reads"
  on public.messages for select to authenticated
  using (private.can_view_block_id(block_id, (select auth.uid())));

create policy "messages: audience writes"
  on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_block_id(block_id, (select auth.uid()))
    and private.block_accepts(block_id, 'chat')
  );

create policy "messages: author or host deletes"
  on public.messages for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.owns_block(block_id, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- invites: managed by whoever created the link. Everyone else goes through
-- get_invite_preview() / redeem_invite().
-- ---------------------------------------------------------------------------
create policy "invites: inviter reads"
  on public.invites for select to authenticated
  using (inviter_id = (select auth.uid()));

create policy "invites: create for own blocks"
  on public.invites for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and (block_id is null or private.owns_block(block_id, (select auth.uid())))
  );

create policy "invites: inviter revokes"
  on public.invites for update to authenticated
  using (inviter_id = (select auth.uid()))
  with check (inviter_id = (select auth.uid()));

create policy "invites: inviter deletes"
  on public.invites for delete to authenticated
  using (inviter_id = (select auth.uid()));

-- invite_redemptions: no policies → no direct client access.

-- ---------------------------------------------------------------------------
-- notifications: yours only. Written by triggers, so there is no insert policy.
-- ---------------------------------------------------------------------------
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: delete own"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
