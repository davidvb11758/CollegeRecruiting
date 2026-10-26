-- WP2 constraint and trigger tests. House style: xUnit (see 00_smoke.test.sql). Runs against the linked project and
-- rolls back, so nothing is left behind. Each test_* function also runs in its own savepoint.
begin;

create schema if not exists tests;

-- Shared helpers (tests.mk_user, mk_athlete, mk_program, mk_list_entry, ...) come from supabase/tests/helpers.sql,
-- which the test runner adds in front of every test file.

-- ---------------------------------------------------------------------------------------------
-- Security basics
-- ---------------------------------------------------------------------------------------------

create function tests.test_rls_on_every_public_table() returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
    0, 'row-level security is enabled on every table in public');
end;
$f$;

create function tests.test_every_public_view_is_security_invoker() returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any (c.reloptions), false)),
    0, 'every view in public runs with the caller''s rights');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Sign-up gate
-- ---------------------------------------------------------------------------------------------

create function tests.test_signup_needs_the_code() returns setof text language plpgsql as $f$
begin
  insert into private.secret_setting (key, value) values ('signup_code', 'test-code')
  on conflict (key) do update set value = excluded.value;
  return next throws_ok(
    $q$insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), 'a@example.com', '{"acknowledged": true}', 'authenticated', 'authenticated')$q$,
    'P0001', 'Invalid sign-up code', 'sign-up without a code is rejected');
  return next throws_ok(
    $q$insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), 'b@example.com', '{"pilot_code": "wrong", "acknowledged": true}', 'authenticated', 'authenticated')$q$,
    'P0001', 'Invalid sign-up code', 'sign-up with the wrong code is rejected');
  return next throws_ok(
    $q$insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), 'c@example.com', '{"pilot_code": "test-code"}', 'authenticated', 'authenticated')$q$,
    'P0001', 'The acknowledgement must be accepted', 'sign-up without the acknowledgement is rejected');
end;
$f$;

create function tests.test_signup_fails_closed_when_no_code_is_set() returns setof text language plpgsql as $f$
begin
  delete from private.secret_setting where key = 'signup_code';
  return next throws_ok(
    $q$insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), 'd@example.com', '{"pilot_code": "", "acknowledged": true}', 'authenticated', 'authenticated')$q$,
    'P0001', 'Invalid sign-up code', 'with no code configured nobody can sign up');
end;
$f$;

create function tests.test_signup_creates_an_athlete_login() returns setof text language plpgsql as $f$
declare
  v_id uuid := tests.mk_user('new@example.com');
begin
  return next is((select role::text from public.app_user where user_id = v_id), 'athlete', 'new users are athletes');
  return next is((select status::text from public.app_user where user_id = v_id), 'active', 'new users are active');
  return next ok((select acknowledged_at is not null from public.app_user where user_id = v_id), 'acknowledgement time is stored');
end;
$f$;

create function tests.test_role_is_not_taken_from_metadata() returns setof text language plpgsql as $f$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into private.secret_setting (key, value) values ('signup_code', 'test-code')
  on conflict (key) do update set value = excluded.value;
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (v_id, 'sneaky@example.com', '{"pilot_code": "test-code", "acknowledged": true, "role": "admin"}', 'authenticated', 'authenticated');
  return next is((select role::text from public.app_user where user_id = v_id), 'athlete', 'a role in sign-up metadata is ignored');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Athlete rules
-- ---------------------------------------------------------------------------------------------

create function tests.test_athlete_must_be_14_to_18() returns setof text language plpgsql as $f$
begin
  return next throws_ok(
    $q$select tests.mk_athlete('young@example.com', (current_date - interval '12 years')::date)$q$,
    '23514', null, 'a 12-year-old is rejected');
  return next throws_ok(
    $q$select tests.mk_athlete('old@example.com', (current_date - interval '20 years')::date)$q$,
    '23514', null, 'a 20-year-old is rejected');
  return next lives_ok(
    $q$select tests.mk_athlete('ok14@example.com', (current_date - interval '14 years' - interval '1 day')::date)$q$,
    'a 14-year-old is accepted');
  return next lives_ok(
    $q$select tests.mk_athlete('ok18@example.com', (current_date - interval '18 years' - interval '1 day')::date)$q$,
    'an 18-year-old is accepted');
end;
$f$;

create function tests.test_child_list_limits() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('limits@example.com');
begin
  insert into public.athlete_guardian (athlete_id, relationship, full_name, is_primary) values (v_a, 'mother', 'Mom', true);
  insert into public.athlete_guardian (athlete_id, relationship, full_name) values (v_a, 'father', 'Dad');
  return next throws_ok(
    format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name) values (%L, 'other', 'Third')$q$, v_a),
    '23514', 'An athlete can have at most 2 guardians', 'a third guardian is rejected');
  return next throws_ok(
    format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name, is_primary) values (%L, 'other', 'Two primaries', true)$q$, v_a),
    '23514', null, 'the guardian limit applies before the primary rule');

  insert into public.athlete_video_link (athlete_id, url) values (v_a, 'https://example.com/1'), (v_a, 'https://example.com/2'), (v_a, 'https://example.com/3');
  return next throws_ok(
    format($q$insert into public.athlete_video_link (athlete_id, url) values (%L, 'https://example.com/4')$q$, v_a),
    '23514', 'An athlete can have at most 3 video links', 'a fourth video link is rejected');
  return next throws_ok(
    format($q$insert into public.athlete_video_link (athlete_id, url) values (%L, 'not-a-url')$q$, v_a),
    '23514', null, 'a video link must be http(s)');

  insert into public.athlete_major (athlete_id, major_code, kind) values (v_a, 'BUSN', 'intended'), (v_a, 'HLTH', 'intended'), (v_a, 'KINE', 'intended');
  return next throws_ok(
    format($q$insert into public.athlete_major (athlete_id, major_code, kind) values (%L, 'PSYC', 'intended')$q$, v_a),
    '23514', 'An athlete can have at most 3 intended majors', 'a fourth intended major is rejected');
  return next lives_ok(
    format($q$insert into public.athlete_major (athlete_id, major_code, kind) values (%L, 'PSYC', 'interest')$q$, v_a),
    'interest majors are not limited to three');
end;
$f$;

create function tests.test_only_one_primary_guardian() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('primary@example.com');
begin
  insert into public.athlete_guardian (athlete_id, relationship, full_name, is_primary) values (v_a, 'mother', 'Mom', true);
  return next throws_ok(
    format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name, is_primary) values (%L, 'father', 'Dad', true)$q$, v_a),
    '23505', null, 'a second primary guardian is rejected');
end;
$f$;

create function tests.test_audit_columns_come_from_the_database() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('audit@example.com');
begin
  update public.athlete set preferred_name = 'Ace' where id = v_a;
  return next ok(
    exists (select 1 from public.change_history h
            where h.table_name = 'athlete' and h.athlete_id = v_a and h.change_type = 'updated'
              and h.new_values ->> 'preferred_name' = 'Ace'),
    'an update to the athlete is recorded in change_history');
  return next ok(
    exists (select 1 from public.change_history h where h.table_name = 'athlete' and h.athlete_id = v_a and h.change_type = 'created'),
    'creating the athlete is recorded');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- My College List
-- ---------------------------------------------------------------------------------------------

create function tests.test_bad_stage_and_closed_reason() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('stage@example.com');
  v_p bigint := tests.mk_program(1);
begin
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id, stage) values (%L, %s, 'bogus')$q$, v_a, v_p),
    '22P02', null, 'an unknown stage is rejected');
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id, stage) values (%L, %s, 'closed')$q$, v_a, v_p),
    '23514', null, 'closed needs a reason');
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id, closed_reason) values (%L, %s, 'i_passed')$q$, v_a, v_p),
    '23514', null, 'a reason without closed is rejected');
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id, priority) values (%L, %s, 5)$q$, v_a, v_p),
    '23514', null, 'priority must be 1 to 4');
end;
$f$;

create function tests.test_list_is_capped_at_30() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('cap@example.com');
  v_first uuid;
  i integer;
begin
  for i in 1..30 loop
    if i = 1 then
      v_first := tests.mk_list_entry(v_a, tests.mk_program(100 + i));
    else
      perform tests.mk_list_entry(v_a, tests.mk_program(100 + i));
    end if;
  end loop;
  return next is((select count(*)::integer from public.athlete_college where athlete_id = v_a), 30, 'thirty colleges fit');
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id) values (%L, %s)$q$, v_a, tests.mk_program(131)),
    '23514', null, 'the 31st college is rejected');
  update public.athlete_college set archived_at = now() where id = v_first;
  return next lives_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id) values (%L, %s)$q$, v_a, tests.mk_program(132)),
    'archiving one makes room');
  return next throws_ok(
    format($q$update public.athlete_college set archived_at = null where id = %L$q$, v_first),
    '23514', null, 'restoring an archived college is also blocked at the cap');
end;
$f$;

create function tests.test_same_college_twice_is_rejected() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('dup@example.com');
  v_p bigint := tests.mk_program(200);
begin
  perform tests.mk_list_entry(v_a, v_p);
  return next throws_ok(
    format($q$insert into public.athlete_college (athlete_id, program_id) values (%L, %s)$q$, v_a, v_p),
    '23505', null, 'the same college cannot be listed twice');
end;
$f$;

create function tests.test_stage_and_priority_changes_write_system_entries() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('system@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(300));
begin
  return next is(
    (select count(*)::integer from public.activity_entry where athlete_college_id = v_l and source = 'system' and summary = 'Added to My College List'),
    1, 'adding to the list writes a system entry');
  update public.athlete_college set stage = 'contacted' where id = v_l;
  return next ok(
    exists (select 1 from public.activity_entry where athlete_college_id = v_l and source = 'system' and summary = 'Stage: Researching to Contacted'),
    'a stage change writes a system entry');
  update public.athlete_college set priority = 1 where id = v_l;
  return next ok(
    exists (select 1 from public.activity_entry where athlete_college_id = v_l and source = 'system' and summary = 'Priority: 3 to 1'),
    'a priority change writes a system entry');
  update public.athlete_college set notes_text = 'just a note' where id = v_l;
  return next is(
    (select count(*)::integer from public.activity_entry where athlete_college_id = v_l and source = 'system'),
    3, 'other edits do not write system entries');
end;
$f$;

create function tests.test_main_coach_must_belong_to_the_program() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('coach@example.com');
  v_p1 bigint := tests.mk_program(400);
  v_p2 bigint := tests.mk_program(401);
  v_l uuid := tests.mk_list_entry(v_a, v_p1);
  v_ok bigint;
  v_other bigint;
begin
  insert into public.college_coach (program_id, full_name, title) values (v_p1, 'Coach One', 'head') returning id into v_ok;
  insert into public.college_coach (program_id, full_name, title) values (v_p2, 'Coach Two', 'head') returning id into v_other;
  return next lives_ok(format($q$update public.athlete_college set main_coach_id = %s where id = %L$q$, v_ok, v_l), 'a coach of the same program is accepted');
  return next throws_ok(format($q$update public.athlete_college set main_coach_id = %s where id = %L$q$, v_other, v_l),
    '23514', null, 'a coach of another program is rejected');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------------------------

create function tests.test_direction_is_required_for_contacts() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('direction@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(500));
begin
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'email', 'Sent intro')$q$, v_a, v_l),
    '23514', 'Direction is required for this activity type', 'an email without direction is rejected');
  return next lives_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, summary) values (%L, %L, 'email', 'i_contacted', 'Sent intro')$q$, v_a, v_l),
    'an email with direction is accepted');
  return next lives_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'camp_clinic', 'Went to camp')$q$, v_a, v_l),
    'a camp does not need a direction');
end;
$f$;

create function tests.test_activity_entry_rules() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('entry@example.com');
  v_b uuid := tests.mk_athlete('entry2@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(600));
  v_lb uuid := tests.mk_list_entry(v_b, tests.mk_program(601));
begin
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'Wrong owner')$q$, v_b, v_l),
    '23503', null, 'the athlete id must match the list entry (composite key)');
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, activity_date) values (%L, %L, 'other_note', 'Future', current_date + 10)$q$, v_a, v_l),
    '23514', null, 'a future date is rejected');
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, activity_date) values (%L, %L, 'other_note', 'Ancient', date '2001-01-01')$q$, v_a, v_l),
    '23514', null, 'a date before 2020 is rejected');
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', '   ')$q$, v_a, v_l),
    '23514', null, 'a blank summary is rejected');
  return next throws_ok(
    format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'system', 'Forged')$q$, v_a, v_l),
    '42501', null, 'a hand-written system entry is rejected');
  return next ok(v_lb is not null, 'second athlete has their own list entry');
end;
$f$;

create function tests.test_system_entries_cannot_be_changed() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('immutable@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(700));
  v_e uuid;
begin
  select e.id into v_e from public.activity_entry e where e.athlete_college_id = v_l and e.source = 'system' limit 1;
  return next throws_ok(format($q$update public.activity_entry set summary = 'Edited' where id = %L$q$, v_e),
    '42501', 'System entries cannot be changed', 'a system entry cannot be edited');
  return next throws_ok(format($q$update public.activity_entry set deleted_at = now() where id = %L$q$, v_e),
    '42501', 'System entries cannot be changed', 'a system entry cannot be soft-deleted');
end;
$f$;

create function tests.test_activity_soft_delete_and_immutable_fields() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('softdel@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(800));
  v_e uuid;
begin
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary)
  values (v_a, v_l, 'other_note', 'My note') returning id into v_e;
  return next throws_ok(format($q$update public.activity_entry set source = 'staff' where id = %L$q$, v_e),
    '23514', null, 'the source label cannot be changed');
  update public.activity_entry set deleted_at = now() where id = v_e;
  return next ok((select deleted_at is not null from public.activity_entry where id = v_e), 'an entry can be soft-deleted');
  return next ok(
    exists (select 1 from public.change_history h where h.table_name = 'activity_entry' and h.record_id = v_e::text and h.change_type = 'deleted'),
    'the soft delete is recorded in change_history');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Next steps
-- ---------------------------------------------------------------------------------------------

create function tests.test_one_open_next_step_per_college() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('steps@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(900));
  v_first uuid;
begin
  insert into public.next_step (athlete_id, athlete_college_id, description, due_date)
  values (v_a, v_l, 'Email the coach', current_date + 7) returning id into v_first;
  return next throws_ok(
    format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Another', current_date + 8)$q$, v_a, v_l),
    '23505', null, 'a second open next step is rejected');
  update public.next_step set status = 'done' where id = v_first;
  return next ok((select completed_at is not null from public.next_step where id = v_first), 'completing a step stamps completed_at');
  return next lives_ok(
    format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Another', current_date + 8)$q$, v_a, v_l),
    'a new step is allowed once the first is done');
end;
$f$;

create function tests.test_next_step_field_rules() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('steprules@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(950));
begin
  return next throws_ok(
    format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date, snooze_until) values (%L, %L, 'Snooze', current_date + 7, current_date + 1)$q$, v_a, v_l),
    '23514', null, 'snooze cannot be before the due date');
  return next throws_ok(
    format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, '', current_date + 7)$q$, v_a, v_l),
    '23514', null, 'a blank description is rejected');
  return next throws_ok(
    format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date, status, completed_at) values (%L, %L, 'x', current_date, 'open', now())$q$, v_a, v_l),
    '23514', null, 'an open step cannot have a completion time');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Competitiveness bands (D6)
-- ---------------------------------------------------------------------------------------------

create function tests.test_competitiveness_bands() returns setof text language plpgsql as $f$
declare
  i integer;
begin
  for i in 1..20 loop
    perform tests.mk_program(1000 + i, 'NJCAA', i, 'TEST-20');
  end loop;
  perform tests.mk_program(1100, 'NJCAA', null, 'TEST-20');   -- unranked: no band, not counted
  return next is(
    (select array_agg(band order by division_rank)
       from public.program_competitiveness where division_rank_season = 'TEST-20' and division_rank is not null),
    array[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    'ranks 1-20 of 20 fall into bands 1,1,2,2,3,3,4,4,5,5 then 6 (10% belongs to the better band)');
  return next ok(
    (select band is null from public.program_competitiveness where division_rank_season = 'TEST-20' and division_rank is null),
    'an unranked program has no band');
  return next is(
    (select max(ranked_count) from public.program_competitiveness where division_rank_season = 'TEST-20'),
    20::bigint, 'unranked programs are not counted');
end;
$f$;

create function tests.test_bands_ignore_gaps_in_the_source_rank() returns setof text language plpgsql as $f$
declare
  i integer;
begin
  -- 20 programs whose raw ranks skip numbers (1, 3, 5, ... 39), as the real Massey ranks do.
  for i in 1..20 loop
    perform tests.mk_program(1300 + i, 'NJCAA', 2 * i - 1, 'TEST-GAPS');
  end loop;
  return next is(
    (select array_agg(band order by division_rank)
       from public.program_competitiveness where division_rank_season = 'TEST-GAPS'),
    array[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    'bands depend on position in the ranked list, not on the raw rank number');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------------------------

create function tests.test_views_return_expected_values() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('views@example.com');
  v_l uuid := tests.mk_list_entry(v_a, tests.mk_program(1200));
begin
  insert into public.next_step (athlete_id, athlete_college_id, description, due_date)
  values (v_a, v_l, 'Late step', private.club_today() - 3);
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, summary, activity_date)
  values (v_a, v_l, 'email', 'i_contacted', 'Intro email', private.club_today() - 10);

  return next is((select bucket from public.next_steps_due where athlete_id = v_a), 'overdue', 'an old open step is overdue');
  return next is((select last_activity_date from public.my_list where athlete_id = v_a), private.club_today() - 10,
                 'last activity ignores system entries');
  return next is((select days_silent from public.my_list where athlete_id = v_a), 10, 'days silent counts from the last real activity');
  return next is((select pct from public.athlete_completeness where athlete_id = v_a), 0, 'a brand-new profile is 0% complete');
  return next is((select overdue_count from public.staff_roster where athlete_id = v_a)::integer, 1, 'the roster counts overdue steps');
  return next is((select colleges_count from public.staff_roster where athlete_id = v_a)::integer, 1, 'the roster counts colleges');
  return next lives_ok($q$select * from public.program_search$q$, 'program_search runs');
end;
$f$;

create function tests.test_completeness_counts_filled_items() returns setof text language plpgsql as $f$
declare
  v_a uuid := tests.mk_athlete('complete@example.com');
begin
  update public.athlete set home_city = 'Ames', home_zip = '50010' where id = v_a;
  insert into public.athlete_athletic (athlete_id, primary_position, height_in) values (v_a, 'OH', 70);
  return next is((select filled from public.athlete_completeness where athlete_id = v_a), 4, 'city, zip, athletic row and height are counted');
  return next is((select pct from public.athlete_completeness where athlete_id = v_a), 27, '4 of 15 rounds to 27%');
end;
$f$;

select * from runtests('tests'::name);

rollback;
