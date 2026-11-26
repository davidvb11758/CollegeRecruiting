-- Administrator functions: the club administrator's dashboard tasks, as functions instead of scripts to edit.
--
-- They live in their own schema, `admin`, which is NOT exposed through the API (config.toml exposes only `public` and
-- `graphql_public`) and which nobody but the owner role can use. You run them in the Supabase dashboard SQL editor, which
-- connects as the owner. A signed-in person, the web app and the anonymous key cannot reach them at all: that, not a role
-- check, is the protection (in the SQL editor there is no signed-in person, so a role check could not work).
--
-- Use named arguments, so a swapped value cannot happen. For example:
--   select * from admin.create_team(team_name => 'Iowa Rockets 17R', grad_year => 2028);
-- Every function stops with a plain message and changes nothing if something is wrong, and returns the resulting row so there
-- is no separate "check" query. Changes made here are recorded in the change history as "Dashboard/system".
--
--   admin.who_is_who                                  everyone who can sign in (a view: select * from admin.who_is_who)
--   admin.create_team(...)                            add a team
--   admin.promote_to_staff(...)                       turn a sign-up into a coordinator (or administrator), on one team
--   admin.assign_athletes(...) / unassign_athlete(...)  give a coordinator access to athletes, or take it away
--   admin.set_account_status(...)                     switch an account off (bounced at once, data kept) or back on
--   admin.delete_athlete(...)                         preview, then delete, an athlete and all their data (cannot be undone)

create schema admin;

revoke all on schema admin from public, anon, authenticated;
alter default privileges in schema admin revoke execute on functions from public, anon, authenticated;
alter default privileges in schema admin revoke all on tables from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lookup helper: an account's id from the email they signed in with (case and spaces ignored), or null.
-- ---------------------------------------------------------------------------------------------
create function admin.user_id_of(email_in text) returns uuid
language sql stable
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(email_in));
$$;

-- ---------------------------------------------------------------------------------------------
-- WHO IS WHO: everyone who can sign in, with role, status, name, team and each athlete's coordinators.
-- Also the row every function below returns for the person it changed.
-- ---------------------------------------------------------------------------------------------
create view admin.who_is_who with (security_invoker = true) as
select
  u.email::text as email,
  au.role,
  au.status,
  (u.banned_until is not null and u.banned_until > now()) as sign_in_blocked,
  au.display_name,
  a.first_name || ' ' || a.last_name as athlete,
  sp.first_name || ' ' || sp.last_name as staff_name,
  sp.title,
  coalesce(
    t.name,
    (select string_agg(st_team.name, ', ' order by st_team.name)
       from public.staff_team st
       join public.team st_team on st_team.id = st.team_id
      where st.staff_user_id = au.user_id)
  ) as team,
  a.graduation_year,
  (select string_agg(c.first_name || ' ' || c.last_name || ' (' || s.role_on_athlete::text || ')', ', ' order by s.role_on_athlete::text)
     from public.athlete_staff_assignment s
     join public.staff_profile c on c.user_id = s.staff_user_id
    where s.athlete_id = a.id) as coordinators,
  au.created_at::date as joined
from public.app_user au
join auth.users u on u.id = au.user_id
left join public.athlete a on a.user_id = au.user_id
left join public.team t on t.id = a.team_id
left join public.staff_profile sp on sp.user_id = au.user_id
order by au.role, a.last_name nulls last, sp.last_name nulls last, u.email;

-- ---------------------------------------------------------------------------------------------
-- CREATE A TEAM. Families choose their team when they create their profile (the choice shows once there is more than one).
--   select * from admin.create_team(team_name => 'Iowa Rockets 17R', grad_year => 2028);
-- season defaults to the club's current season.
-- ---------------------------------------------------------------------------------------------
create function admin.create_team(
  team_name text,
  grad_year integer default null,
  season text default null,
  team_level text default null,
  head_coach text default null
) returns table (team text, grad_year_group integer, season_label text, active boolean, athletes bigint)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_club uuid;
  v_name text := btrim(coalesce(team_name, ''));
  v_season text;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'Enter the team name.';
  end if;
  if grad_year is not null and grad_year not between 2000 and 2100 then
    raise exception 'The graduation year "%" does not look right. Use four digits, for example 2028.', grad_year;
  end if;

  select c.id, coalesce(nullif(btrim(season), ''), c.season_label, '') into v_club, v_season
  from public.club c order by c.created_at limit 1;
  if v_club is null then
    raise exception 'There is no club set up yet.';
  end if;

  if exists (select 1 from public.team t where t.club_id = v_club and t.name = v_name and t.season_label = v_season) then
    raise exception 'The team "%" already exists for %.', v_name, v_season;
  end if;

  insert into public.team (club_id, name, grad_year_group, season_label, level, head_coach_name)
  values (v_club, v_name, grad_year, v_season, nullif(btrim(team_level), ''), nullif(btrim(head_coach), ''))
  returning id into v_id;

  return query
  select t.name, t.grad_year_group, t.season_label, t.active, (select count(*) from public.athlete a where a.team_id = t.id)
  from public.team t where t.id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- PROMOTE A SIGN-UP TO CLUB STAFF (or administrator), on one team.
--   select * from admin.promote_to_staff(account_email => 'coach@example.com', given_name => 'Kim', family_name => 'Smith',
--                                        team_name => 'Iowa Rockets 16R');
-- The person signs up first, like anyone else, using the shared sign-up code. They must sign out and in again afterwards.
--   job_title    'Recruiting Coordinator' (default), 'Team Coach' or 'Director'
--   account_role 'staff' (default) or 'admin' (the club administrator, who sees every athlete)
-- The team REPLACES any team they were linked to before. Running it again for the same person is safe.
-- Someone who has an athlete profile cannot be promoted: staff need their own sign-up with a different email. If the profile
-- was made by mistake, remove it first (admin.delete_athlete), then promote.
-- ---------------------------------------------------------------------------------------------
create function admin.promote_to_staff(
  account_email text,
  given_name text,
  family_name text,
  team_name text,
  job_title text default 'Recruiting Coordinator',
  account_role public.user_role default 'staff'
) returns setof admin.who_is_who
language plpgsql
set search_path = ''
as $$
declare
  v_first text := btrim(coalesce(given_name, ''));
  v_last text := btrim(coalesce(family_name, ''));
  v_email text := lower(btrim(coalesce(account_email, '')));
  v_user uuid;
  v_team uuid;
  v_current_role public.user_role;
  v_current_status public.user_status;
begin
  if v_first = '' or v_last = '' then
    raise exception 'Enter their first and last name.';
  end if;
  if account_role is null or account_role not in ('staff', 'admin') then
    raise exception 'The role must be staff or admin.';
  end if;
  if job_title is null or job_title not in ('Recruiting Coordinator', 'Team Coach', 'Director') then
    raise exception 'The job title must be ''Recruiting Coordinator'', ''Team Coach'' or ''Director''.';
  end if;

  v_user := admin.user_id_of(v_email);
  if v_user is null then
    raise exception 'No account with the email "%". Ask them to sign up first, or fix the email.', account_email;
  end if;
  if exists (select 1 from public.athlete a where a.user_id = v_user) then
    raise exception '% has an athlete profile. Staff need their own sign-up with a different email (or remove the profile first with admin.delete_athlete).', v_email;
  end if;

  select au.role, au.status into v_current_role, v_current_status from public.app_user au where au.user_id = v_user;
  if v_current_status = 'disabled' then
    raise exception 'The account % is switched off. Switch it on first (admin.set_account_status), then promote.', v_email;
  end if;
  if v_current_role = 'admin' and account_role <> 'admin'
     and (select count(*) from public.app_user au where au.role = 'admin' and au.status = 'active') <= 1 then
    raise exception 'This is the only active administrator. Promote another administrator before changing this role.';
  end if;

  select t.id into v_team from public.team t where t.name = btrim(team_name) order by t.active desc, t.season_label desc limit 1;
  if v_team is null then
    raise exception 'No team named "%". Teams: %. Create it first (admin.create_team).', team_name,
      coalesce((select string_agg(t.name, ', ' order by t.name) from public.team t), '(none)');
  end if;

  update public.app_user set role = account_role where user_id = v_user;

  insert into public.staff_profile (user_id, first_name, last_name, title, email)
  values (v_user, v_first, v_last, job_title, v_email)
  on conflict (user_id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name, title = excluded.title, email = excluded.email, active = true;

  delete from public.staff_team where staff_user_id = v_user and team_id <> v_team;
  insert into public.staff_team (staff_user_id, team_id) values (v_user, v_team) on conflict do nothing;

  return query select w.* from admin.who_is_who w where lower(w.email) = v_email;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ASSIGN ATHLETES TO A COORDINATOR. A coordinator sees only the athletes assigned to them (an administrator sees all).
--   select * from admin.assign_athletes(coordinator_email => 'coach@example.com',
--                                       athlete_emails => array['family1@example.com', 'family2@example.com']);
--   assign_as  'primary' (default) = the athlete's main coordinator (only one per athlete: the database moves the previous
--              main coordinator to 'secondary'), or 'secondary' = an extra coordinator.
-- All or nothing: if one email is wrong, nobody is assigned. Running it again is safe (it can also change the role).
-- ---------------------------------------------------------------------------------------------
create function admin.assign_athletes(
  coordinator_email text,
  athlete_emails text[],
  assign_as public.assignment_role default 'primary'
) returns setof admin.who_is_who
language plpgsql
set search_path = ''
as $$
declare
  v_staff uuid;
  v_email text;
  v_athlete uuid;
  v_existing uuid;
  v_emails text[] := '{}';
begin
  if athlete_emails is null or cardinality(athlete_emails) = 0 then
    raise exception 'List at least one athlete email.';
  end if;
  if assign_as is null then
    raise exception 'The role must be primary or secondary.';
  end if;

  v_staff := admin.user_id_of(coordinator_email);
  if v_staff is null or not exists (
    select 1
    from public.app_user au
    join public.staff_profile sp on sp.user_id = au.user_id
    where au.user_id = v_staff and au.role in ('staff', 'admin') and au.status = 'active' and sp.active
  ) then
    raise exception 'No active staff account with the email "%". Promote them first (admin.promote_to_staff).', coordinator_email;
  end if;

  foreach v_email in array athlete_emails loop
    select a.id into v_athlete
    from public.athlete a join auth.users u on u.id = a.user_id
    where lower(u.email) = lower(btrim(v_email));
    if v_athlete is null then
      raise exception 'No athlete profile for the email "%". They must sign up and create their profile first.', v_email;
    end if;

    select s.id into v_existing from public.athlete_staff_assignment s where s.athlete_id = v_athlete and s.staff_user_id = v_staff;
    if v_existing is null then
      insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (v_athlete, v_staff, assign_as);
    else
      update public.athlete_staff_assignment set role_on_athlete = assign_as
      where id = v_existing and role_on_athlete is distinct from assign_as;
    end if;
    v_emails := v_emails || lower(btrim(v_email));
  end loop;

  return query select w.* from admin.who_is_who w where lower(w.email) = any (v_emails) order by w.athlete;
end;
$$;

-- TAKE AN ATHLETE AWAY FROM A COORDINATOR.
--   select * from admin.unassign_athlete(player_email => 'family1@example.com', coordinator_email => 'coach@example.com');
-- Works for any account, including a coordinator who has since been switched off.
create function admin.unassign_athlete(player_email text, coordinator_email text) returns setof admin.who_is_who
language plpgsql
set search_path = ''
as $$
declare
  v_athlete uuid;
  v_staff uuid;
  v_removed bigint;
begin
  select a.id into v_athlete
  from public.athlete a join auth.users u on u.id = a.user_id
  where lower(u.email) = lower(btrim(player_email));
  if v_athlete is null then
    raise exception 'No athlete profile for the email "%".', player_email;
  end if;
  v_staff := admin.user_id_of(coordinator_email);
  if v_staff is null then
    raise exception 'No account with the email "%".', coordinator_email;
  end if;

  delete from public.athlete_staff_assignment where athlete_id = v_athlete and staff_user_id = v_staff;
  get diagnostics v_removed = row_count;
  if v_removed = 0 then
    raise exception '% is not assigned to %. Nothing changed.', coordinator_email, player_email;
  end if;

  return query select w.* from admin.who_is_who w where lower(w.email) = lower(btrim(player_email));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- DISABLE (or RE-ENABLE) AN ACCOUNT. A disabled person is bounced to the sign-in page and sees nothing: the database treats
-- every request from them as having no access. Nothing is deleted, so you can switch it back on.
--   select * from admin.set_account_status(account_email => 'someone@example.com', new_status => 'disabled');   -- or 'active'
-- ---------------------------------------------------------------------------------------------
create function admin.set_account_status(account_email text, new_status public.user_status) returns setof admin.who_is_who
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new_status is null then
    raise exception 'The status must be disabled or active.';
  end if;
  v_user := admin.user_id_of(account_email);
  if v_user is null then
    raise exception 'No account with the email "%".', account_email;
  end if;
  if new_status = 'disabled'
     and (select au.role from public.app_user au where au.user_id = v_user) = 'admin'
     and (select count(*) from public.app_user au where au.role = 'admin' and au.status = 'active') <= 1 then
    raise exception 'This is the only active administrator. Promote another administrator before disabling this one.';
  end if;

  update public.app_user set status = new_status where user_id = v_user;
  -- Also stop new sign-ins at the sign-in service. 'infinity' bans; null lifts the ban.
  update auth.users set banned_until = case when new_status = 'disabled' then 'infinity'::timestamptz else null end where id = v_user;

  return query select w.* from admin.who_is_who w where lower(w.email) = lower(btrim(account_email));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- DELETE AN ATHLETE AND ALL THEIR DATA. CANNOT BE UNDONE. Use it only when the family asks for their data to be removed
-- (or for test accounts). Take an export first (supabase/admin/05_export_athlete.sql) if there is any doubt.
-- It removes the sign-in, the profile, the college list, the log, the next steps, the notes, the athlete's own coach contacts,
-- the coordinator assignments, AND the change history about this athlete. Shared college data stays.
--
-- Step 1, a PREVIEW (the default: nothing is deleted):
--   select * from admin.delete_athlete(player_email => 'family1@example.com');
-- Step 2, when the preview shows the right person, repeat the email and confirm:
--   select * from admin.delete_athlete(player_email => 'family1@example.com', confirm_email => 'family1@example.com', confirm => true);
-- ---------------------------------------------------------------------------------------------
create function admin.delete_athlete(player_email text, confirm_email text default null, confirm boolean default false)
returns table (athlete text, email text, colleges bigint, log_entries bigint, next_steps bigint, notes bigint, history_rows bigint,
               deleted boolean, message text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(player_email, '')));
  v_user uuid;
  v_athlete uuid;
  v_name text;
  v_colleges bigint;
  v_log bigint;
  v_steps bigint;
  v_notes bigint;
  v_history bigint;
begin
  select u.id, a.id, a.first_name || ' ' || a.last_name into v_user, v_athlete, v_name
  from auth.users u join public.athlete a on a.user_id = u.id
  where lower(u.email) = v_email;
  if v_user is null then
    raise exception 'No athlete profile for the email "%". Nothing deleted.', player_email;
  end if;

  select count(*) into v_colleges from public.athlete_college x where x.athlete_id = v_athlete;
  select count(*) into v_log from public.activity_entry x where x.athlete_id = v_athlete;
  select count(*) into v_steps from public.next_step x where x.athlete_id = v_athlete;
  select count(*) into v_notes from public.athlete_note x where x.athlete_id = v_athlete;
  select count(*) into v_history from public.change_history x where x.athlete_id = v_athlete;

  if confirm is not true then
    return query select v_name, v_email, v_colleges, v_log, v_steps, v_notes, v_history, false,
      'PREVIEW ONLY. Nothing was deleted. To delete, run again with confirm => true and confirm_email => ''' || v_email || '''.';
    return;
  end if;
  if lower(btrim(coalesce(confirm_email, ''))) <> v_email then
    raise exception 'Nothing deleted. confirm_email must repeat the athlete''s email exactly.';
  end if;

  -- Do not write "deleted" rows into the history, because the history would then hold the very data being removed.
  perform set_config('app.skip_audit', '1', true);

  -- Removing the sign-in removes the app_user, the athlete and, by cascade, everything that belongs to the athlete.
  delete from auth.users where id = v_user;

  -- The history is not linked by a foreign key, so remove it explicitly.
  delete from public.change_history h
  where h.athlete_id = v_athlete
     or (h.table_name = 'app_user' and h.record_id = v_user::text)
     or (h.table_name = 'athlete' and h.record_id = v_athlete::text);

  perform set_config('app.skip_audit', '', true);

  return query select v_name, v_email, v_colleges, v_log, v_steps, v_notes, v_history, true, 'Deleted. This cannot be undone.';
end;
$$;

-- Nobody but the owner role can use any of it.
revoke all on all functions in schema admin from public, anon, authenticated;
revoke all on all tables in schema admin from public, anon, authenticated;
