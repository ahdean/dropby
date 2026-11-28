-- =============================================================================
-- wheet · 11 · Sections for activities
-- =============================================================================
-- Activities are shown in sections ("Food & drink", "At home", "Out & about",
-- "Active", "From afar"). A new activity is added to the section it was
-- created in, so each one remembers its section. Activities saved before this
-- file have none; the app works one out for them.
--
-- Run after 20261128000100_activities.sql. Only adds things.
-- =============================================================================

alter table public.activities
  add column category text check (category is null or char_length(btrim(category)) between 1 and 30);

grant update (category) on public.activities to authenticated;
