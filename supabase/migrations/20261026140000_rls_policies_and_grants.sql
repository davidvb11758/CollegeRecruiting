-- WP3: privileges and row-level security policies. Until this migration every table was default-deny.
--
-- Layers, from outermost in:
--   1. GRANTS decide which tables/columns a role may touch at all. anon (signed out) gets NOTHING.
--      authenticated gets only what the app needs; role/status/user_id are never writable by the app.
--   2. RLS POLICIES decide which rows. Roles come from app_user via private helper functions, never from
--      editable metadata. A disabled account fails every helper, so it sees nothing.
--   3. TRIGGERS (WP2) fix the author/source labels and system entries.
--
-- Pilot scope: administrators change lookups, club/team, staff profiles, assignments and the ZIP table in the
-- Supabase dashboard, so there are deliberately NO app-side write policies for those. Adding an admin screen
-- later means a new migration plus tests. Nobody can DELETE through the app except an athlete's own list items
-- (guardians, videos, majors, target divisions) and their private coach contacts; everything else is soft-deleted.

-- ---------------------------------------------------------------------------------------------
-- 1. Start from zero privileges (Supabase grants everything to anon/authenticated by default)
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;   -- includes Supabase's rls_auto_enable()

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. One more helper: is the caller an active signed-in user?
-- ---------------------------------------------------------------------------------------------

create function private.is_active_user() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_user u where u.user_id = auth.uid() and u.status = 'active');
$$;

-- When staff create or change a shared (master) college record, stamp who verified it and when.
create function private.stamp_verification() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and private.is_staff() then
    if tg_table_name = 'college_coach' then
      if new.owner_athlete_id is not null then
        return new;                                 -- an athlete's private contact is not "verified" by staff
      end if;
    end if;
    new.last_verified_on := private.club_today();
    new.verified_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger stamp_verification before insert or update on public.college_program
for each row execute function private.stamp_verification();
create trigger stamp_verification before insert or update on public.college_coach
for each row execute function private.stamp_verification();

-- ---------------------------------------------------------------------------------------------
-- 3. Grants for the signed-in role
-- ---------------------------------------------------------------------------------------------

-- Read-only reference data
grant select on
  public.club, public.team, public.staff_profile, public.staff_team,
  public.sport, public.division, public.player_position, public.major_category, public.activity_type,
  public.next_step_type, public.state, public.app_setting,
  public.conference, public.college, public.college_major, public.college_program, public.zip_location
to authenticated;

-- Accounts: only harmless columns can be changed from the app. role, status, user_id are never writable.
grant select on public.app_user to authenticated;
grant update (display_name, time_zone, username) on public.app_user to authenticated;
grant update (first_name, last_name, title, email, phone) on public.staff_profile to authenticated;

grant select on public.athlete_staff_assignment to authenticated;

-- Athlete identity. user_id can be set once at creation and never changed.
grant select on public.athlete to authenticated;
grant insert (user_id, team_id, first_name, last_name, preferred_name, date_of_birth, graduation_year, sport_code,
              program_type, home_city, home_state, home_zip, athlete_email, athlete_phone, preferred_contact, jersey_number)
  on public.athlete to authenticated;
grant update (team_id, first_name, last_name, preferred_name, date_of_birth, graduation_year, sport_code,
              program_type, home_city, home_state, home_zip, athlete_email, athlete_phone, preferred_contact, jersey_number)
  on public.athlete to authenticated;

-- Profile tabs and the athlete's list/log/reminders. No DELETE except the small editable lists.
grant select, insert, update on
  public.athlete_athletic, public.athlete_academic, public.athlete_preference,
  public.athlete_college, public.activity_entry, public.next_step
to authenticated;
grant select, insert, update, delete on
  public.athlete_target_division, public.athlete_major, public.athlete_guardian, public.athlete_video_link
to authenticated;

-- Shared college data: staff and admin may add and edit (decision D4); nobody deletes through the app,
-- except an athlete's own private coach contacts.
grant insert, update on public.college, public.college_program to authenticated;
grant select, insert, update, delete on public.college_coach to authenticated;

grant select on public.change_history to authenticated;

grant select on
  public.program_competitiveness, public.program_search, public.my_list, public.next_steps_due,
  public.athlete_completeness, public.staff_roster
to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Policies. (select private.fn()) is evaluated once per statement instead of once per row.
-- ---------------------------------------------------------------------------------------------

-- Reference data: readable by any active signed-in user.
do $$
declare
  t text;
begin
  foreach t in array array['club', 'team', 'staff_profile', 'staff_team', 'sport', 'division', 'player_position',
                           'major_category', 'activity_type', 'next_step_type', 'state', 'app_setting',
                           'conference', 'college_major', 'zip_location']
  loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_active_user()))',
                   t || '_select_active', t);
  end loop;
end;
$$;

-- app_user: your own row (while active); admin sees all.
create policy app_user_select on public.app_user for select to authenticated
  using ((user_id = (select auth.uid()) and status = 'active') or (select private.is_admin()));
create policy app_user_update_own on public.app_user for update to authenticated
  using (user_id = (select auth.uid()) and status = 'active')
  with check (user_id = (select auth.uid()) and status = 'active');

-- staff_profile: staff edit their own.
create policy staff_profile_update_own on public.staff_profile for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_staff()))
  with check (user_id = (select auth.uid()) and (select private.is_staff()));

-- Who is assigned to whom: the athlete, the staff member, and admin can see a row. Only the dashboard writes.
create policy assignment_select on public.athlete_staff_assignment for select to authenticated
  using (
    (select private.is_admin())
    or athlete_id = (select private.my_athlete_id())
    or (staff_user_id = (select auth.uid()) and (select private.is_staff()))
  );

-- athlete: own record, or assigned staff, or admin. An athlete row is created once, for yourself, as an athlete.
create policy athlete_select on public.athlete for select to authenticated
  using (private.can_access_athlete(id));
create policy athlete_insert_own on public.athlete for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.app_role()) = 'athlete'
    and (select private.my_athlete_id()) is null
  );
create policy athlete_update on public.athlete for update to authenticated
  using (private.can_access_athlete(id))
  with check (private.can_access_athlete(id));

-- Everything owned by an athlete follows can_access_athlete(athlete_id).
do $$
declare
  t text;
begin
  foreach t in array array['athlete_athletic', 'athlete_academic', 'athlete_preference', 'athlete_target_division',
                           'athlete_major', 'athlete_guardian', 'athlete_video_link', 'athlete_college', 'next_step']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (private.can_access_athlete(athlete_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_access_athlete(athlete_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_access_athlete(athlete_id)) with check (private.can_access_athlete(athlete_id))', t || '_update', t);
  end loop;
  foreach t in array array['athlete_target_division', 'athlete_major', 'athlete_guardian', 'athlete_video_link']
  loop
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_access_athlete(athlete_id))', t || '_delete', t);
  end loop;
end;
$$;

-- Activity log: same access, but system entries can never be changed by anyone.
create policy activity_entry_select on public.activity_entry for select to authenticated
  using (private.can_access_athlete(athlete_id));
create policy activity_entry_insert on public.activity_entry for insert to authenticated
  with check (private.can_access_athlete(athlete_id));
create policy activity_entry_update on public.activity_entry for update to authenticated
  using (private.can_access_athlete(athlete_id) and source <> 'system')
  with check (private.can_access_athlete(athlete_id) and source <> 'system');

-- Shared college data: readable by any active user; staff and admin may add and edit.
create policy college_select on public.college for select to authenticated
  using ((select private.is_active_user()));
create policy college_insert on public.college for insert to authenticated
  with check ((select private.can_write_master()));
create policy college_update on public.college for update to authenticated
  using ((select private.can_write_master())) with check ((select private.can_write_master()));

create policy college_program_select on public.college_program for select to authenticated
  using ((select private.is_active_user()));
create policy college_program_insert on public.college_program for insert to authenticated
  with check ((select private.can_write_master()));
create policy college_program_update on public.college_program for update to authenticated
  using ((select private.can_write_master())) with check ((select private.can_write_master()));

-- Coaches: master rows (no owner) are shared; a row with an owner is private to that athlete, their assigned staff and admin.
create policy college_coach_select on public.college_coach for select to authenticated
  using (
    (owner_athlete_id is null and (select private.is_active_user()))
    or (owner_athlete_id is not null and private.can_access_athlete(owner_athlete_id))
  );
create policy college_coach_insert on public.college_coach for insert to authenticated
  with check (
    (owner_athlete_id is null and (select private.can_write_master()))
    or (owner_athlete_id is not null and private.can_access_athlete(owner_athlete_id))
  );
create policy college_coach_update on public.college_coach for update to authenticated
  using (
    (owner_athlete_id is null and (select private.can_write_master()))
    or (owner_athlete_id is not null and private.can_access_athlete(owner_athlete_id))
  )
  with check (
    (owner_athlete_id is null and (select private.can_write_master()))
    or (owner_athlete_id is not null and private.can_access_athlete(owner_athlete_id))
  );
create policy college_coach_delete_private on public.college_coach for delete to authenticated
  using (owner_athlete_id is not null and private.can_access_athlete(owner_athlete_id));

-- Change history (insert-only by trigger; the app can only read):
--   admin: everything. Staff: assigned athletes' changes plus shared-college edits.
--   Athlete: only the changes staff or admin made to their own data.
create policy change_history_select on public.change_history for select to authenticated
  using (
    (select private.is_admin())
    or (
      athlete_id is not null
      and private.can_access_athlete(athlete_id)
      and ((select private.is_staff()) or changed_by_role in ('staff', 'admin'))
    )
    or (
      athlete_id is null
      and (select private.is_staff())
      and table_name in ('college', 'college_program', 'college_coach', 'college_major')
    )
  );
