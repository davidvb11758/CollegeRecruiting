-- WP11: the four walkthroughs of IMPLEMENTATION-PLAN section 5, each run start to finish through the real roles
-- (grants and row-level security apply), as one story per test. These are the acceptance tests for the pilot:
--   1. Athlete: sign up -> profile -> preferences -> find D-II colleges with a major -> add 5 -> log an email -> next step -> Home
--   2. Coordinator: roster shows only assigned athletes -> open one -> fix a GPA -> add a next step -> correct a coach email
--   3. Athlete again: sees the coordinator's name on the edit; cannot see any other athlete
--   4. Attack checks: change athlete_id, read another athlete by id, promote self to staff, write a "staff" entry
-- (Sign-up itself, with the pilot code, is checked in 10_constraints; the screens are checked by the app tests.)
begin;

create schema if not exists tests;

-- Five Division II programs with the major COMP, a master coach for the first, and a plain login (z@) with no athlete record yet.
create function tests.walk_world() returns void language plpgsql as $f$
declare
  n integer;
  v_p bigint;
begin
  perform tests.world();
  for n in 31..35 loop
    v_p := tests.mk_program(n, 'NCAA_D2');
    insert into public.college_major (unitid, major_code) values (900000 + n, 'COMP');
    if n = 31 then
      insert into public.college_coach (program_id, full_name, title, email) values (v_p, 'Walk Coach', 'head', 'old.address@example.edu');
    end if;
  end loop;
end;
$f$;

create function tests.test_walkthrough_1_an_athlete_goes_from_sign_up_to_a_logged_email() returns setof text language plpgsql as $f$
declare
  uz uuid; v_team uuid; v_a uuid; v_pos text; v_l uuid; v_coach bigint; n integer; v_prog bigint;
begin
  perform tests.walk_world();
  uz := tests.gid('user_z');
  select t.id into v_team from public.team t limit 1;
  select code into v_pos from public.player_position order by sort_order limit 1;

  -- profile: the login creates their own athlete record, then fills the tabs
  return next is(tests.q_affected(uz, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state, home_city, home_zip)
                                               values (%L, %L, 'Zed', 'Walker', (current_date - interval '16 years')::date, 2028, 'IA', 'Ames', '50010')$q$, uz, v_team)),
    1::bigint, 'the athlete creates their profile');
  select id into v_a from public.athlete where user_id = uz;
  return next is(tests.q_affected(uz, format($q$insert into public.athlete_athletic (athlete_id, primary_position, height_in, club_team_name) values (%L, %L, 70, 'Rockets 16R')$q$, v_a, v_pos)),
    1::bigint, 'saves the athletic tab');
  return next is(tests.q_affected(uz, format($q$insert into public.athlete_academic (athlete_id, hs_name, gpa_unweighted) values (%L, 'Ames High', 3.6)$q$, v_a)),
    1::bigint, 'saves the academic tab');
  return next is(tests.q_affected(uz, format($q$insert into public.athlete_preference (athlete_id, competitiveness_bands, max_distance_miles) values (%L, array[2, 3, 4], 300)$q$, v_a)),
    1::bigint, 'saves the preferences');
  return next ok(tests.q_count(uz, format($q$select pct from public.athlete_completeness where athlete_id = %L$q$, v_a)) > 0, 'the completeness meter moves');

  -- find: Division II with a computer science major
  return next is(tests.q_count(uz, $q$select count(*) from public.program_search where unitid between 900031 and 900035 and division_code in ('NCAA_D2') and major_codes @> '{COMP}'$q$),
    5::bigint, 'Find Colleges returns the five Division II programs with the major');

  -- add five to the list, as the app does
  for n in 31..35 loop
    select id into v_prog from public.college_program where unitid = 900000 + n;
    perform tests.q_affected(uz, format($q$insert into public.athlete_college (athlete_id, program_id) values (%L, %L)$q$, v_a, v_prog));
  end loop;
  return next is(tests.q_count(uz, format($q$select count(*) from public.my_list where athlete_id = %L and archived_at is null$q$, v_a)), 5::bigint, 'the list holds five colleges');

  -- log an email to a coach, set a next step
  select id into v_l from public.athlete_college where athlete_id = v_a and program_id = (select id from public.college_program where unitid = 900031);
  select id into v_coach from public.college_coach where full_name = 'Walk Coach';
  return next is(tests.q_affected(uz, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, coach_ids, summary)
                                               values (%L, %L, 'email', 'i_contacted', array[%s]::bigint[], 'Sent my intro and video')$q$, v_a, v_l, v_coach)),
    1::bigint, 'the athlete logs an email to the coach');
  return next is(tests.q_affected(uz, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Follow up after one week', private.club_today() + 7)$q$, v_a, v_l)),
    1::bigint, 'and sets a next step');

  -- Home
  return next is(tests.q_text(uz, $q$select bucket from public.next_steps_due where description = 'Follow up after one week'$q$), 'this_week', 'the next step shows on Home');
  return next is(tests.q_text(uz, format($q$select last_activity_date::text from public.my_list where list_id = %L$q$, v_l)), private.club_today()::text,
    'the list shows today as the last activity for that college');
  return next is(tests.q_text(uz, format($q$select source::text from public.activity_entry where athlete_id = %L and summary = 'Sent my intro and video'$q$, v_a)), 'athlete',
    'and the entry is labelled as the athlete''s own');
end;
$f$;

create function tests.test_walkthrough_2_a_coordinator_works_only_on_assigned_athletes() returns setof text language plpgsql as $f$
declare
  us uuid; ut uuid; v_a uuid; v_l uuid; v_coach bigint; v_gpa text;
begin
  perform tests.walk_world();
  us := tests.gid('staff_s'); ut := tests.gid('staff_t'); v_a := tests.gid('athlete_a'); v_l := tests.gid('list_a');
  select id into v_coach from public.college_coach where full_name = 'Walk Coach';
  insert into public.athlete_academic (athlete_id, hs_name, gpa_unweighted) values (v_a, 'Test High', 3.1);

  -- roster: only the assigned athlete
  return next is(tests.q_count(us, 'select count(*) from public.staff_roster where first_name = ''Test'''), 1::bigint, 'the coordinator''s roster holds only the assigned athlete');
  return next is(tests.q_count(us, format($q$select count(*) from public.staff_roster where athlete_id = %L$q$, tests.gid('athlete_b'))), 0::bigint, 'the other athlete is not on it');
  return next is(tests.q_count(ut, 'select count(*) from public.staff_roster where first_name = ''Test'''), 0::bigint, 'a coordinator with no assignments has an empty roster');

  -- open the athlete, fix a GPA
  return next is(tests.q_count(us, format($q$select count(*) from public.athlete_academic where athlete_id = %L$q$, v_a)), 1::bigint, 'the coordinator opens the athlete''s academic tab');
  return next is(tests.q_affected(us, format($q$update public.athlete_academic set gpa_unweighted = 3.4 where athlete_id = %L$q$, v_a)), 1::bigint, 'and fixes the GPA');
  select gpa_unweighted::text into v_gpa from public.athlete_academic where athlete_id = v_a;
  return next is(v_gpa, '3.40', 'the new GPA is saved');

  -- add a next step "Send updated video" (the earlier open one is closed first, only one may be open)
  perform tests.q_affected(us, format($q$update public.next_step set status = 'done' where athlete_college_id = %L and status = 'open'$q$, v_l));
  return next is(tests.q_affected(us, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Send updated video', private.club_today() + 2)$q$, v_a, v_l)),
    1::bigint, 'the coordinator adds the next step "Send updated video"');

  -- correct a coach email on the shared college record
  return next is(tests.q_affected(us, format($q$update public.college_coach set email = 'new.address@example.edu' where id = %L$q$, v_coach)), 1::bigint, 'the coordinator corrects a coach email on the college record');
  return next is((select email from public.college_coach where id = v_coach), 'new.address@example.edu', 'the correction is saved');
  return next ok((select verified_by = us and last_verified_on = private.club_today() from public.college_coach where id = v_coach), 'and stamped with who and when');
  return next ok(exists (select 1 from public.change_history where table_name = 'college_coach' and record_id = v_coach::text and changed_by = us), 'and written to the change history');
end;
$f$;

create function tests.test_walkthrough_3_the_athlete_sees_the_coordinators_edit_and_nobody_else() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; v_a uuid; v_l uuid;
begin
  perform tests.walk_world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); v_a := tests.gid('athlete_a'); v_l := tests.gid('list_a');
  perform tests.q_affected(us, format($q$update public.athlete set home_city = 'Des Moines' where id = %L$q$, v_a));
  perform tests.q_affected(us, format($q$update public.next_step set status = 'done' where athlete_college_id = %L and status = 'open'$q$, v_l));
  perform tests.q_affected(us, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Send updated video', private.club_today() + 2)$q$, v_a, v_l));

  return next is(tests.q_text(ua, format($q$select home_city from public.athlete where id = %L$q$, v_a)), 'Des Moines', 'the athlete sees the coordinator''s change');
  return next ok(tests.q_count(ua, format($q$select count(*) from public.change_history where athlete_id = %L and changed_by = %L and changed_by_role = 'staff'$q$, v_a, us)) >= 2,
    'the history shows the coordinator made it');
  return next is(tests.q_text(ua, format($q$select first_name || ' ' || last_name from public.staff_profile where user_id = %L$q$, us)), 'Coach s@example.com', 'and the coordinator''s name can be looked up');
  return next is(tests.q_text(ua, $q$select created_source::text from public.next_step where description = 'Send updated video'$q$), 'staff', 'the new next step is labelled as staff');
  return next is(tests.q_count(ua, 'select count(*) from public.athlete'), 1::bigint, 'the athlete can see no other athlete');
  return next is(tests.q_count(ua, format('select count(*) from public.staff_roster where athlete_id <> %L', v_a)), 0::bigint, 'and no one else on the roster view (at most their own row)');
end;
$f$;

create function tests.test_walkthrough_4_attack_checks_all_fail() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; v_a uuid; v_b uuid; v_la uuid; v_lb uuid;
begin
  perform tests.walk_world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); v_la := tests.gid('list_a'); v_lb := tests.gid('list_b');

  -- change athlete_id in a request
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'For B')$q$, v_b, v_lb)),
    'A cannot write an entry for B');
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'Mixed up')$q$, v_a, v_lb)),
    'A cannot attach an entry to B''s list by naming A');
  return next is(tests.q_affected(ua, format($q$update public.athlete set athlete_phone = '5155550100' where id = %L$q$, v_b)), 0::bigint, 'A cannot edit B');
  return next ok(tests.q_fails(ua, format($q$update public.athlete set user_id = %L where id = %L$q$, ub, v_a)), 'A cannot hand their record to another login');
  return next ok(tests.q_fails(ua, format($q$update public.athlete_college set athlete_id = %L where id = %L$q$, v_b, v_la)), 'A cannot move a list entry onto B');

  -- read another athlete's list by id
  return next is(tests.q_count(ua, format($q$select count(*) from public.my_list where athlete_id = %L$q$, v_b)), 0::bigint, 'A cannot read B''s list through the view');
  return next is(tests.q_count(ua, format($q$select count(*) from public.athlete_college where athlete_id = %L$q$, v_b)), 0::bigint, 'or the table');
  return next is(tests.q_count(ua, format($q$select count(*) from public.next_steps_due where athlete_id = %L$q$, v_b)), 0::bigint, 'or B''s next steps');
  return next is(tests.q_count(ua, format($q$select count(*) from public.change_history where athlete_id = %L$q$, v_b)), 0::bigint, 'or B''s history');

  -- promote self to staff or admin
  return next ok(tests.q_fails(ua, format($q$update public.app_user set role = 'staff' where user_id = %L$q$, ua)), 'A cannot promote themselves to staff');
  return next ok(tests.q_fails(ua, format($q$update public.app_user set role = 'admin' where user_id = %L$q$, ua)), 'or to admin');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, tests.gid('staff_s'))), 'or assign a coordinator to anyone');

  -- write a "staff" entry
  perform tests.q_affected(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, source, entered_by) values (%L, %L, 'other_note', 'I am staff', 'staff', %L)$q$,
                                      v_a, v_la, tests.gid('staff_s')));
  return next is((select source::text from public.activity_entry where summary = 'I am staff'), 'athlete', 'a "staff" label written by an athlete is replaced by "athlete"');
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, source) values (%L, %L, 'system', 'Fake system entry', 'system')$q$, v_a, v_la)),
    'and a system entry cannot be written at all');

  -- and signed out, nothing at all
  return next ok(tests.q_fails(null, 'select count(*) from public.athlete', 'anon'), 'a signed-out request is refused');
end;
$f$;

select * from runtests('tests'::name);

rollback;
