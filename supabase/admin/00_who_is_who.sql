-- WHO IS WHO: everyone who can sign in, with role, status, athlete name and team, and each athlete's coordinators.
-- Read-only. Run it whenever you need to see the current accounts (for example before promoting or assigning).

select
  u.email,
  au.role,
  au.status,
  au.display_name,
  a.first_name || ' ' || a.last_name as athlete,
  t.name as team,
  a.graduation_year,
  (select string_agg(sp.first_name || ' ' || sp.last_name || ' (' || s.role_on_athlete::text || ')', ', ' order by s.role_on_athlete::text)
     from public.athlete_staff_assignment s
     join public.staff_profile sp on sp.user_id = s.staff_user_id
    where s.athlete_id = a.id) as coordinators,
  au.created_at::date as joined
from public.app_user au
join auth.users u on u.id = au.user_id
left join public.athlete a on a.user_id = au.user_id
left join public.team t on t.id = a.team_id
order by au.role, a.last_name nulls last, u.email;
