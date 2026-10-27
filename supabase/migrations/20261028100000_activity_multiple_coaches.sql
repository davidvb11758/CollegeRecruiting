-- An activity entry can name several coaches ("I emailed the head coach and copied the assistant").
-- coach_ids replaces the single coach_id. Existing entries keep their coach.

alter table public.activity_entry
  add column coach_ids bigint[] not null default '{}'
  check (cardinality(coach_ids) <= 10);

update public.activity_entry set coach_ids = array[coach_id] where coach_id is not null;

alter table public.activity_entry drop column coach_id;

-- Same rules as before, for every coach in the list: it must exist, be visible to the caller, belong to the college's
-- program and, for a private contact, belong to this athlete. A repeated coach is stored once, in the order given.
create or replace function private.activity_entry_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('app.system_entry', true), '') = '1';
  v_requires_direction boolean;
  v_program bigint;
begin
  if tg_op = 'INSERT' then
    if v_system then
      new.source := 'system';
      new.entered_by := auth.uid();
    elsif auth.uid() is not null then
      -- Signed-in users cannot choose their label: it comes from their real role.
      new.source := case when private.is_staff() then 'staff' else 'athlete' end;
      new.entered_by := auth.uid();
    end if;
    if new.activity_type_code = 'system' and not v_system then
      raise exception 'System entries are written by the database only' using errcode = '42501';
    end if;
  else
    if old.source = 'system' and not v_system then
      raise exception 'System entries cannot be changed' using errcode = '42501';
    end if;
    if new.athlete_id <> old.athlete_id or new.athlete_college_id <> old.athlete_college_id
       or new.source <> old.source or new.entered_by is distinct from old.entered_by then
      raise exception 'Entry owner, list entry and author cannot be changed' using errcode = '23514';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_by := coalesce(auth.uid(), new.deleted_by);
    end if;
  end if;

  if new.activity_date > private.club_today() + 1 then
    raise exception 'The activity date cannot be in the future' using errcode = '23514';
  end if;

  select t.requires_direction into v_requires_direction from public.activity_type t where t.code = new.activity_type_code;
  if coalesce(v_requires_direction, false) and new.direction is null then
    raise exception 'Direction is required for this activity type' using errcode = '23514';
  end if;

  if cardinality(new.coach_ids) > 0 then
    new.coach_ids := array(
      select x.id from unnest(new.coach_ids) with ordinality as x(id, pos) group by x.id order by min(x.pos)
    );
    select c.program_id into v_program from public.athlete_college c where c.id = new.athlete_college_id;
    if exists (
      select 1
      from unnest(new.coach_ids) as x(id)
      left join public.college_coach k on k.id = x.id
      where k.id is null
         or k.program_id is distinct from v_program
         or (k.owner_athlete_id is not null and k.owner_athlete_id <> new.athlete_id)
    ) then
      raise exception 'Every coach must belong to the same program' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- When a coach contact is deleted (an athlete removing their own contact), take the coach out of the entries that named
-- them, as the old single-coach column did.
create function private.forget_deleted_coach() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.activity_entry set coach_ids = array_remove(coach_ids, old.id) where old.id = any (coach_ids);
  return null;
end;
$$;

revoke all on function private.forget_deleted_coach() from public;

create trigger forget_deleted_coach after delete on public.college_coach
for each row execute function private.forget_deleted_coach();
