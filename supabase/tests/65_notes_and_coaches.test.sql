-- Notes and questions between an athlete and their coordinators, and several coaches on one activity entry.
-- Run AS the signed-in people (grants and row-level security apply). Mirrors app/src/lib/noteApi.ts and listApi.ts.
begin;

create schema if not exists tests;

-- ---------------------------------------------------------------------------------------------
-- Several coaches on an activity entry
-- ---------------------------------------------------------------------------------------------

create function tests.test_an_activity_entry_can_name_several_coaches() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; v_a uuid; v_la uuid; v_p1 bigint; v_other bigint; k1 bigint; k2 bigint; k3 bigint; k_far bigint; k_private bigint; k_theirs bigint; v_e uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); v_a := tests.gid('athlete_a'); v_la := tests.gid('list_a');
  v_p1 := tests.bid('program_1'); v_other := tests.bid('program_2');
  insert into public.college_coach (program_id, full_name, title) values (v_p1, 'Coach One', 'head') returning id into k1;
  insert into public.college_coach (program_id, full_name, title) values (v_p1, 'Coach Two', 'assistant') returning id into k2;
  insert into public.college_coach (program_id, full_name, title) values (v_p1, 'Coach Three', 'assistant') returning id into k3;
  insert into public.college_coach (program_id, full_name, title) values (v_other, 'Far Coach', 'head') returning id into k_far;
  insert into public.college_coach (program_id, full_name, title, owner_athlete_id) values (v_p1, 'Private Of A', 'assistant', v_a) returning id into k_private;
  insert into public.college_coach (program_id, full_name, title, owner_athlete_id) values (v_p1, 'Private Of B', 'assistant', tests.gid('athlete_b')) returning id into k_theirs;

  return next is(tests.q_affected(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, coach_ids, summary)
                                                values (%L, %L, 'email', 'i_contacted', array[%s, %s, %s]::bigint[], 'Emailed and copied the assistants')$q$, v_a, v_la, k2, k1, k2)),
    1::bigint, 'an entry can name several coaches');
  select id into v_e from public.activity_entry where summary = 'Emailed and copied the assistants';
  return next is((select coach_ids from public.activity_entry where id = v_e), array[k2, k1], 'in the order given, each coach once');
  return next is(tests.q_affected(ua, format($q$update public.activity_entry set coach_ids = array[%s, %s, %s]::bigint[] where id = %L$q$, k1, k2, k3, v_e)), 1::bigint, 'the list can be changed');
  return next is((select coach_ids from public.activity_entry where id = v_e), array[k1, k2, k3], 'and is saved');
  return next is(tests.q_affected(ua, format($q$update public.activity_entry set coach_ids = '{}' where id = %L$q$, v_e)), 1::bigint, 'or cleared');

  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set coach_ids = array[%s, %s]::bigint[] where id = %L$q$, k1, k_far, v_e)),
    'a coach of another program is refused, even among good ones');
  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set coach_ids = array[%s]::bigint[] where id = %L$q$, k_theirs, v_e)), 'another athlete''s private contact is refused');
  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set coach_ids = array[999999999]::bigint[] where id = %L$q$, v_e)), 'a coach that does not exist is refused');
  return next is(tests.q_affected(ua, format($q$update public.activity_entry set coach_ids = array[%s, %s]::bigint[] where id = %L$q$, k1, k_private, v_e)), 1::bigint,
    'the athlete''s own private contact is accepted');
  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set coach_ids = (select array_agg(g::bigint) from generate_series(1, 11) g) where id = %L$q$, v_e)), 'more than ten coaches is refused');

  -- a coordinator logging for the athlete may name the same coaches
  return next is(tests.q_affected(us, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, coach_ids, summary)
                                                values (%L, %L, 'phone_call', 'i_contacted', array[%s, %s]::bigint[], 'Coordinator called both')$q$, v_a, v_la, k1, k2)), 1::bigint,
    'a coordinator can log with several coaches');

  -- deleting the private contact takes it out of the entries that named it
  perform tests.q_affected(ua, format($q$delete from public.college_coach where id = %s$q$, k_private));
  return next is((select coach_ids from public.activity_entry where id = v_e), array[k1], 'removing a contact removes it from the entries that named it');
  return next ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'activity_entry' and column_name = 'coach_id'),
    'the old single-coach column is gone');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Notes and questions
-- ---------------------------------------------------------------------------------------------

create function tests.test_an_athlete_sends_a_note_to_their_coordinators() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; ut uuid; v_a uuid; v_n uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); v_a := tests.gid('athlete_a');

  return next is(tests.q_affected(ua, format($q$insert into public.athlete_note (athlete_id, kind, body) values (%L, 'question', '  Can you look at my list?  ')$q$, v_a)), 1::bigint,
    'the athlete sends a question');
  select id into v_n from public.athlete_note where athlete_id = v_a;
  return next is((select sender from public.athlete_note where id = v_n), 'athlete', 'it is labelled as the athlete''s');
  return next is((select sender_user_id from public.athlete_note where id = v_n), ua, 'and carries the real author');
  return next is((select body from public.athlete_note where id = v_n), 'Can you look at my list?', 'the text is trimmed');
  return next is((select kind from public.athlete_note where id = v_n), 'question', 'the kind is saved');

  -- the label and author cannot be chosen
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body, sender, sender_user_id) values (%L, 'I am staff', 'staff', %L)$q$, v_a, us)),
    'the sender and author columns cannot be written by the athlete');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body, sender) values (%L, 'I am staff', 'staff')$q$, v_a)), 'the sender label alone cannot be written either');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body, sender_user_id) values (%L, 'As someone else', %L)$q$, v_a, us)), 'nor the author alone');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body, created_at) values (%L, 'Back-dated', now() - interval '3 days')$q$, v_a)), 'nor the time');

  -- content rules
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body) values (%L, '   ')$q$, v_a)), 'an empty note is refused');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, body) values (%L, %L)$q$, v_a, repeat('x', 1001))), 'a note over 1000 characters is refused');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note (athlete_id, kind, body) values (%L, 'shout', 'x')$q$, v_a)), 'an unknown kind is refused');

  -- no editing, no deleting
  return next ok(tests.q_fails(ua, format($q$update public.athlete_note set body = 'changed' where id = %L$q$, v_n)), 'a note cannot be edited');
  return next ok(tests.q_fails(ua, format($q$delete from public.athlete_note where id = %L$q$, v_n)), 'or deleted by the athlete');
  return next ok(tests.q_fails(us, format($q$delete from public.athlete_note where id = %L$q$, v_n)), 'or by a coordinator');

  -- who may read the conversation
  return next is(tests.q_count(ua, 'select count(*) from public.athlete_note'), 1::bigint, 'the athlete reads it');
  return next is(tests.q_count(us, 'select count(*) from public.athlete_note'), 1::bigint, 'the assigned coordinator reads it');
  return next is(tests.q_count(ut, 'select count(*) from public.athlete_note'), 0::bigint, 'a coordinator who is not assigned does not');
  return next is(tests.q_count(tests.gid('user_b'), 'select count(*) from public.athlete_note'), 0::bigint, 'another athlete does not');
  return next is(tests.q_count(tests.gid('admin_x'), 'select count(*) from public.athlete_note'), 1::bigint, 'an administrator does');
  return next is(tests.q_count(tests.gid('user_z'), 'select count(*) from public.athlete_note'), 0::bigint, 'a login with no athlete record does not');

  -- writing for someone else
  return next ok(tests.q_fails(tests.gid('user_b'), format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'Not mine')$q$, v_a)), 'another athlete cannot write into this conversation');
  return next ok(tests.q_fails(ut, format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'Not my athlete')$q$, v_a)), 'nor an unassigned coordinator');
  return next ok(tests.q_fails(tests.gid('user_z'), format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'Hello')$q$, v_a)), 'nor a login with no athlete record');
end;
$f$;

create function tests.test_a_coordinator_sends_a_note_to_the_athlete() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; v_a uuid; v_n uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); v_a := tests.gid('athlete_a');

  return next is(tests.q_affected(us, format($q$insert into public.athlete_note (athlete_id, kind, body) values (%L, 'note', 'Please send me your new film')$q$, v_a)), 1::bigint,
    'the assigned coordinator sends a note');
  select id into v_n from public.athlete_note where athlete_id = v_a;
  return next is((select sender from public.athlete_note where id = v_n), 'staff', 'it is labelled as staff');
  return next is((select sender_user_id from public.athlete_note where id = v_n), us, 'and carries the coordinator');
  return next is(tests.q_text(ua, format($q$select sender_name from public.note_thread where note_id = %L$q$, v_n)), 'Coach s@example.com', 'the athlete sees the coordinator''s name');
  return next is(tests.q_text(us, format($q$select mine::text from public.note_thread where note_id = %L$q$, v_n)), 'true', 'the sender sees it marked as their own');
  return next is(tests.q_text(ua, format($q$select mine::text from public.note_thread where note_id = %L$q$, v_n)), 'false', 'and the athlete does not');
  return next is(tests.q_affected(tests.gid('admin_x'), format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'From the administrator')$q$, v_a)), 1::bigint,
    'an administrator can write too');
  return next is((select sender from public.athlete_note where body = 'From the administrator'), 'staff', 'labelled as staff');
end;
$f$;

create function tests.test_new_notes_reach_the_right_people_until_dismissed() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; ut uuid; v_a uuid; v_to_staff uuid; v_to_athlete uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); v_a := tests.gid('athlete_a');
  -- two coordinators on this athlete
  insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (v_a, ut, 'secondary');

  perform tests.q_affected(ua, format($q$insert into public.athlete_note (athlete_id, kind, body) values (%L, 'question', 'Which camps should I do?')$q$, v_a));
  perform tests.q_affected(us, format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'Film due Friday')$q$, v_a));
  select note_id into v_to_staff from public.note_thread where body = 'Which camps should I do?';
  select note_id into v_to_athlete from public.note_thread where body = 'Film due Friday';

  -- the athlete's question is for both assigned coordinators, not for the athlete; the coordinator's note is for the athlete only
  return next is(tests.q_count(us, 'select count(*) from public.note_thread where for_me and not dismissed'), 1::bigint, 'the first coordinator has the athlete''s question waiting');
  return next is(tests.q_count(ut, 'select count(*) from public.note_thread where for_me and not dismissed'), 1::bigint, 'and so does the second');
  return next is(tests.q_text(ua, 'select string_agg(body, ''|'') from public.note_thread where for_me and not dismissed'), 'Film due Friday', 'the athlete has only the coordinator''s note waiting');
  return next is(tests.q_count(tests.gid('admin_x'), 'select count(*) from public.note_thread where for_me'), 0::bigint, 'an administrator who is not assigned is not a recipient');
  return next is(tests.q_count(tests.gid('user_b'), 'select count(*) from public.note_thread'), 0::bigint, 'another athlete sees none of it');

  -- dismissing is per person
  return next is(tests.q_affected(us, format($q$insert into public.athlete_note_dismissal (note_id, user_id) values (%L, %L)$q$, v_to_staff, us)), 1::bigint, 'the first coordinator dismisses the question');
  return next is(tests.q_count(us, 'select count(*) from public.note_thread where for_me and not dismissed'), 0::bigint, 'it leaves their home');
  return next is(tests.q_count(ut, 'select count(*) from public.note_thread where for_me and not dismissed'), 1::bigint, 'but stays on the second coordinator''s');
  return next is(tests.q_count(us, 'select count(*) from public.athlete_note'), 2::bigint, 'the conversation still holds the dismissed note');
  return next ok(tests.q_fails(us, format($q$insert into public.athlete_note_dismissal (note_id, user_id) values (%L, %L)$q$, v_to_staff, us)), 'dismissing twice is refused (it is already recorded)');

  -- the person is taken from the sign-in when the app sends only the note
  return next is(tests.q_affected(ut, format($q$insert into public.athlete_note_dismissal (note_id) values (%L)$q$, v_to_staff)), 1::bigint, 'the second coordinator dismisses without naming themselves');
  return next is(tests.q_count(ut, 'select count(*) from public.note_thread where for_me and not dismissed'), 0::bigint, 'and it leaves their home too');
  return next is((select user_id from public.athlete_note_dismissal where note_id = v_to_staff and user_id = ut), ut, 'recorded against them');

  -- dismissals cannot be forged or used to probe
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_note_dismissal (note_id, user_id) values (%L, %L)$q$, v_to_athlete, ut)), 'nobody can dismiss on behalf of someone else');
  return next ok(tests.q_fails(tests.gid('user_b'), format($q$insert into public.athlete_note_dismissal (note_id, user_id) values (%L, %L)$q$, v_to_athlete, tests.gid('user_b'))),
    'nobody can dismiss a note they cannot see');
  return next is(tests.q_count(ut, 'select count(*) from public.athlete_note_dismissal'), 1::bigint, 'a person sees only their own dismissals, not the first coordinator''s');
  return next ok(tests.q_fails(ua, format($q$delete from public.athlete_note_dismissal where note_id = %L$q$, v_to_athlete)), 'dismissals cannot be deleted through the app');
  return next ok(tests.q_fails(ua, format($q$update public.athlete_note_dismissal set user_id = %L where note_id = %L$q$, ut, v_to_staff)), 'or changed');
end;
$f$;

create function tests.test_deleting_an_athlete_removes_their_notes() returns setof text language plpgsql as $f$
declare
  v_a uuid; v_n uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a');
  perform tests.q_affected(tests.gid('user_a'), format($q$insert into public.athlete_note (athlete_id, body) values (%L, 'Remember me')$q$, v_a));
  select id into v_n from public.athlete_note where athlete_id = v_a;
  perform tests.q_affected(tests.gid('staff_s'), format($q$insert into public.athlete_note_dismissal (note_id, user_id) values (%L, %L)$q$, v_n, tests.gid('staff_s')));
  delete from public.athlete where id = v_a;
  return next is((select count(*) from public.athlete_note where athlete_id = v_a), 0::bigint, 'the notes go with the athlete');
  return next is((select count(*) from public.athlete_note_dismissal where note_id = v_n), 0::bigint, 'and their dismissals');
end;
$f$;

select * from runtests('tests'::name);

rollback;
