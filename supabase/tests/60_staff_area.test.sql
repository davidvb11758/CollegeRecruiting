-- WP9: the writes the coordinator screens make, run AS the coordinator (or the athlete reading the result) so grants
-- and row-level security apply. Mirrors app/src/lib/masterApi.ts and the athlete screens used inside an athlete's account.
-- Who may see which athlete is covered in 20_rls; this file checks the flows the screens depend on and that every
-- coordinator edit is stamped, labelled and in the change history.
begin;

create schema if not exists tests;

-- ---------------------------------------------------------------------------------------------
-- Editing the shared college data (decision D4)
-- ---------------------------------------------------------------------------------------------

create function tests.test_a_coordinator_saves_college_facts_and_is_stamped() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; ut uuid; v_p1 bigint;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); v_p1 := tests.bid('program_1');
  update public.college_program set last_verified_on = date '2020-01-01', verified_by = null where id = v_p1;

  -- the two statements the "Edit college information" form sends
  return next is(tests.q_affected(us, $q$update public.college set website_url = 'https://college.example.edu', cost_url = 'https://college.example.edu/cost' where unitid = 900001$q$),
    1::bigint, 'the college links save');
  return next is(tests.q_affected(us, format($q$update public.college_program set program_url = 'https://college.example.edu/vb', camps_url = null,
      last_season_record = '20-10', status = 'needs_review', last_verified_on = date '2020-01-01' where id = %s$q$, v_p1)),
    1::bigint, 'the program facts save');

  return next is((select verified_by from public.college_program where id = v_p1), us, 'the coordinator is recorded as the verifier');
  return next is((select last_verified_on from public.college_program where id = v_p1), private.club_today(),
    'the verified date is today, even though the screen sent an old date');
  return next is(tests.q_text(ua, format('select status::text from public.program_search where program_id = %s', v_p1)), 'needs_review',
    'athletes see the new status');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'college_program' and h.record_id = v_p1::text
                          and h.athlete_id is null and h.changed_by = us and h.changed_by_role = 'staff'
                          and h.new_values ->> 'status' = 'needs_review' and h.old_values ->> 'status' = 'active'),
    'the edit is in the change history with the coordinator and no athlete');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'college' and h.record_id = '900001' and h.changed_by = us
                          and h.new_values ->> 'cost_url' = 'https://college.example.edu/cost'),
    'the college edit is in the change history too');

  -- any coordinator may edit shared data, not only one assigned to an athlete (T has no athletes)
  return next is(tests.q_affected(ut, format($q$update public.college_program set camps_url = 'https://college.example.edu/camps' where id = %s$q$, v_p1)),
    1::bigint, 'a coordinator with no athletes can still correct a college');
  return next is((select verified_by from public.college_program where id = v_p1), ut, 'and is recorded as the verifier instead');

  -- the database holds the line the screen draws
  return next ok(tests.q_fails(us, format($q$update public.college_program set program_url = 'ftp://college.example.edu' where id = %s$q$, v_p1)),
    'a link must start with http or https');
  return next ok(tests.q_fails(us, format($q$update public.college_program set status = 'gone' where id = %s$q$, v_p1)), 'an unknown status is refused');
  return next is(tests.q_affected(us, format($q$update public.college_program set status = 'program_dropped' where id = %s$q$, v_p1)), 1::bigint,
    'a program can be marked dropped');
  return next is(tests.q_count(ua, format($q$select count(*) from public.program_search where program_id = %s and status <> 'program_dropped'$q$, v_p1)),
    0::bigint, 'and the search screen, which skips dropped programs, no longer finds it');
end;
$f$;

create function tests.test_mark_verified_changes_only_the_stamp() returns setof text language plpgsql as $f$
declare
  us uuid; v_p1 bigint;
begin
  perform tests.world();
  us := tests.gid('staff_s'); v_p1 := tests.bid('program_1');
  update public.college_program set last_verified_on = date '2020-01-01', verified_by = null where id = v_p1;
  delete from public.change_history where table_name = 'college_program' and record_id = v_p1::text;

  return next is(tests.q_affected(us, format($q$update public.college_program set last_verified_on = private.club_today() where id = %s$q$, v_p1)),
    1::bigint, 'Mark as verified today saves');
  return next is((select verified_by from public.college_program where id = v_p1), us, 'it names the coordinator');
  return next is((select count(*) from public.change_history where table_name = 'college_program' and record_id = v_p1::text), 1::bigint, 'it is one history row');
  return next is((select (new_values - 'last_verified_on' - 'verified_by')::text from public.change_history
                   where table_name = 'college_program' and record_id = v_p1::text), '{}', 'and nothing else about the program changed');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Shared coaches: the main recruiting contact moves from one coach to another
-- ---------------------------------------------------------------------------------------------

create function tests.test_changing_the_main_recruiting_contact() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; us uuid; v_p1 bigint; v_old bigint; v_new bigint;
begin
  perform tests.world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s'); v_p1 := tests.bid('program_1'); v_old := tests.bid('coach_master');
  update public.college_coach set is_primary_recruiting_contact = true where id = v_old;

  -- the screen clears the old mark first, because the database allows only one per program
  return next ok(tests.q_fails(us, format($q$insert into public.college_coach (program_id, full_name, title, is_primary_recruiting_contact) values (%s, 'Too Early', 'assistant', true)$q$, v_p1)),
    'a second main contact is refused while the first is still marked');
  return next is(tests.q_affected(us, format($q$update public.college_coach set is_primary_recruiting_contact = false where id = %s$q$, v_old)), 1::bigint,
    'the old mark is cleared');
  return next is(tests.q_affected(us, format($q$insert into public.college_coach (program_id, full_name, title, email, phone, staff_page_url, recruits_note, employment_status,
      is_primary_recruiting_contact, last_verified_on, owner_athlete_id, source)
      values (%s, 'New Coach', 'recruiting_coordinator', 'new@college.example.edu', null, null, null, 'current', true, private.club_today(), null, 'Club staff edit')$q$, v_p1)),
    1::bigint, 'the new coach is added as the main contact');
  select id into v_new from public.college_coach where full_name = 'New Coach' and program_id = v_p1;

  return next is((select verified_by from public.college_coach where id = v_new), us, 'the new coach record names the coordinator');
  return next is((select source from public.college_coach where id = v_new), 'Club staff edit', 'and says it came from club staff');
  return next is((select count(*) from public.college_coach where program_id = v_p1 and is_primary_recruiting_contact and owner_athlete_id is null), 1::bigint,
    'exactly one main contact remains');
  return next is(tests.q_count(ua, format('select count(*) from public.college_coach where id = %s', v_new)), 1::bigint, 'athlete A can see the new shared coach');
  return next is(tests.q_count(ub, format('select count(*) from public.college_coach where id = %s', v_new)), 1::bigint, 'and so can athlete B');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'college_coach' and h.record_id = v_new::text
                          and h.athlete_id is null and h.changed_by = us and h.change_type = 'created'),
    'the new coach is in the change history with no athlete');

  -- if saving the new coach fails after the old mark was cleared, the screen puts the old mark back
  return next is(tests.q_affected(us, format($q$update public.college_coach set is_primary_recruiting_contact = false where id = %s$q$, v_new)), 1::bigint, 'clear again');
  return next ok(tests.q_fails(us, format($q$insert into public.college_coach (program_id, full_name, email) values (%s, 'Bad Email', 'not-an-email')$q$, v_p1)),
    'a coach with a bad email is refused');
  return next is(tests.q_affected(us, format($q$update public.college_coach set is_primary_recruiting_contact = true where id = %s$q$, v_old)), 1::bigint,
    'and the old main contact can be restored');

  -- a coach who has left is kept, marked as departed
  return next is(tests.q_affected(us, format($q$update public.college_coach set employment_status = 'departed', is_primary_recruiting_contact = false where id = %s$q$, v_old)), 1::bigint,
    'a coach can be marked as having left');
  return next is((select employment_status::text from public.college_coach where id = v_old), 'departed', 'the record is kept');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Working inside an athlete's account
-- ---------------------------------------------------------------------------------------------

create function tests.test_a_coordinators_work_on_an_athlete_is_labelled() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; ut uuid; v_a uuid; v_b uuid; v_l uuid; v_pos text;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); v_l := tests.gid('list_a');
  select code into v_pos from public.player_position order by sort_order limit 1;

  -- a profile section the athlete has not filled in yet
  return next is(tests.q_affected(us, format($q$insert into public.athlete_athletic (athlete_id, primary_position, height_in) values (%L, %L, 70)$q$, v_a, v_pos)), 1::bigint,
    'the coordinator fills in the athletic tab');
  return next is((select updated_by from public.athlete_athletic where athlete_id = v_a), us, 'the athletic tab records the coordinator as the last editor');
  return next is(tests.q_affected(us, format($q$update public.athlete set home_city = 'Ames' where id = %L$q$, v_a)), 1::bigint, 'and edits the personal tab');

  -- a log entry the coordinator writes for the athlete
  return next is(tests.q_affected(us, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'Coordinator called the coach')$q$, v_a, v_l)),
    1::bigint, 'the coordinator logs a note for the athlete');
  return next is(tests.q_text(ua, $q$select source::text from public.activity_entry where summary = 'Coordinator called the coach'$q$), 'staff', 'it is labelled as staff');
  return next is(tests.q_text(ua, $q$select entered_by::text from public.activity_entry where summary = 'Coordinator called the coach'$q$), us::text,
    'and names the coordinator, so the athlete sees "added by <name>"');

  -- a next step the coordinator sets
  perform tests.q_affected(us, format($q$update public.next_step set status = 'done' where athlete_college_id = %L and status = 'open'$q$, v_l));
  return next is(tests.q_affected(us, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Send the new film', private.club_today() - 1)$q$, v_a, v_l)),
    1::bigint, 'the coordinator sets a next step');
  return next is(tests.q_text(ua, $q$select created_source::text from public.next_step where description = 'Send the new film'$q$), 'staff', 'it is labelled as staff');

  -- the athlete is told what the coordinator changed
  return next ok(tests.q_count(ua, format($q$select count(*) from public.change_history where athlete_id = %L and changed_by = %L and changed_by_role = 'staff'$q$, v_a, us)) >= 3,
    'the athlete can see the coordinator''s changes in the history');
  return next ok(tests.q_count(us, format($q$select count(*) from public.change_history where athlete_id = %L and changed_by = %L$q$, v_a, us)) >= 3,
    'and so can the coordinator');
  return next is(tests.q_text(ua, format($q$select first_name || ' ' || last_name from public.staff_profile where user_id = %L$q$, us)), 'Coach s@example.com',
    'a family can look up the coordinator''s name');

  -- the roster reflects it
  return next is(tests.q_count(us, format($q$select overdue_count from public.staff_roster where athlete_id = %L$q$, v_a)), 1::bigint, 'the roster counts the overdue step');
  return next is(tests.q_text(us, format($q$select last_activity_date::text from public.staff_roster where athlete_id = %L$q$, v_a)), private.club_today()::text,
    'and shows today as the last activity');

  -- other coordinators and other athletes stay out
  return next is(tests.q_affected(ut, format($q$update public.athlete set home_city = 'Elsewhere' where id = %L$q$, v_a)), 0::bigint, 'an unassigned coordinator cannot edit the athlete');
  return next ok(tests.q_fails(ut, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'Not mine')$q$, v_a, v_l)),
    'or log for them');
  return next is(tests.q_affected(us, format($q$update public.athlete set home_city = 'Elsewhere' where id = %L$q$, v_b)), 0::bigint, 'the assigned coordinator cannot edit another athlete');
  return next is(tests.q_count(ut, 'select count(*) from public.staff_roster where first_name = ''Test'''), 0::bigint, 'an unassigned coordinator sees no roster');
end;
$f$;

create function tests.test_assignments_decide_who_sees_an_athlete() returns setof text language plpgsql as $f$
declare
  us uuid; ut uuid; ux uuid; v_a uuid; v_b uuid;
begin
  perform tests.world();
  us := tests.gid('staff_s'); ut := tests.gid('staff_t'); ux := tests.gid('admin_x'); v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b');

  return next is(tests.q_count(us, 'select count(*) from public.staff_roster where first_name = ''Test'''), 1::bigint, 'S has one athlete');
  return next is(tests.q_count(ux, 'select count(*) from public.staff_roster where first_name = ''Test'''), 2::bigint, 'the administrator sees both');

  -- the administrator assigns athletes in the dashboard
  insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (v_a, ut, 'secondary'), (v_b, ut, 'primary');
  return next is(tests.q_count(ut, 'select count(*) from public.staff_roster where first_name = ''Test'''), 2::bigint, 'T now sees both athletes');
  return next is(tests.q_affected(ut, format($q$update public.athlete set jersey_number = '12' where id = %L$q$, v_b)), 1::bigint, 'and can edit them');
  return next is(tests.q_count(us, format($q$select count(*) from public.staff_roster where athlete_id = %L$q$, v_b)), 0::bigint, 'S still does not see B');

  -- taking the assignment away takes the access away
  delete from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut;
  return next is(tests.q_count(ut, 'select count(*) from public.staff_roster where first_name = ''Test'''), 1::bigint, 'T no longer sees A');
  return next is(tests.q_count(ut, format('select count(*) from public.athlete where id = %L', v_a)), 0::bigint, 'the athlete record is hidden from T');
  return next is(tests.q_count(ut, format('select count(*) from public.change_history where athlete_id = %L', v_a)), 0::bigint, 'and so is the history');
end;
$f$;

select * from runtests('tests'::name);

rollback;
