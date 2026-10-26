-- WP2 step 6: change history (audit) written only by triggers. Insert-only: no policy will ever allow the app to
-- insert, update or delete these rows. Covers athlete-owned tables, account/role changes, assignments, and the
-- shared college data that staff may edit.

create table public.change_history (
  id bigint generated always as identity primary key,
  athlete_id uuid,                       -- null for master-data and account changes; no foreign key so history outlives edits
  table_name text not null,
  record_id text not null,
  change_type public.change_type not null,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,                       -- null when run from the dashboard or a load script
  changed_by_role text not null default 'system',
  changed_at timestamptz not null default now()
);

create index change_history_athlete_idx on public.change_history (athlete_id, changed_at desc) where athlete_id is not null;
create index change_history_record_idx on public.change_history (table_name, record_id);
create index change_history_changed_at_idx on public.change_history (changed_at desc);

-- Generic audit trigger. Arguments: (1) column that holds the athlete id, or '' for none;
-- (2) comma-separated primary-key columns used to build the record id.
-- Set `app.skip_audit` = '1' for the current transaction to skip auditing (bulk loads only).
create function private.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_athlete uuid;
  v_record text;
  v_type public.change_type;
  v_changed_old jsonb;
  v_changed_new jsonb;
  v_role text;
  v_col text;
  v_parts text[] := '{}';
begin
  if coalesce(current_setting('app.skip_audit', true), '') = '1' then
    return null;
  end if;

  if coalesce(tg_argv[0], '') <> '' then
    v_athlete := nullif(v_row ->> tg_argv[0], '')::uuid;
  end if;
  foreach v_col in array string_to_array(tg_argv[1], ',') loop
    v_parts := v_parts || coalesce(v_row ->> btrim(v_col), '');
  end loop;
  v_record := array_to_string(v_parts, ',');

  if tg_op = 'INSERT' then
    v_type := 'created';
    v_changed_new := v_new;
  elsif tg_op = 'DELETE' then
    v_type := 'deleted';
    v_changed_old := v_old;
  else
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, v_old -> n.key)
    into v_changed_new, v_changed_old
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'updated_by') and (v_old -> n.key) is distinct from n.value;

    if v_changed_new is null then
      return null;                      -- nothing but bookkeeping columns changed
    end if;
    v_type := case
      when (v_changed_new ? 'archived_at' and v_new ->> 'archived_at' is null)
        or (v_changed_new ? 'deleted_at' and v_new ->> 'deleted_at' is null) then 'restored'
      when (v_changed_new ? 'archived_at' and v_new ->> 'archived_at' is not null)
        or (v_changed_new ? 'deleted_at' and v_new ->> 'deleted_at' is not null) then 'deleted'
      else 'updated'
    end;
  end if;

  select u.role::text into v_role from public.app_user u where u.user_id = auth.uid();

  insert into public.change_history (athlete_id, table_name, record_id, change_type, old_values, new_values, changed_by, changed_by_role)
  values (v_athlete, tg_table_name, v_record, v_type, v_changed_old, v_changed_new, auth.uid(), coalesce(v_role, 'system'));

  return null;
end;
$$;

-- table, athlete-id column, primary-key columns
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('app_user',                  '',                 'user_id'),
      ('athlete',                   'id',               'id'),
      ('athlete_athletic',          'athlete_id',       'athlete_id'),
      ('athlete_academic',          'athlete_id',       'athlete_id'),
      ('athlete_preference',        'athlete_id',       'athlete_id'),
      ('athlete_target_division',   'athlete_id',       'athlete_id,division_code'),
      ('athlete_major',             'athlete_id',       'athlete_id,major_code,kind'),
      ('athlete_guardian',          'athlete_id',       'id'),
      ('athlete_video_link',        'athlete_id',       'id'),
      ('athlete_staff_assignment',  'athlete_id',       'id'),
      ('athlete_college',           'athlete_id',       'id'),
      ('activity_entry',            'athlete_id',       'id'),
      ('next_step',                 'athlete_id',       'id'),
      ('college',                   '',                 'unitid'),
      ('college_program',           '',                 'id'),
      ('college_coach',             'owner_athlete_id', 'id'),
      ('college_major',             '',                 'unitid,major_code')
    ) as v(tbl, athlete_col, pk_cols)
  loop
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I for each row execute function private.audit_row(%L, %L)',
      r.tbl, r.athlete_col, r.pk_cols);
  end loop;
end;
$$;

alter table public.change_history enable row level security;
