-- WP7: Find Colleges can sort "by division, best ranked first". Divisions have a meaningful order (D1, D2, D3, NAIA, NJCAA)
-- that alphabetical order of the code does not give, so the view now carries the division's sort order.
-- Appended as the last column, so every existing column keeps its position and its meaning.
create or replace view public.program_search with (security_invoker = true) as
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
  ) as major_codes,
  d.sort_order as division_sort
from public.college_program p
join public.college c on c.unitid = p.unitid
join public.division d on d.code = p.division_code
left join public.conference cf on cf.id = p.conference_id
left join public.program_competitiveness pc on pc.program_id = p.id;
