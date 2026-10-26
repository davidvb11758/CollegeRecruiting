-- WP2 step 7: views the screens read. EVERY view is created with security_invoker = true so it runs with the
-- caller's rights and row-level security still applies (a normal view would run as its owner and bypass RLS).
-- program_competitiveness (the band view) was created in step 3.

-- Find Colleges: one row per program with everything the filters need.
create view public.program_search with (security_invoker = true) as
select
  p.id as program_id,
  p.unitid,
  c.name as college_name,
  p.program_name,
  c.city,
  c.state,
  p.division_code,
  d.label as division_label,
  cf.name as conference,
  c.control,
  c.campus_setting,
  c.enrollment,
  case
    when c.enrollment is null then null
    when c.enrollment < 3000 then 'small'
    when c.enrollment < 10000 then 'medium'
    else 'large'
  end as size_band,
  c.selectivity,
  c.tuition_in_state,
  c.tuition_out_state,
  c.latitude,
  c.longitude,
  c.website_url,
  c.cost_url,
  p.program_url,
  p.questionnaire_url,
  pc.division_rank,
  pc.band as competitiveness_band,
  p.status,
  p.last_verified_on,
  coalesce(
    (select array_agg(cm.major_code order by cm.major_code) from public.college_major cm where cm.unitid = c.unitid),
    '{}'::text[]
  ) as major_codes
from public.college_program p
join public.college c on c.unitid = p.unitid
join public.division d on d.code = p.division_code
left join public.conference cf on cf.id = p.conference_id
left join public.program_competitiveness pc on pc.program_id = p.id;

-- My College List: the list entry with the college, last real activity (system entries excluded), the open next
-- step, and how many days it has been quiet.
create view public.my_list with (security_invoker = true) as
select
  ac.id as list_id,
  ac.athlete_id,
  ac.program_id,
  p.unitid,
  c.name as college_name,
  p.program_name,
  c.city,
  c.state,
  p.division_code,
  ac.priority,
  ac.stage,
  ac.closed_reason,
  ac.added_on,
  ac.main_coach_id,
  ac.questionnaire_completed_on,
  ac.archived_at,
  la.last_activity_date,
  ns.id as next_step_id,
  ns.description as next_step_description,
  ns.due_date as next_step_due_date,
  (private.club_today() - coalesce(la.last_activity_date, ac.added_on)) as days_silent
from public.athlete_college ac
join public.college_program p on p.id = ac.program_id
join public.college c on c.unitid = p.unitid
left join lateral (
  select max(a.activity_date) as last_activity_date
  from public.activity_entry a
  where a.athlete_college_id = ac.id and a.deleted_at is null and a.source <> 'system'
) la on true
left join lateral (
  select n.id, n.description, n.due_date
  from public.next_step n
  where n.athlete_college_id = ac.id and n.status = 'open'
  limit 1
) ns on true;

-- Open next steps grouped overdue / this week / later, in the club time zone.
create view public.next_steps_due with (security_invoker = true) as
select
  n.id as next_step_id,
  n.athlete_id,
  n.athlete_college_id as list_id,
  c.name as college_name,
  n.description,
  n.due_date,
  n.step_type_code,
  n.created_source,
  case
    when n.due_date < private.club_today() then 'overdue'
    when n.due_date <= private.club_today() + 7 then 'this_week'
    else 'later'
  end as bucket
from public.next_step n
join public.athlete_college ac on ac.id = n.athlete_college_id and ac.archived_at is null
join public.college_program p on p.id = ac.program_id
join public.college c on c.unitid = p.unitid
where n.status = 'open';

-- Profile completeness: how many of the 15 "complete profile" items are filled. Required fields are not counted
-- because the database already guarantees them.
create view public.athlete_completeness with (security_invoker = true) as
select
  a.id as athlete_id,
  x.filled,
  x.total,
  round(100.0 * x.filled / x.total)::integer as pct
from public.athlete a
left join public.athlete_athletic aa on aa.athlete_id = a.id
left join public.athlete_academic ac on ac.athlete_id = a.id
left join public.athlete_preference ap on ap.athlete_id = a.id
cross join lateral (
  select
    (coalesce(btrim(a.home_city), '') <> '')::integer
    + (a.home_zip is not null)::integer
    + (aa.athlete_id is not null)::integer
    + (aa.height_in is not null)::integer
    + (coalesce(btrim(aa.club_team_name), '') <> '')::integer
    + (coalesce(btrim(aa.club_coach_name), '') <> '')::integer
    + (coalesce(btrim(ac.hs_name), '') <> '')::integer
    + (coalesce(btrim(ac.hs_city), '') <> '')::integer
    + (ac.hs_state is not null)::integer
    + (ac.gpa_unweighted is not null)::integer
    + (coalesce(ac.major_undecided, false)
       or exists (select 1 from public.athlete_major m where m.athlete_id = a.id and m.kind = 'intended'))::integer
    + (ap.athlete_id is not null)::integer
    + exists (select 1 from public.athlete_target_division td where td.athlete_id = a.id)::integer
    + exists (select 1 from public.athlete_video_link v where v.athlete_id = a.id)::integer
    + exists (select 1 from public.athlete_guardian g where g.athlete_id = a.id and g.email is not null)::integer
    as filled,
    15 as total
) x;

-- Coordinator roster. Row-level security on athlete limits staff to their assigned athletes (admin sees all).
create view public.staff_roster with (security_invoker = true) as
select
  a.id as athlete_id,
  a.first_name,
  a.last_name,
  t.name as team_name,
  a.graduation_year,
  comp.pct as profile_pct,
  (select count(*) from public.athlete_college ac where ac.athlete_id = a.id and ac.archived_at is null) as colleges_count,
  (select max(e.activity_date) from public.activity_entry e
    where e.athlete_id = a.id and e.deleted_at is null and e.source <> 'system') as last_activity_date,
  (select count(*) from public.next_step n
    where n.athlete_id = a.id and n.status = 'open' and n.due_date < private.club_today()) as overdue_count
from public.athlete a
join public.team t on t.id = a.team_id
join public.athlete_completeness comp on comp.athlete_id = a.id;
