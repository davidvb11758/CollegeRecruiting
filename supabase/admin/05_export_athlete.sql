-- EXPORT ONE ATHLETE'S DATA (for the family, or a backup of one record). Read-only.
-- Edit the email, run, then copy the single "export" cell (or use the dashboard's download button).
-- This is personal data about a minor. Send it only to the athlete's parent or guardian, by a private channel.

with a as (
  select a.* from public.athlete a join auth.users u on u.id = a.user_id where lower(u.email) = lower('ATHLETE_EMAIL')
)
select jsonb_pretty(jsonb_build_object(
  'exported_on', now(),
  'athlete', (select to_jsonb(a) from a),
  'athletic', (select to_jsonb(x) from public.athlete_athletic x where x.athlete_id = (select id from a)),
  'academic', (select to_jsonb(x) from public.athlete_academic x where x.athlete_id = (select id from a)),
  'preferences', (select to_jsonb(x) from public.athlete_preference x where x.athlete_id = (select id from a)),
  'target_divisions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.athlete_target_division x where x.athlete_id = (select id from a)),
  'majors', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.athlete_major x where x.athlete_id = (select id from a)),
  'guardians', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.athlete_guardian x where x.athlete_id = (select id from a)),
  'video_links', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.athlete_video_link x where x.athlete_id = (select id from a)),
  'college_list', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('college', c.name) order by c.name), '[]')
                     from public.athlete_college l
                     join public.college_program p on p.id = l.program_id
                     join public.college c on c.unitid = p.unitid
                    where l.athlete_id = (select id from a)),
  'activity_log', (select coalesce(jsonb_agg(to_jsonb(x) order by x.activity_date, x.created_at), '[]') from public.activity_entry x where x.athlete_id = (select id from a)),
  'next_steps', (select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date), '[]') from public.next_step x where x.athlete_id = (select id from a)),
  'own_coach_contacts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.college_coach x where x.owner_athlete_id = (select id from a)),
  'assigned_coordinators', (select coalesce(jsonb_agg(sp.first_name || ' ' || sp.last_name), '[]')
                              from public.athlete_staff_assignment s join public.staff_profile sp on sp.user_id = s.staff_user_id
                             where s.athlete_id = (select id from a))
)) as export
where exists (select 1 from a);

-- If the result is empty, there is no athlete profile for that email (check the spelling with 00_who_is_who.sql).
