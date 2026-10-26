-- WP2 step 5: My College List, the dated activity log, and next steps (reminders), with their rules.
-- Rules in this file: 30-college cap, one open next step per college, stage/priority changes write a system
-- entry, authorship and source set by the database (never the browser), direction required for contacts.

-- ---------------------------------------------------------------------------------------------
-- My College List
-- ---------------------------------------------------------------------------------------------

create table public.athlete_college (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  program_id bigint not null references public.college_program (id),
  priority smallint not null default 3 check (priority between 1 and 4),
  stage public.list_stage not null default 'researching',
  closed_reason public.closed_reason,
  added_on date not null default private.club_today(),
  why_i_like_text text check (why_i_like_text is null or length(why_i_like_text) <= 2000),
  notes_text text check (notes_text is null or length(notes_text) <= 5000),
  main_coach_id bigint references public.college_coach (id) on delete set null,
  questionnaire_completed_on date,
  archived_at timestamptz,
  added_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, program_id),
  unique (id, athlete_id),
  check ((stage = 'closed') = (closed_reason is not null))
);

create index athlete_college_athlete_idx on public.athlete_college (athlete_id) where archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------------------------

create table public.activity_entry (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  athlete_college_id uuid not null,
  activity_date date not null default private.club_today() check (activity_date >= date '2020-01-01'),
  activity_time time,
  activity_type_code text not null references public.activity_type (code),
  direction public.activity_direction,
  coach_id bigint references public.college_coach (id) on delete set null,
  coach_name_text text,
  summary text not null check (btrim(summary) <> '' and length(summary) <= 200),
  details_text text check (details_text is null or length(details_text) <= 4000),
  outcome public.activity_outcome,
  follow_up_needed boolean not null default false,
  attachment_url text check (attachment_url is null or attachment_url ~* '^https?://'),
  source public.entry_source not null default 'athlete',
  entered_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The composite key keeps athlete_id honest: it must equal the list entry's athlete_id.
  foreign key (athlete_college_id, athlete_id) references public.athlete_college (id, athlete_id) on delete cascade
);

create index activity_entry_athlete_idx on public.activity_entry (athlete_id);
create index activity_entry_college_idx on public.activity_entry (athlete_college_id, activity_date desc) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Next steps (reminders)
-- ---------------------------------------------------------------------------------------------

create table public.next_step (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  athlete_college_id uuid not null,
  description text not null check (btrim(description) <> '' and length(description) <= 200),
  due_date date not null,
  step_type_code text references public.next_step_type (code),
  status public.next_step_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid,
  snooze_until date,
  created_source public.entry_source not null default 'athlete',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open') = (completed_at is null)),
  check (snooze_until is null or snooze_until >= due_date),
  foreign key (athlete_college_id, athlete_id) references public.athlete_college (id, athlete_id) on delete cascade
);

create index next_step_athlete_idx on public.next_step (athlete_id);
-- At most one OPEN next step per list entry; completed ones stay as history.
create unique index next_step_one_open_idx on public.next_step (athlete_college_id) where status = 'open';

-- ---------------------------------------------------------------------------------------------
-- System entries. Only this function may write source = 'system'; it flags the transaction so the activity
-- trigger below accepts the entry. Nobody can set the flag from the browser.
-- ---------------------------------------------------------------------------------------------

create function private.log_system_entry(p_list_id uuid, p_athlete_id uuid, p_summary text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.system_entry', '1', true);
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary)
  values (p_athlete_id, p_list_id, 'system', p_summary);
  perform set_config('app.system_entry', '', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- athlete_college rules
-- ---------------------------------------------------------------------------------------------

create function private.athlete_college_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap integer := coalesce((select s.value::integer from public.app_setting s where s.key = 'list_cap'), 30);
  v_coach_program bigint;
  v_coach_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if new.athlete_id <> old.athlete_id or new.program_id <> old.program_id then
      raise exception 'A list entry cannot be moved to another athlete or college' using errcode = '23514';
    end if;
  else
    new.added_by := coalesce(auth.uid(), new.added_by);
  end if;

  -- At most `list_cap` non-archived colleges per athlete.
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    if (select count(*) from public.athlete_college c
        where c.athlete_id = new.athlete_id and c.archived_at is null and c.id <> new.id) >= v_cap then
      raise exception 'The list is limited to % colleges. Archive one before adding another.', v_cap using errcode = '23514';
    end if;
  end if;

  -- The main coach must belong to the same program, and be a shared record or this athlete's own contact.
  if new.main_coach_id is not null then
    select k.program_id, k.owner_athlete_id into v_coach_program, v_coach_owner
    from public.college_coach k where k.id = new.main_coach_id;
    if v_coach_program is distinct from new.program_id or (v_coach_owner is not null and v_coach_owner <> new.athlete_id) then
      raise exception 'The main coach must be a coach of the same program' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger athlete_college_guard before insert or update on public.athlete_college
for each row execute function private.athlete_college_guard();

create function private.stage_label(p_stage public.list_stage) returns text
language sql immutable
set search_path = ''
as $$
  select initcap(replace(p_stage::text, '_', ' '));
$$;

-- Stage and priority changes (and adding to the list) write a system entry on the college's timeline.
create function private.athlete_college_log() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_system_entry(new.id, new.athlete_id, 'Added to My College List');
  else
    if new.stage is distinct from old.stage then
      perform private.log_system_entry(new.id, new.athlete_id,
        'Stage: ' || private.stage_label(old.stage) || ' to ' || private.stage_label(new.stage));
    end if;
    if new.priority is distinct from old.priority then
      perform private.log_system_entry(new.id, new.athlete_id, 'Priority: ' || old.priority || ' to ' || new.priority);
    end if;
  end if;
  return null;
end;
$$;

create trigger athlete_college_log after insert or update of stage, priority on public.athlete_college
for each row execute function private.athlete_college_log();

-- ---------------------------------------------------------------------------------------------
-- activity_entry rules
-- ---------------------------------------------------------------------------------------------

create function private.activity_entry_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('app.system_entry', true), '') = '1';
  v_requires_direction boolean;
  v_program bigint;
  v_coach_program bigint;
  v_coach_owner uuid;
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

  if new.coach_id is not null then
    select c.program_id into v_program from public.athlete_college c where c.id = new.athlete_college_id;
    select k.program_id, k.owner_athlete_id into v_coach_program, v_coach_owner from public.college_coach k where k.id = new.coach_id;
    if v_coach_program is distinct from v_program or (v_coach_owner is not null and v_coach_owner <> new.athlete_id) then
      raise exception 'The coach must belong to the same program' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_entry_guard before insert or update on public.activity_entry
for each row execute function private.activity_entry_guard();

-- ---------------------------------------------------------------------------------------------
-- next_step rules
-- ---------------------------------------------------------------------------------------------

create function private.next_step_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('app.system_entry', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if v_system then
      new.created_source := 'system';
    elsif auth.uid() is not null then
      new.created_source := case when private.is_staff() then 'staff' else 'athlete' end;
    end if;
    if new.status <> 'open' and new.completed_at is null then
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
  else
    if new.athlete_id <> old.athlete_id or new.athlete_college_id <> old.athlete_college_id
       or new.created_source <> old.created_source then
      raise exception 'Next step owner and source cannot be changed' using errcode = '23514';
    end if;
    if old.status = 'open' and new.status <> 'open' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(auth.uid(), new.completed_by);
    elsif old.status <> 'open' and new.status = 'open' then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger next_step_guard before insert or update on public.next_step
for each row execute function private.next_step_guard();

-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['athlete_college', 'activity_entry', 'next_step']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger set_authorship before insert or update on public.%I for each row execute function private.set_authorship()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
