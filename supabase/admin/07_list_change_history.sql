-- CHANGE HISTORY: who changed what, and when. Read-only. Two views; edit the values in each, run the one you need.

-- A. Changes about ONE athlete (by the athlete, a coordinator, or the dashboard), newest first.
--    "who" is a coordinator's name, "Athlete", or "Dashboard/system" (a change made here in the dashboard or by a rule).
select
  h.changed_at at time zone 'America/Chicago' as changed_at_chicago,
  coalesce(sp.first_name || ' ' || sp.last_name,
           case h.changed_by_role when 'athlete' then 'Athlete' when 'system' then 'Dashboard/system' else h.changed_by_role end) as who,
  h.table_name,
  h.change_type,
  h.old_values,
  h.new_values
from public.change_history h
join public.athlete a on a.id = h.athlete_id
join auth.users u on u.id = a.user_id
left join public.staff_profile sp on sp.user_id = h.changed_by
where lower(u.email) = lower('ATHLETE_EMAIL')
  and h.changed_at >= now() - interval '90 days'            -- how far back
order by h.changed_at desc
limit 200;

-- B. Edits to the SHARED college data by coordinators (not tied to any athlete), newest first.
select
  h.changed_at at time zone 'America/Chicago' as changed_at_chicago,
  coalesce(sp.first_name || ' ' || sp.last_name, h.changed_by_role) as who,
  h.table_name,
  coalesce(c.name, p.program_name, k.full_name) as record,
  h.change_type,
  h.old_values,
  h.new_values
from public.change_history h
left join public.staff_profile sp on sp.user_id = h.changed_by
left join public.college c on h.table_name = 'college' and c.unitid::text = h.record_id
left join public.college_program p on h.table_name = 'college_program' and p.id::text = h.record_id
left join public.college_coach k on h.table_name = 'college_coach' and k.id::text = h.record_id
where h.athlete_id is null
  and h.table_name in ('college', 'college_program', 'college_coach', 'college_major')
  and h.changed_by is not null                                -- skip the data load, which has no person
  and h.changed_at >= now() - interval '30 days'
order by h.changed_at desc
limit 200;
