-- Turn an athlete's login into a staff login, keeping the login itself.
--
-- admin.promote_to_staff refuses anyone who has an athlete profile, and admin.delete_athlete removes the whole login. This is
-- the third way: keep the account (same email, same password, same sign-in) but throw away everything that belongs to the
-- student role, then make the account a coordinator (or administrator) on one team.
--
-- It is destructive for the athlete side, so it works like admin.delete_athlete: the default is a PREVIEW that changes nothing.
--
-- Step 1, a PREVIEW:
--   select * from admin.convert_athlete_to_staff(account_email => 'person@example.com', given_name => 'Kim', family_name => 'Smith',
--                                                team_name => 'Iowa Rockets 16R');
-- Step 2, when the preview shows the right person, repeat the email and confirm:
--   select * from admin.convert_athlete_to_staff(account_email => 'person@example.com', given_name => 'Kim', family_name => 'Smith',
--                                                team_name => 'Iowa Rockets 16R', confirm_email => 'person@example.com', confirm => true);
--   job_title    'Recruiting Coordinator' (default), 'Team Coach' or 'Director'
--   account_role 'staff' (default) or 'admin'
--
-- DELETED (cannot be undone): the athlete profile and, with it, the college list, activity log, next steps, notes and the
-- dismissals of them, guardians, video links, majors, target divisions, preferences, the athlete's own coach contacts, the
-- coordinator assignments, the change history about the athlete, and the history of what they did as a student.
-- KEPT: the login, the account row (and its history), shared college data, and every other athlete. The person must sign out and
-- in again afterwards. Take an export first (supabase/admin/05_export_athlete.sql) if there is any doubt.
create function admin.convert_athlete_to_staff(
  account_email text,
  given_name text,
  family_name text,
  team_name text,
  job_title text default 'Recruiting Coordinator',
  account_role public.user_role default 'staff',
  confirm_email text default null,
  confirm boolean default false
) returns table (athlete text, email text, colleges bigint, log_entries bigint, next_steps bigint, notes bigint, history_rows bigint,
                 converted boolean, message text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_first text := btrim(coalesce(given_name, ''));
  v_last text := btrim(coalesce(family_name, ''));
  v_email text := lower(btrim(coalesce(account_email, '')));
  v_user uuid;
  v_athlete uuid;
  v_name text;
  v_team uuid;
  v_team_name text;
  v_status public.user_status;
  v_colleges bigint;
  v_log bigint;
  v_steps bigint;
  v_notes bigint;
  v_history bigint;
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
    raise exception 'No account with the email "%". Nothing changed.', account_email;
  end if;

  select a.id, a.first_name || ' ' || a.last_name into v_athlete, v_name from public.athlete a where a.user_id = v_user;
  if v_athlete is null then
    raise exception '% has no athlete profile, so there is nothing to convert. To make them staff, use admin.promote_to_staff.', v_email;
  end if;

  select au.status into v_status from public.app_user au where au.user_id = v_user;
  if v_status = 'disabled' then
    raise exception 'The account % is switched off. Switch it on first (admin.set_account_status), then convert.', v_email;
  end if;

  select t.id, t.name into v_team, v_team_name from public.team t where t.name = btrim(team_name) order by t.active desc, t.season_label desc limit 1;
  if v_team is null then
    raise exception 'No team named "%". Teams: %. Create it first (admin.create_team).', team_name,
      coalesce((select string_agg(t.name, ', ' order by t.name) from public.team t), '(none)');
  end if;

  select count(*) into v_colleges from public.athlete_college x where x.athlete_id = v_athlete;
  select count(*) into v_log from public.activity_entry x where x.athlete_id = v_athlete;
  select count(*) into v_steps from public.next_step x where x.athlete_id = v_athlete;
  select count(*) into v_notes from public.athlete_note x where x.athlete_id = v_athlete;
  select count(*) into v_history from public.change_history x where x.athlete_id = v_athlete;

  if confirm is not true then
    return query select v_name, v_email, v_colleges, v_log, v_steps, v_notes, v_history, false,
      'PREVIEW ONLY. Nothing was changed. Going ahead keeps the login but PERMANENTLY DELETES the athlete profile and everything attached (the counts above), '
      || 'and makes them ' || account_role::text || ' on ' || v_team_name
      || '. To go ahead, run again with confirm => true and confirm_email => ''' || v_email || '''.';
    return;
  end if;
  if lower(btrim(coalesce(confirm_email, ''))) <> v_email then
    raise exception 'Nothing changed. confirm_email must repeat the account''s email exactly.';
  end if;

  -- Do not write "deleted" rows into the history, because the history would then hold the very data being removed.
  perform set_config('app.skip_audit', '1', true);

  -- Everything the student owns hangs off the athlete row and goes with it (cascade): list, log, next steps, notes, guardians,
  -- video links, majors, divisions, preferences, own coach contacts, coordinator assignments.
  delete from public.athlete where id = v_athlete;

  -- Dismissals of notes made by this person (those on their own notes went with the notes).
  delete from public.athlete_note_dismissal d where d.user_id = v_user;

  -- The history is not linked by a foreign key: remove what was about the athlete, and what they did while they were a student.
  -- The history of the account itself (its creation, and the role change below) stays.
  delete from public.change_history h
  where h.athlete_id = v_athlete
     or (h.table_name = 'athlete' and h.record_id = v_athlete::text)
     or (h.changed_by = v_user and h.changed_by_role = 'athlete');

  perform set_config('app.skip_audit', '', true);

  -- Now the account becomes a staff account. These changes ARE recorded, as dashboard changes.
  update public.app_user set role = account_role where user_id = v_user;

  insert into public.staff_profile (user_id, first_name, last_name, title, email)
  values (v_user, v_first, v_last, job_title, v_email)
  on conflict (user_id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name, title = excluded.title, email = excluded.email, active = true;

  delete from public.staff_team where staff_user_id = v_user and team_id <> v_team;
  insert into public.staff_team (staff_user_id, team_id) values (v_user, v_team) on conflict do nothing;

  return query select v_name, v_email, v_colleges, v_log, v_steps, v_notes, v_history, true,
    'Converted. The athlete profile is deleted and ' || v_email || ' is now ' || account_role::text || ' on ' || v_team_name
    || '. They must sign out and in again. Check with: select * from admin.who_is_who where email = ''' || v_email || ''';';
end;
$$;

-- admin.promote_to_staff is unchanged except for the message when the person has an athlete profile: the old text suggested
-- removing the profile with admin.delete_athlete, which also removes the login. It now points at the function that keeps it.
create or replace function admin.promote_to_staff(
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
    raise exception '% has an athlete profile. Either they sign up again with a different email for staff, or use admin.convert_athlete_to_staff to keep this login and delete the athlete profile and its data.', v_email;
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

-- Nobody but the owner role can use any of it.
revoke all on all functions in schema admin from public, anon, authenticated;
