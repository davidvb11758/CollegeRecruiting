-- WP8: the writes the My List, activity and next-step screens make, run AS the athlete (or the assigned coordinator)
-- so grants and row-level security apply. Mirrors app/src/lib/listApi.ts. The rules themselves are also covered
-- in 10_constraints and 20_rls; this file checks the flows the screens depend on.
begin;

create schema if not exists tests;

create function tests.test_club_day_is_chicago() returns setof text language plpgsql as $f$
begin
  return next is(private.club_today(), (now() at time zone 'America/Chicago')::date, 'the database day is the Chicago day');
  return next is(
    (select (timestamptz '2026-11-11 03:00:00+00' at time zone coalesce((select time_zone from public.club limit 1), 'America/Chicago'))::date),
    date '2026-11-10', '9 pm Chicago time on Nov 10 is still Nov 10 (UTC would say Nov 11)');
end;
$f$;

create function tests.test_home_buckets_follow_the_club_day() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_u uuid;
  v_l uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_u := tests.gid('user_a');
  v_l := tests.gid('list_a');
  -- world() left one open step due in 3 days; finish it and add one of each kind through the app's own calls
  perform tests.q_affected(v_u, format($q$update public.next_step set status = 'done' where athlete_college_id = %L$q$, v_l));
  return next is(tests.q_affected(v_u, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Late', private.club_today() - 2)$q$, v_a, v_l)),
    1::bigint, 'a new step can be added once the old one is done');
  return next is(tests.q_text(v_u, $q$select bucket from public.next_steps_due where description = 'Late'$q$), 'overdue', 'two days ago is overdue');
  perform tests.q_affected(v_u, format($q$update public.next_step set status = 'skipped' where athlete_college_id = %L and status = 'open'$q$, v_l));
  perform tests.q_affected(v_u, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Soon', private.club_today() + 7)$q$, v_a, v_l));
  return next is(tests.q_text(v_u, $q$select bucket from public.next_steps_due where description = 'Soon'$q$), 'this_week', 'seven days out is this week');
  perform tests.q_affected(v_u, format($q$update public.next_step set status = 'done' where athlete_college_id = %L and status = 'open'$q$, v_l));
  perform tests.q_affected(v_u, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Far', private.club_today() + 8)$q$, v_a, v_l));
  return next is(tests.q_text(v_u, $q$select bucket from public.next_steps_due where description = 'Far'$q$), 'later', 'eight days out is later');
  return next is(tests.q_count(v_u, format($q$select count(*) from public.next_steps_due where list_id = %L$q$, v_l)), 1::bigint,
    'finished and skipped steps are not in the due list');
  return next ok(tests.q_fails(v_u, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'Second open', private.club_today() + 1)$q$, v_a, v_l)),
    'a second open step for the same college is refused');
end;
$f$;

create function tests.test_removing_and_restoring_a_college() returns setof text language plpgsql as $f$
declare
  v_u uuid;
  v_l uuid;
begin
  perform tests.world();
  v_u := tests.gid('user_a');
  v_l := tests.gid('list_a');
  return next is(tests.q_count(v_u, 'select count(*) from public.next_steps_due'), 1::bigint, 'the open step shows while the college is on the list');
  return next is(tests.q_affected(v_u, format('update public.athlete_college set archived_at = now() where id = %L', v_l)), 1::bigint, 'the athlete can remove a college (archive)');
  return next is(tests.q_count(v_u, 'select count(*) from public.next_steps_due'), 0::bigint, 'its steps leave the due list');
  return next is(tests.q_count(v_u, format('select count(*) from public.my_list where list_id = %L and archived_at is not null', v_l)), 1::bigint,
    'the removed college is still readable, flagged as removed');
  return next is(tests.q_count(v_u, format('select count(*) from public.activity_entry where athlete_college_id = %L', v_l)), 2::bigint, 'its history is kept (the note and the automatic "added" entry)');
  return next is(tests.q_affected(v_u, format('update public.athlete_college set archived_at = null where id = %L', v_l)), 1::bigint, 'the athlete can restore it');
  return next is(tests.q_count(v_u, 'select count(*) from public.next_steps_due'), 1::bigint, 'its steps come back');
end;
$f$;

create function tests.test_a_stage_change_writes_one_automatic_entry_that_nobody_can_edit() returns setof text language plpgsql as $f$
declare
  v_u uuid;
  v_l uuid;
begin
  perform tests.world();
  v_u := tests.gid('user_a');
  v_l := tests.gid('list_a');
  return next is(tests.q_affected(v_u, format($q$update public.athlete_college set stage = 'contacted', priority = 1 where id = %L$q$, v_l)), 1::bigint, 'stage and priority saved together');
  return next is(tests.q_count(v_u, format($q$select count(*) from public.activity_entry where athlete_college_id = %L and source = 'system' and summary like 'Stage:%%'$q$, v_l)),
    1::bigint, 'one automatic stage entry');
  return next is(tests.q_count(v_u, format($q$select count(*) from public.activity_entry where athlete_college_id = %L and source = 'system' and summary like 'Priority:%%'$q$, v_l)),
    1::bigint, 'one automatic priority entry');
  return next is(tests.q_affected(v_u, format($q$update public.athlete_college set why_i_like_text = 'Good nursing program', stage = 'contacted' where id = %L$q$, v_l)), 1::bigint, 'saving notes with the same stage');
  return next is(tests.q_count(v_u, format($q$select count(*) from public.activity_entry where athlete_college_id = %L and source = 'system'$q$, v_l)),
    3::bigint, 'an unchanged stage adds no entry (added, stage, priority = 3)');
  return next is(tests.q_affected(v_u, format($q$update public.activity_entry set summary = 'Changed' where athlete_college_id = %L and source = 'system'$q$, v_l)), 0::bigint,
    'automatic entries cannot be edited');
  return next is(tests.q_affected(v_u, format($q$update public.activity_entry set deleted_at = now() where athlete_college_id = %L and source = 'system'$q$, v_l)), 0::bigint,
    'and cannot be hidden');
end;
$f$;

create function tests.test_my_list_last_activity_ignores_automatic_entries() returns setof text language plpgsql as $f$
declare
  v_u uuid;
  v_l uuid;
  v_a uuid;
begin
  perform tests.world();
  v_u := tests.gid('user_a');
  v_a := tests.gid('athlete_a');
  v_l := tests.gid('list_a');
  perform tests.q_affected(v_u, format($q$update public.athlete_college set stage = 'researching', priority = 2 where id = %L$q$, v_l));
  return next ok(tests.q_text(v_u, format($q$select coalesce(last_activity_date::text, 'none') from public.my_list where list_id = %L$q$, v_l)) in ('none', current_date::text, private.club_today()::text),
    'automatic entries do not count as contact (world() has one real note dated today)');
  perform tests.q_affected(v_u, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_date, activity_type_code, summary) values (%L, %L, private.club_today() - 20, 'other_note', 'Old note')$q$, v_a, v_l));
  return next ok(tests.q_count(v_u, format($q$select days_silent from public.my_list where list_id = %L$q$, v_l)) <= 1, 'days quiet counts from the newest real entry');
end;
$f$;

create function tests.test_editing_and_hiding_the_athletes_own_entries() returns setof text language plpgsql as $f$
declare
  v_u uuid;
  v_a uuid;
  v_l uuid;
begin
  perform tests.world();
  v_u := tests.gid('user_a');
  v_a := tests.gid('athlete_a');
  v_l := tests.gid('list_a');
  return next is(tests.q_affected(v_u, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_date, activity_type_code, direction, summary, follow_up_needed, outcome)
    values (%L, %L, private.club_today(), 'email', 'i_contacted', 'Intro email', true, 'waiting')$q$, v_a, v_l)), 1::bigint, 'log an email');
  return next ok(tests.q_fails(v_u, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'email', 'No direction')$q$, v_a, v_l)),
    'an email needs a direction');
  return next ok(tests.q_fails(v_u, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_date, activity_type_code, summary) values (%L, %L, private.club_today() + 3, 'other_note', 'Future')$q$, v_a, v_l)),
    'a date in the future is refused');
  return next ok(tests.q_fails(v_u, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, attachment_url) values (%L, %L, 'other_note', 'Bad link', 'file:///x')$q$, v_a, v_l)),
    'an attachment link must be http(s)');
  return next is(tests.q_affected(v_u, format($q$update public.activity_entry set summary = 'Intro email with video' where athlete_college_id = %L and summary = 'Intro email'$q$, v_l)), 1::bigint, 'edit your own entry');
  return next is(tests.q_affected(v_u, format($q$update public.activity_entry set deleted_at = now() where athlete_college_id = %L and summary = 'Intro email with video'$q$, v_l)), 1::bigint, 'hide your own entry');
  return next is(tests.q_count(v_u, format($q$select count(*) from public.activity_entry where athlete_college_id = %L and summary = 'Intro email with video'$q$, v_l)), 1::bigint,
    'a hidden entry is kept (the app filters it out, the history keeps it)');
  return next is(tests.q_text(v_u, format($q$select deleted_by::text from public.activity_entry where athlete_college_id = %L and summary = 'Intro email with video'$q$, v_l)), v_u::text, 'who hid it is recorded');
  return next ok(not has_table_privilege('authenticated', 'public.activity_entry', 'DELETE'), 'entries cannot be deleted for real');
end;
$f$;

create function tests.test_a_coordinators_entry_is_labelled_staff() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_l uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_l := tests.gid('list_a');
  perform tests.q_affected(tests.gid('staff_s'), format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, summary, source) values (%L, %L, 'phone_call', 'i_contacted', 'Coordinator call', 'athlete')$q$, v_a, v_l));
  return next is(tests.q_text(tests.gid('user_a'), format($q$select source::text from public.activity_entry where athlete_college_id = %L and summary = 'Coordinator call'$q$, v_l)), 'staff',
    'the database labels it staff even if the app sent "athlete"');
  return next is(tests.q_text(tests.gid('user_a'), format($q$select entered_by::text from public.activity_entry where athlete_college_id = %L and summary = 'Coordinator call'$q$, v_l)), tests.gid('staff_s')::text,
    'and records which coordinator');
  return next is(tests.q_affected(tests.gid('staff_s'), format($q$update public.next_step set description = 'Coordinator changed it' where athlete_college_id = %L and status = 'open'$q$, v_l)), 1::bigint,
    'the assigned coordinator can change the athlete''s next step');
end;
$f$;

create function tests.test_own_coach_contacts_and_main_coach() returns setof text language plpgsql as $f$
declare
  v_a uuid;
  v_u uuid;
  v_l uuid;
  v_p bigint;
  v_c bigint;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  v_u := tests.gid('user_a');
  v_l := tests.gid('list_a');
  v_p := tests.bid('program_1');
  return next is(tests.q_affected(v_u, format($q$insert into public.college_coach (program_id, owner_athlete_id, full_name, title, email) values (%L, %L, 'Met At Camp', 'assistant', 'camp@example.edu')$q$, v_p, v_a)),
    1::bigint, 'the athlete adds their own contact');
  select id into v_c from public.college_coach where full_name = 'Met At Camp';
  return next is(tests.q_affected(v_u, format('update public.athlete_college set main_coach_id = %L where id = %L', v_c, v_l)), 1::bigint, 'and can make it the main contact');
  return next is(tests.q_count(tests.gid('user_b'), format($q$select count(*) from public.college_coach where full_name = 'Met At Camp'$q$)), 0::bigint, 'another family cannot see it');
  return next ok(tests.q_fails(tests.gid('user_b'), format('update public.athlete_college set main_coach_id = %L where id = %L', v_c, tests.gid('list_b'))),
    'and cannot use it as their own main contact');
  return next is(tests.q_affected(v_u, format('delete from public.college_coach where id = %L', v_c)), 1::bigint, 'the athlete can delete their own contact');
  return next is(tests.q_count(v_u, format('select count(*) from public.athlete_college where id = %L and main_coach_id is null', v_l)), 1::bigint, 'the list entry simply has no main contact again');
  return next is(tests.q_affected(v_u, format('delete from public.college_coach where id = %L', tests.bid('coach_master'))), 0::bigint, 'a shared coach record cannot be deleted by an athlete');
end;
$f$;

select * from runtests('tests'::name);

rollback;
