-- ASSIGN ATHLETES TO A COORDINATOR. A coordinator sees only the athletes assigned to them (an administrator sees all).
-- Edit the coordinator's email and list the athletes' sign-in emails, then run the whole script.
-- 'primary'   = the athlete's main coordinator (only one per athlete; a new primary moves the old one to 'secondary').
-- 'secondary' = an extra coordinator who may also see and help the athlete.
--
-- To TAKE AN ATHLETE AWAY from a coordinator, use the last statement in this file.

do $$
declare
  v_coordinator text := 'COORDINATOR_EMAIL';
  v_athletes text[] := array['ATHLETE_EMAIL_1', 'ATHLETE_EMAIL_2'];   -- the athletes' sign-in emails
  v_role public.assignment_role := 'primary';                          -- 'primary' or 'secondary'
  v_staff uuid;
  v_email text;
  v_athlete uuid;
begin
  select u.id into v_staff
  from auth.users u join public.app_user au on au.user_id = u.id and au.role in ('staff', 'admin') and au.status = 'active'
  where lower(u.email) = lower(btrim(v_coordinator));
  if v_staff is null or not exists (select 1 from public.staff_profile where user_id = v_staff) then
    raise exception 'No active staff account with the email "%". Promote them first (01_promote_user_to_staff.sql).', v_coordinator;
  end if;

  foreach v_email in array v_athletes loop
    select a.id into v_athlete from public.athlete a join auth.users u on u.id = a.user_id where lower(u.email) = lower(btrim(v_email));
    if v_athlete is null then
      raise exception 'No athlete profile for the email "%". They must sign up and create their profile first.', v_email;
    end if;
    if v_role = 'primary' then
      update public.athlete_staff_assignment set role_on_athlete = 'secondary'
      where athlete_id = v_athlete and role_on_athlete = 'primary' and staff_user_id <> v_staff;
    end if;
    insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete)
    values (v_athlete, v_staff, v_role)
    on conflict (athlete_id, staff_user_id) do update set role_on_athlete = excluded.role_on_athlete;
  end loop;
end;
$$;

-- Check: every athlete with their coordinators.
select a.first_name || ' ' || a.last_name as athlete, u.email as athlete_email,
       sp.first_name || ' ' || sp.last_name as coordinator, s.role_on_athlete
from public.athlete a
join auth.users u on u.id = a.user_id
left join public.athlete_staff_assignment s on s.athlete_id = a.id
left join public.staff_profile sp on sp.user_id = s.staff_user_id
order by a.last_name, a.first_name, s.role_on_athlete;

-- TAKE AN ATHLETE AWAY FROM A COORDINATOR (remove the two dashes at the start of each line, edit the emails, run):
-- delete from public.athlete_staff_assignment
-- where athlete_id = (select a.id from public.athlete a join auth.users u on u.id = a.user_id where lower(u.email) = lower('ATHLETE_EMAIL'))
--   and staff_user_id = (select id from auth.users where lower(email) = lower('COORDINATOR_EMAIL'));
