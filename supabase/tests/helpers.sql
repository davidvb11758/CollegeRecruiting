-- Shared test helpers. Not a test file: the runner (scripts/db-test.mjs) and the dry run put this in front of every
-- *.test.sql inside the same transaction, so everything here is rolled back with the test. Test files start with
-- "begin;" and end with "rollback;".

create schema if not exists tests;
-- The act-as helpers switch role in the middle of a function and must still be able to call the next helper.
grant usage on schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Data builders (run as the database owner, so row-level security does not apply to them)
-- ---------------------------------------------------------------------------------------------

create function tests.mk_user(p_email text) returns uuid language plpgsql as $f$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into private.secret_setting (key, value) values ('signup_code', 'test-code')
  on conflict (key) do update set value = excluded.value;
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (v_id, p_email,
          jsonb_build_object('pilot_code', 'Test-Code', 'acknowledged', true, 'display_name', 'Test User'),
          'authenticated', 'authenticated');
  return v_id;
end;
$f$;

create function tests.mk_athlete(p_email text, p_dob date default (current_date - interval '16 years')::date) returns uuid
language plpgsql as $f$
declare
  v_id uuid;
begin
  insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
  values (tests.mk_user(p_email), (select t.id from public.team t limit 1), 'Test', 'Athlete', p_dob, 2028, 'IA')
  returning id into v_id;
  return v_id;
end;
$f$;

create function tests.mk_program(p_n integer, p_division text default 'NCAA_D3', p_rank integer default null,
                                 p_season text default null) returns bigint
language plpgsql as $f$
declare
  v_id bigint;
begin
  insert into public.college (unitid, name, state) values (900000 + p_n, 'Test College ' || p_n, 'IA');
  insert into public.college_program (unitid, division_code, program_name, division_rank, division_rank_season)
  values (900000 + p_n, p_division, 'Test College ' || p_n, p_rank, p_season)
  returning id into v_id;
  return v_id;
end;
$f$;

create function tests.mk_list_entry(p_athlete uuid, p_program bigint) returns uuid language plpgsql as $f$
declare
  v_id uuid;
begin
  insert into public.athlete_college (athlete_id, program_id) values (p_athlete, p_program) returning id into v_id;
  return v_id;
end;
$f$;

-- A staff or admin login (a normal sign-up promoted by the owner, as in the dashboard).
create function tests.mk_staff(p_email text, p_role public.user_role default 'staff') returns uuid language plpgsql as $f$
declare
  v_id uuid := tests.mk_user(p_email);
begin
  update public.app_user set role = p_role where user_id = v_id;
  insert into public.staff_profile (user_id, first_name, last_name) values (v_id, 'Coach', p_email);
  return v_id;
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Acting as a signed-in or signed-out user. Row-level security applies to everything run in between.
-- ---------------------------------------------------------------------------------------------

create function tests.start_as(p_user uuid, p_role text default 'authenticated') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
                     case when p_user is null then '' else jsonb_build_object('sub', p_user, 'role', p_role)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute format('set local role %I', p_role);
end;
$f$;

create function tests.stop_as() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$f$;

-- Run a query that returns one number as that user (a count, usually).
create function tests.q_count(p_user uuid, p_sql text, p_role text default 'authenticated') returns bigint language plpgsql as $f$
declare
  v bigint;
begin
  perform tests.start_as(p_user, p_role);
  begin
    execute p_sql into v;
  exception when others then
    perform tests.stop_as();
    raise;
  end;
  perform tests.stop_as();
  return v;
end;
$f$;

-- Run an insert/update/delete as that user and return how many rows it touched (0 when row-level security hid them).
create function tests.q_affected(p_user uuid, p_sql text, p_role text default 'authenticated') returns bigint language plpgsql as $f$
declare
  v bigint;
begin
  perform tests.start_as(p_user, p_role);
  begin
    execute p_sql;
    get diagnostics v = row_count;
  exception when others then
    perform tests.stop_as();
    raise;
  end;
  perform tests.stop_as();
  return v;
end;
$f$;

-- True when the statement raises any error as that user (permission denied, policy violation, rule violation).
create function tests.q_fails(p_user uuid, p_sql text, p_role text default 'authenticated') returns boolean language plpgsql as $f$
declare
  v_failed boolean := false;
begin
  perform tests.start_as(p_user, p_role);
  begin
    execute p_sql;
  exception when others then
    v_failed := true;
  end;
  perform tests.stop_as();
  return v_failed;
end;
$f$;

-- Run a query that returns one text value as that user.
create function tests.q_text(p_user uuid, p_sql text, p_role text default 'authenticated') returns text language plpgsql as $f$
declare
  v text;
begin
  perform tests.start_as(p_user, p_role);
  begin
    execute p_sql into v;
  exception when others then
    perform tests.stop_as();
    raise;
  end;
  perform tests.stop_as();
  return v;
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- A small world for the security tests:
--   athletes A and B (each with a college on their list, a log entry, an open next step),
--   staff S (assigned to A only), staff T (assigned to nobody), admin X, and a user with no athlete record (Z).
-- Ids are kept in tests.ids so a test can look them up.
-- ---------------------------------------------------------------------------------------------

create function tests.world() returns void language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('a@example.com');
  v_b uuid := tests.mk_athlete('b@example.com');
  v_s uuid := tests.mk_staff('s@example.com');
  v_t uuid := tests.mk_staff('t@example.com');
  v_x uuid := tests.mk_staff('x@example.com', 'admin');
  v_z uuid := tests.mk_user('z@example.com');
  v_p1 bigint := tests.mk_program(1);
  v_p2 bigint := tests.mk_program(2);
  v_la uuid := tests.mk_list_entry(v_a, v_p1);
  v_lb uuid := tests.mk_list_entry(v_b, v_p2);
  v_ea uuid;
  v_eb uuid;
  v_na uuid;
  v_nb uuid;
  v_master bigint;
  v_private bigint;
begin
  create table tests.ids (k text primary key, v text not null);

  insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (v_a, v_s);

  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary)
  values (v_a, v_la, 'other_note', 'A note') returning id into v_ea;
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary)
  values (v_b, v_lb, 'other_note', 'B note') returning id into v_eb;

  insert into public.next_step (athlete_id, athlete_college_id, description, due_date)
  values (v_a, v_la, 'A step', current_date + 3) returning id into v_na;
  insert into public.next_step (athlete_id, athlete_college_id, description, due_date)
  values (v_b, v_lb, 'B step', current_date + 3) returning id into v_nb;

  insert into public.college_coach (program_id, full_name, title) values (v_p1, 'Master Coach', 'head') returning id into v_master;
  insert into public.college_coach (program_id, full_name, title, owner_athlete_id) values (v_p1, 'Private Coach of A', 'assistant', v_a)
  returning id into v_private;

  insert into public.athlete_guardian (athlete_id, relationship, full_name) values (v_a, 'mother', 'Mom A'), (v_b, 'mother', 'Mom B');

  insert into tests.ids (k, v) values
    ('athlete_a', v_a::text), ('athlete_b', v_b::text),
    ('user_a', (select user_id::text from public.athlete where id = v_a)),
    ('user_b', (select user_id::text from public.athlete where id = v_b)),
    ('staff_s', v_s::text), ('staff_t', v_t::text), ('admin_x', v_x::text), ('user_z', v_z::text),
    ('program_1', v_p1::text), ('program_2', v_p2::text),
    ('list_a', v_la::text), ('list_b', v_lb::text),
    ('entry_a', v_ea::text), ('entry_b', v_eb::text),
    ('step_a', v_na::text), ('step_b', v_nb::text),
    ('coach_master', v_master::text), ('coach_private_a', v_private::text);
end;
$f$;

create function tests.gid(p_key text) returns uuid language plpgsql stable as $f$
begin
  return (select v::uuid from tests.ids where k = p_key);
end;
$f$;

create function tests.bid(p_key text) returns bigint language plpgsql stable as $f$
begin
  return (select v::bigint from tests.ids where k = p_key);
end;
$f$;
