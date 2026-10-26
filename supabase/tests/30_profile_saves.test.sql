-- WP6: the writes the profile and preferences screens make, run AS the athlete so grants and row-level security apply.
-- These mirror app/src/lib/profileApi.ts (first-login insert, upserts, the guardian primary swap, child-list limits).
begin;

create schema if not exists tests;

create function tests.test_first_login_creates_the_athlete_and_it_is_then_readable() returns setof text language plpgsql as $f$
declare
  v_z uuid;
begin
  perform tests.world();
  v_z := tests.gid('user_z');
  return next is(
    tests.q_affected(v_z, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
      values (%L, (select id from public.team limit 1), 'New', 'Player', current_date - interval '15 years', 2029, 'IA')$q$, v_z)),
    1::bigint, 'a login with no athlete record can create its own athlete (no RETURNING)');
  return next is(tests.q_count(v_z, 'select count(*) from public.athlete'), 1::bigint, 'and can read it right afterwards');
  return next ok(
    tests.q_fails(v_z, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
      values (%L, (select id from public.team limit 1), 'Second', 'Try', current_date - interval '15 years', 2029, 'IA')$q$, v_z)),
    'a second athlete record for the same login is refused');
end;
$f$;

create function tests.test_age_outside_14_to_18_is_refused_at_creation() returns setof text language plpgsql as $f$
declare
  v_z uuid;
begin
  perform tests.world();
  v_z := tests.gid('user_z');
  return next ok(
    tests.q_fails(v_z, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
      values (%L, (select id from public.team limit 1), 'Too', 'Young', current_date - interval '10 years', 2032, 'IA')$q$, v_z)),
    'a 10-year-old is refused');
  return next ok(
    tests.q_fails(v_z, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
      values (%L, (select id from public.team limit 1), 'Too', 'Old', current_date - interval '25 years', 2026, 'IA')$q$, v_z)),
    'a 25-year-old is refused');
end;
$f$;

create function tests.test_athletic_academic_and_preference_upserts() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_u uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_u := tests.gid('user_a');

  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_athletic (athlete_id, primary_position, height_in)
    values (%L, 'OH', 70) on conflict (athlete_id) do update set primary_position = excluded.primary_position, height_in = excluded.height_in$q$, v_a)),
    1::bigint, 'athletic: first save inserts');
  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_athletic (athlete_id, primary_position, height_in)
    values (%L, 'OH', 72) on conflict (athlete_id) do update set primary_position = excluded.primary_position, height_in = excluded.height_in$q$, v_a)),
    1::bigint, 'athletic: second save updates the same row');
  return next is(tests.q_text(v_u, format('select height_in::text from public.athlete_athletic where athlete_id = %L', v_a)),
    '72', 'athletic: the new height is stored');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_athletic (athlete_id, primary_position, secondary_position)
    values (%L, 'OH', 'OH') on conflict (athlete_id) do update set secondary_position = excluded.secondary_position$q$, v_a)),
    'athletic: the second position cannot equal the main position');

  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_academic (athlete_id, gpa_unweighted, gpa_updated_on)
    values (%L, 3.80, current_date) on conflict (athlete_id) do update set gpa_unweighted = excluded.gpa_unweighted$q$, v_a)),
    1::bigint, 'academic: save works');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_academic (athlete_id, gpa_unweighted)
    values (%L, 4.50) on conflict (athlete_id) do update set gpa_unweighted = excluded.gpa_unweighted$q$, v_a)),
    'academic: a GPA above 4.00 is refused');

  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_preference (athlete_id, competitiveness_bands, preferred_regions)
    values (%L, '{1,2}', '{Midwest}') on conflict (athlete_id) do update set competitiveness_bands = excluded.competitiveness_bands$q$, v_a)),
    1::bigint, 'preferences: save works');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_preference (athlete_id, competitiveness_bands)
    values (%L, '{}') on conflict (athlete_id) do update set competitiveness_bands = excluded.competitiveness_bands$q$, v_a)),
    'preferences: at least one competitiveness level is required');
  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_target_division (athlete_id, division_code, interest)
    values (%L, 'NCAA_D1', 'top_choice'), (%L, 'NCAA_D2', 'open_to')
    on conflict (athlete_id, division_code) do update set interest = excluded.interest$q$, v_a, v_a)),
    2::bigint, 'divisions: two choices saved');
  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_target_division (athlete_id, division_code, interest)
    values (%L, 'NCAA_D1', 'open_to') on conflict (athlete_id, division_code) do update set interest = excluded.interest$q$, v_a)),
    1::bigint, 'divisions: saving again changes the choice instead of failing');
  return next ok((select pct from public.athlete_completeness where athlete_id = v_a) is not null, 'the completeness view reports for the athlete');
end;
$f$;

create function tests.test_guardian_main_contact_swap_and_limits() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_u uuid;
  v_mom uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_u := tests.gid('user_a');
  select id into v_mom from public.athlete_guardian where athlete_id = v_a and full_name = 'Mom A';

  return next is(tests.q_affected(v_u, format('update public.athlete_guardian set is_primary = true where id = %L', v_mom)), 1::bigint, 'mother made the main contact');
  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name, is_primary) values (%L, 'father', 'Dad A', false)$q$, v_a)),
    1::bigint, 'a second guardian is added');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name) values (%L, 'other', 'Third', false)$q$, v_a)),
    'a third guardian is refused');
  -- the app demotes before it promotes
  return next is(tests.q_affected(v_u, format('update public.athlete_guardian set is_primary = false where id = %L', v_mom)), 1::bigint, 'step 1: old main contact demoted');
  return next is(tests.q_affected(v_u, format($q$update public.athlete_guardian set is_primary = true where athlete_id = %L and full_name = 'Dad A'$q$, v_a)),
    1::bigint, 'step 2: new main contact promoted');
  return next ok(tests.q_fails(v_u, format('update public.athlete_guardian set is_primary = true where id = %L', v_mom)),
    'making both the main contact at once is refused (so the app must demote first)');
end;
$f$;

create function tests.test_video_and_major_limits() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_u uuid;
  i integer;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_u := tests.gid('user_a');
  for i in 1..3 loop
    perform tests.q_affected(v_u, format($q$insert into public.athlete_video_link (athlete_id, label, url, sort_order) values (%L, 'v', 'https://example.com/%s', %s)$q$, v_a, i, i));
  end loop;
  return next is(tests.q_count(v_u, format('select count(*) from public.athlete_video_link where athlete_id = %L', v_a)), 3::bigint, 'three video links saved');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_video_link (athlete_id, label, url) values (%L, 'v', 'https://example.com/4')$q$, v_a)), 'a fourth video link is refused');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_video_link (athlete_id, label, url) values (%L, 'bad', 'not-a-link')$q$, tests.gid('athlete_a'))), 'a link must start with http(s)');

  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_major (athlete_id, major_code, kind) values (%L, 'BUSN', 'intended'), (%L, 'COMP', 'intended'), (%L, 'HLTH', 'intended')$q$, v_a, v_a, v_a)),
    3::bigint, 'three intended majors saved');
  return next ok(tests.q_fails(v_u, format($q$insert into public.athlete_major (athlete_id, major_code, kind) values (%L, 'ENGR', 'intended')$q$, v_a)), 'a fourth intended major is refused');
  return next is(tests.q_affected(v_u, format($q$insert into public.athlete_major (athlete_id, major_code, kind) values (%L, 'ENGR', 'interest'), (%L, 'MATH', 'interest')$q$, v_a, v_a)),
    2::bigint, 'majors of interest are not limited to three');
end;
$f$;

create function tests.test_nobody_else_can_save_to_this_profile() returns setof text language plpgsql as $f$
declare
  v_a uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  perform tests.q_affected(tests.gid('user_a'), format($q$insert into public.athlete_athletic (athlete_id, primary_position) values (%L, 'S')$q$, v_a));
  return next is(tests.q_affected(tests.gid('user_b'), format($q$update public.athlete_athletic set primary_position = 'MB' where athlete_id = %L$q$, v_a)),
    0::bigint, 'athlete B cannot change athlete A''s athletic tab');
  return next ok(tests.q_fails(tests.gid('user_b'), format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name) values (%L, 'other', 'Intruder')$q$, v_a)),
    'athlete B cannot add a guardian to athlete A');
  return next is(tests.q_affected(tests.gid('staff_s'), format($q$update public.athlete_athletic set primary_position = 'MB' where athlete_id = %L$q$, v_a)),
    1::bigint, 'the assigned coordinator can edit athlete A''s athletic tab');
  return next is(tests.q_affected(tests.gid('staff_t'), format($q$update public.athlete_athletic set primary_position = 'OPP' where athlete_id = %L$q$, v_a)),
    0::bigint, 'a coordinator who is not assigned cannot');
end;
$f$;

select * from runtests('tests'::name);

rollback;
