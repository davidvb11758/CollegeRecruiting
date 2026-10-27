-- DELETE AN ATHLETE AND ALL THEIR DATA. THIS CANNOT BE UNDONE. Use it only when the family asks for their data to
-- be removed (or for test accounts). Take an export first (05_export_athlete.sql) if there is any doubt.
--
-- It removes the sign-in, the profile, the college list, the log, the next steps, the athlete's own coach contacts,
-- the coordinator assignments, AND the change history about this athlete. Shared college data stays.
--
-- Step 1: edit the email, run only the PREVIEW query below to see what would go.
-- Step 2: when sure, edit the email and the confirmation word in the DELETE block, and run that block.

-- PREVIEW (read-only)
select a.first_name || ' ' || a.last_name as athlete, u.email,
       (select count(*) from public.athlete_college where athlete_id = a.id) as colleges,
       (select count(*) from public.activity_entry where athlete_id = a.id) as log_entries,
       (select count(*) from public.next_step where athlete_id = a.id) as next_steps,
       (select count(*) from public.change_history where athlete_id = a.id) as history_rows
from public.athlete a join auth.users u on u.id = a.user_id
where lower(u.email) = lower('ATHLETE_EMAIL');

-- DELETE (run this block only after the preview shows the right person)
do $$
declare
  v_email   text := 'ATHLETE_EMAIL';
  v_confirm text := 'type DELETE here';
  v_user uuid;
  v_athlete uuid;
begin
  if v_confirm <> 'DELETE' then
    raise exception 'Nothing deleted. Change the confirmation to DELETE to go ahead.';
  end if;
  select u.id, a.id into v_user, v_athlete
  from auth.users u join public.athlete a on a.user_id = u.id
  where lower(u.email) = lower(btrim(v_email));
  if v_user is null then
    raise exception 'No athlete profile for the email "%". Nothing deleted.', v_email;
  end if;

  -- Do not write "deleted" rows into the history, because the history would then hold the very data being removed.
  perform set_config('app.skip_audit', '1', true);

  -- Removing the sign-in removes the app_user, the athlete and, by cascade, everything that belongs to the athlete.
  delete from auth.users where id = v_user;

  -- The history is not linked by a foreign key, so remove it explicitly.
  delete from public.change_history
  where athlete_id = v_athlete
     or (table_name = 'app_user' and record_id = v_user::text)
     or (table_name = 'athlete' and record_id = v_athlete::text);
end;
$$;
