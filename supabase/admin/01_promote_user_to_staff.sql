-- PROMOTE A SIGN-UP TO CLUB STAFF (or administrator).
-- The person signs up first, like anyone else, using the shared sign-up code. Then you run this once.
-- Edit the values in the first block (and the email again at the bottom), run the whole script, and read the result.
-- They must sign out and sign in again to see the staff screens.
--
-- Roles: 'staff' = recruiting coordinator or team coach; 'admin' = the club administrator (sees every athlete).
-- A person who has an athlete profile cannot be promoted (staff need their own sign-up with a different email).

do $$
declare
  v_email text := 'COORDINATOR_EMAIL';                 -- the email they signed up with
  v_first text := 'FIRST_NAME';
  v_last  text := 'LAST_NAME';
  v_title text := 'Recruiting Coordinator';            -- 'Recruiting Coordinator', 'Team Coach' or 'Director'
  v_role  public.user_role := 'staff';                 -- 'staff' or 'admin'
  v_team  text := 'Iowa Rockets 16R';                  -- the team they work with
  v_user  uuid;
  v_team_id uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));
  if v_user is null then
    raise exception 'No account with the email "%". Ask them to sign up first, or fix the email above.', v_email;
  end if;
  if exists (select 1 from public.athlete where user_id = v_user) then
    raise exception '% has an athlete profile. Staff need their own sign-up with a different email.', v_email;
  end if;
  select id into v_team_id from public.team where name = v_team;
  if v_team_id is null then
    raise exception 'No team named "%". Check the spelling, or create the team first (02_create_team.sql).', v_team;
  end if;

  update public.app_user set role = v_role, status = 'active' where user_id = v_user;

  insert into public.staff_profile (user_id, first_name, last_name, title, email)
  values (v_user, btrim(v_first), btrim(v_last), v_title, lower(btrim(v_email)))
  on conflict (user_id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name, title = excluded.title, email = excluded.email, active = true;

  insert into public.staff_team (staff_user_id, team_id) values (v_user, v_team_id) on conflict do nothing;
end;
$$;

-- Check: the person should now show as staff (or admin) with their name and team. Put the same email below.
select u.email, au.role, au.status, sp.first_name || ' ' || sp.last_name as name, sp.title, t.name as team
from auth.users u
join public.app_user au on au.user_id = u.id
left join public.staff_profile sp on sp.user_id = u.id
left join public.staff_team st on st.staff_user_id = u.id
left join public.team t on t.id = st.team_id
where lower(u.email) = lower('COORDINATOR_EMAIL');
