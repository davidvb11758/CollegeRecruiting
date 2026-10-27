-- PILOT MEASURES: the success measures of MVP-DETAIL 12.6, read from the live data. Read-only.
-- Counts only: athletes appear as "Athlete 1", "Athlete 2" ... with no names. Use the roster in the app to see who is who.
-- Run it at the weekly check-in and at week 4. The first block holds the only values you may want to change.

with settings as (
  select
    array[]::text[] as leave_out,        -- emails of test or demo accounts to leave out, for example array['demo@example.com', 'test2@example.com']
    60              as min_profile_pct,  -- "finished profile" means at least this % of the 15 profile items are filled in
    5               as list_size,        -- colleges needed on the list
    10              as quick_minutes     -- "within about 10 minutes" of starting the profile
),
pilot as (
  select a.id as athlete_id, a.created_at as started_at,
         row_number() over (order by a.created_at, a.id) as n
  from public.athlete a
  join public.app_user au on au.user_id = a.user_id and au.role = 'athlete' and au.status = 'active'
  join auth.users u on u.id = a.user_id
  where lower(u.email) <> all (select lower(x) from unnest((select leave_out from settings)) x)
),
facts as (
  select
    p.*,
    coalesce(c.pct, 0) as profile_pct,
    exists (select 1 from public.athlete_preference ap where ap.athlete_id = p.athlete_id) as has_prefs,
    (select count(*) from public.athlete_college ac where ac.athlete_id = p.athlete_id and ac.archived_at is null) as list_count,
    (select min(x.created_at)
       from (select ac.created_at, row_number() over (order by ac.created_at, ac.id) as rn
               from public.athlete_college ac where ac.athlete_id = p.athlete_id) x
      where x.rn = (select list_size from settings)) as list_full_at,
    (select count(*) from public.activity_entry e where e.athlete_id = p.athlete_id and e.source = 'athlete' and e.deleted_at is null) as activities,
    (select count(*) from public.activity_entry e where e.athlete_id = p.athlete_id and e.deleted_at is null and e.direction = 'they_contacted') as replies,
    (select count(*) from public.next_step s where s.athlete_id = p.athlete_id and s.status <> 'open') as steps_done,
    (select count(distinct w) from (
       select date_trunc('week', e.created_at at time zone 'America/Chicago') as w
         from public.activity_entry e where e.athlete_id = p.athlete_id and e.source = 'athlete' and e.deleted_at is null
       union all
       select date_trunc('week', s.created_at at time zone 'America/Chicago')
         from public.next_step s where s.athlete_id = p.athlete_id and s.created_source = 'athlete'
     ) x) as active_weeks,
    greatest(
      (select max(e.created_at) from public.activity_entry e where e.athlete_id = p.athlete_id and e.source = 'athlete' and e.deleted_at is null),
      (select max(s.created_at) from public.next_step s where s.athlete_id = p.athlete_id and s.created_source = 'athlete')
    ) as last_active
  from pilot p
  left join public.athlete_completeness c on c.athlete_id = p.athlete_id
),
graded as (
  select f.*,
    (f.profile_pct >= (select min_profile_pct from settings) and f.has_prefs and f.list_count >= (select list_size from settings)) as activated
  from facts f
),
staff as (
  select sp.user_id, sp.first_name || ' ' || sp.last_name as who
  from public.staff_profile sp
  join public.app_user au on au.user_id = sp.user_id and au.status = 'active'
  join auth.users u on u.id = sp.user_id
  where lower(u.email) <> all (select lower(x) from unnest((select leave_out from settings)) x)
),
measures as (
  -- 1. Activation
  select 10 as ord, '1 Activation' as section, 'Athletes signed up' as item, count(*)::text as result, '12 expected' as target, '' as met from graded
  union all
  select 11, '1 Activation', 'Finished profile, preferences and the college list',
         count(*) filter (where activated)::text, '8 or more', case when count(*) filter (where activated) >= 8 then 'yes' else 'not yet' end from graded
  union all
  select 12, '1 Activation', 'Of those, the list was full within ' || (select quick_minutes from settings) || ' minutes of starting',
         count(*) filter (where activated and list_full_at is not null and list_full_at - started_at <= make_interval(mins => (select quick_minutes from settings)))::text,
         'about 10 minutes', '' from graded
  union all
  select 13, '1 Activation', 'Of those, the list was full within 7 days of starting',
         count(*) filter (where activated and list_full_at is not null and list_full_at - started_at <= interval '7 days')::text, '', '' from graded
  union all
  select 14, '1 Activation', 'Median minutes from starting to a full list (finished athletes)',
         coalesce(round((percentile_cont(0.5) within group (order by extract(epoch from (list_full_at - started_at)) / 60.0)
                         filter (where activated and list_full_at is not null))::numeric)::text, '-'), '', '' from graded
  union all
  -- 2. Engagement
  select 20, '2 Engagement', 'Active in two or more different weeks (logged an activity or set a next step)',
         count(*) filter (where active_weeks >= 2)::text, '6 or more', case when count(*) filter (where active_weeks >= 2) >= 6 then 'yes' else 'not yet' end from graded
  union all
  select 21, '2 Engagement', 'Active in the last 7 days', count(*) filter (where last_active >= now() - interval '7 days')::text, '', '' from graded
  union all
  select 22, '2 Engagement', 'Activities logged by athletes', coalesce(sum(activities), 0)::text, '', '' from graded
  union all
  select 23, '2 Engagement', 'Coach replies logged', coalesce(sum(replies), 0)::text, '', '' from graded
  union all
  select 24, '2 Engagement', 'Next steps completed', coalesce(sum(steps_done), 0)::text, '', '' from graded
  union all
  -- 3. Coordinators (one row each)
  select 30, '3 Coordinators', s.who,
         format('%s athlete edit(s), %s college edit(s)', ath.n, col.n),
         'at least 1 of each', case when ath.n >= 1 and col.n >= 1 then 'yes' else 'not yet' end
  from staff s
  cross join lateral (select count(*) as n from public.change_history h
                       where h.changed_by = s.user_id and h.athlete_id is not null) ath
  cross join lateral (select count(*) as n from public.change_history h
                       where h.changed_by = s.user_id and h.athlete_id is null
                         and h.table_name in ('college', 'college_program', 'college_coach', 'college_major')) col
  union all
  select 39, '3 Coordinators', 'Roster use', 'not recorded', 'ask at the check-in', ''
  union all
  -- 4. Safety (should all read 0)
  select 40, '4 Safety', 'Edits by a coordinator on an athlete who was not assigned to them',
         count(*)::text, '0 (if not 0, check by hand: an assignment may have been removed since)', case when count(*) = 0 then 'ok' else 'CHECK' end
  from public.change_history h
  join public.app_user au on au.user_id = h.changed_by and au.role = 'staff'
  where h.athlete_id is not null
    and not exists (select 1 from public.athlete_staff_assignment sa where sa.athlete_id = h.athlete_id and sa.staff_user_id = h.changed_by)
  union all
  select 41, '4 Safety', 'Athlete-made edits recorded against a different athlete',
         count(*)::text, '0', case when count(*) = 0 then 'ok' else 'CHECK' end
  from public.change_history h
  where h.changed_by_role = 'athlete' and h.athlete_id is not null
    and not exists (select 1 from public.athlete a where a.id = h.athlete_id and a.user_id = h.changed_by)
  union all
  select 42, '4 Safety', 'Disabled accounts', count(*)::text, '', '' from public.app_user where status = 'disabled'
  union all
  -- 5. One line per athlete, no names
  select 100 + n::int, '5 Per athlete', 'Athlete ' || n,
         format('profile %s%%, preferences %s, %s on list, %s activities, active in %s week(s)',
                profile_pct, case when has_prefs then 'yes' else 'no' end, list_count, activities, active_weeks),
         '', case when activated then 'finished' else 'not yet' end
  from graded
)
select section, item, result, target, met from measures order by ord;
