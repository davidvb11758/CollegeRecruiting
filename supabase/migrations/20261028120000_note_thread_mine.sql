-- The conversation view also says which notes the signed-in person wrote ("You"), appended as the last column so every
-- existing column keeps its position. A dismissal takes the signed-in person by default.

create or replace view public.note_thread with (security_invoker = true) as
select
  n.id as note_id,
  n.athlete_id,
  n.sender,
  n.kind,
  n.body,
  n.created_at,
  a.first_name || ' ' || a.last_name as athlete_name,
  case n.sender
    when 'athlete' then a.first_name || ' ' || a.last_name
    else coalesce(nullif(btrim(sp.first_name || ' ' || sp.last_name), ''), 'Coordinator')
  end as sender_name,
  (
    (n.sender = 'staff' and a.user_id = auth.uid())
    or (n.sender = 'athlete' and exists (
      select 1 from public.athlete_staff_assignment s where s.athlete_id = n.athlete_id and s.staff_user_id = auth.uid()
    ))
  ) as for_me,
  exists (select 1 from public.athlete_note_dismissal d where d.note_id = n.id and d.user_id = auth.uid()) as dismissed,
  (n.sender_user_id = auth.uid()) as mine
from public.athlete_note n
join public.athlete a on a.id = n.athlete_id
left join public.staff_profile sp on sp.user_id = n.sender_user_id;

alter table public.athlete_note_dismissal alter column user_id set default auth.uid();
