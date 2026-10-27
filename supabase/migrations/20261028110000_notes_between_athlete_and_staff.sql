-- Notes and questions between an athlete and their coordinators.
--
-- One conversation per athlete: the athlete and every coordinator assigned to them (and an administrator) can read all of it.
-- A note from the athlete is for the athlete's assigned coordinators; a note from a coordinator is for the athlete.
-- Each recipient sees a new note on their home screen until they dismiss it; dismissing is per person.
-- Notes cannot be edited or deleted through the app (no update or delete rights). They go when the athlete is deleted.

create table public.athlete_note (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  sender text not null check (sender in ('athlete', 'staff')),
  sender_user_id uuid not null,
  kind text not null default 'note' check (kind in ('note', 'question')),
  body text not null check (btrim(body) <> '' and length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index athlete_note_athlete_idx on public.athlete_note (athlete_id, created_at desc);

create table public.athlete_note_dismissal (
  note_id uuid not null references public.athlete_note (id) on delete cascade,
  user_id uuid not null references public.app_user (user_id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

-- The sender label and author come from the caller's real role, never from the request.
create function private.athlete_note_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.sender_user_id := auth.uid();
    new.sender := case when private.is_staff() then 'staff' else 'athlete' end;
  end if;
  new.body := btrim(new.body);
  return new;
end;
$$;

create trigger athlete_note_guard before insert on public.athlete_note
for each row execute function private.athlete_note_guard();

alter table public.athlete_note enable row level security;
alter table public.athlete_note_dismissal enable row level security;

-- Same access as the rest of the athlete's data: the athlete, their assigned coordinators and administrators.
create policy athlete_note_select on public.athlete_note for select to authenticated
  using (private.can_access_athlete(athlete_id));
create policy athlete_note_insert on public.athlete_note for insert to authenticated
  with check (private.can_access_athlete(athlete_id));

-- A person reads and writes only their own dismissals, and only for notes they can see.
create policy athlete_note_dismissal_select on public.athlete_note_dismissal for select to authenticated
  using (user_id = (select auth.uid()));
create policy athlete_note_dismissal_insert on public.athlete_note_dismissal for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.athlete_note n where n.id = note_id)
  );

-- Only the content can be supplied; the sender, author and time are set by the database.
grant select on public.athlete_note to authenticated;
grant insert (athlete_id, kind, body) on public.athlete_note to authenticated;
grant select on public.athlete_note_dismissal to authenticated;
grant insert (note_id, user_id) on public.athlete_note_dismissal to authenticated;

-- The conversation as the signed-in person sees it. for_me: the note is addressed to me (a coordinator's note to the
-- athlete, or the athlete's note to the coordinators assigned to them). dismissed: I have dismissed it.
create view public.note_thread with (security_invoker = true) as
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
  exists (select 1 from public.athlete_note_dismissal d where d.note_id = n.id and d.user_id = auth.uid()) as dismissed
from public.athlete_note n
join public.athlete a on a.id = n.athlete_id
left join public.staff_profile sp on sp.user_id = n.sender_user_id;

grant select on public.note_thread to authenticated;
