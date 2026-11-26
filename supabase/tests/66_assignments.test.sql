-- An administrator assigns athletes to coordinators from the app. Run AS the signed-in people (grants and row-level
-- security apply). Mirrors app/src/lib/assignApi.ts. The world: athletes A and B, coordinator S (main for A),
-- coordinator T (nobody), administrator X.
begin;

create schema if not exists tests;

create function tests.test_only_an_administrator_can_change_assignments() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; us uuid; ut uuid; ux uuid; v_a uuid; v_b uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); ux := tests.gid('admin_x');
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b');

  -- nobody but an administrator: not the coordinator, not an unassigned coordinator, not an athlete, not a login with no role
  return next ok(tests.q_fails(ut, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, ut)), 'a coordinator cannot assign themselves an athlete');
  return next ok(tests.q_fails(us, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (%L, %L, 'secondary')$q$, v_b, us)), 'not even as an extra coordinator');
  return next ok(tests.q_fails(us, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, ut)), 'or assign someone else');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_a, ut)), 'an athlete cannot assign a coordinator');
  return next ok(tests.q_fails(tests.gid('user_z'), format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_a, ut)), 'nor a login with no athlete record');
  return next is(tests.q_affected(us, format($q$update public.athlete_staff_assignment set role_on_athlete = 'secondary' where athlete_id = %L$q$, v_a)), 0::bigint, 'a coordinator cannot change their own role');
  return next is(tests.q_affected(us, format($q$delete from public.athlete_staff_assignment where athlete_id = %L$q$, v_a)), 0::bigint, 'or remove themselves');
  return next is(tests.q_affected(ua, format($q$delete from public.athlete_staff_assignment where athlete_id = %L$q$, v_a)), 0::bigint, 'an athlete cannot remove their coordinator');
  return next is(tests.q_affected(ub, $q$delete from public.athlete_staff_assignment$q$), 0::bigint, 'another athlete cannot remove anything');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id in (v_a, v_b)), 1::bigint, 'nothing changed');

  -- the administrator
  return next is(tests.q_affected(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, ut)), 1::bigint, 'the administrator assigns T to B');
  return next is((select assigned_by from public.athlete_staff_assignment where athlete_id = v_b), ux, 'and is recorded as the one who did');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_b), 'primary', 'the default role is main');
  return next is((select count(*) from public.change_history where table_name = 'athlete_staff_assignment' and athlete_id = v_b and change_type = 'created' and changed_by = ux), 1::bigint,
    'the change history says who assigned');
  return next is(tests.q_count(ut, format('select count(*) from public.athlete where id = %L', v_b)), 1::bigint, 'T can now open B');
  return next is(tests.q_count(us, format('select count(*) from public.athlete where id = %L', v_b)), 0::bigint, 'S still cannot');
  return next is(tests.q_affected(ux, format($q$delete from public.athlete_staff_assignment where athlete_id = %L and staff_user_id = %L$q$, v_b, ut)), 1::bigint, 'the administrator removes T from B');
  return next is(tests.q_count(ut, format('select count(*) from public.athlete where id = %L', v_b)), 0::bigint, 'and T loses access at once');
  return next is((select count(*) from public.change_history where table_name = 'athlete_staff_assignment' and athlete_id = v_b and change_type = 'deleted' and changed_by = ux), 1::bigint,
    'the removal is in the change history');
end;
$f$;

create function tests.test_a_disabled_administrator_can_no_longer_assign() returns setof text language plpgsql as $f$
declare
  ut uuid; ux uuid; v_b uuid;
begin
  perform tests.world();
  ut := tests.gid('staff_t'); ux := tests.gid('admin_x'); v_b := tests.gid('athlete_b');
  update public.app_user set status = 'disabled' where user_id = ux;
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, ut)), 'a disabled administrator cannot assign');
  update public.app_user set status = 'active' where user_id = ux;
  update public.app_user set role = 'staff' where user_id = ux;
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, ut)), 'and an administrator demoted to coordinator cannot either');
end;
$f$;

create function tests.test_only_an_active_coordinator_can_be_assigned() returns setof text language plpgsql as $f$
declare
  ux uuid; v_b uuid; v_off uuid; v_hidden uuid; v_admin2 uuid;
begin
  perform tests.world();
  ux := tests.gid('admin_x'); v_b := tests.gid('athlete_b');

  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, tests.gid('user_a'))),
    'an athlete cannot be assigned as a coordinator');
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, tests.gid('user_z'))),
    'nor a login with no staff profile');

  v_off := tests.mk_staff('off@example.com');
  update public.app_user set status = 'disabled' where user_id = v_off;
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, v_off)),
    'a coordinator whose account is disabled cannot be assigned');

  v_hidden := tests.mk_staff('retired@example.com');
  update public.staff_profile set active = false where user_id = v_hidden;
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, v_hidden)),
    'nor one whose staff profile is switched off');

  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, gen_random_uuid())), 'nor someone who does not exist');
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, gen_random_uuid(), tests.gid('staff_t'))), 'nor can an athlete who does not exist be assigned');

  v_admin2 := tests.mk_staff('x2@example.com', 'admin');
  return next is(tests.q_affected(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (%L, %L, 'secondary')$q$, v_b, v_admin2)), 1::bigint,
    'an administrator can be assigned (to receive the notes)');

  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, v_admin2)), 'the same coordinator cannot be assigned twice');
end;
$f$;

create function tests.test_an_athlete_has_one_main_coordinator() returns setof text language plpgsql as $f$
declare
  us uuid; ut uuid; ux uuid; v_a uuid; v_third uuid;
begin
  perform tests.world();
  us := tests.gid('staff_s'); ut := tests.gid('staff_t'); ux := tests.gid('admin_x'); v_a := tests.gid('athlete_a');
  v_third := tests.mk_staff('third@example.com');

  -- S is main for A (from the world). Adding T as main moves S to extra.
  return next is(tests.q_affected(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (%L, %L, 'primary')$q$, v_a, ut)), 1::bigint,
    'a new main coordinator can be added');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut), 'primary', 'T is main');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = us), 'secondary', 'and S moved to extra, still assigned');
  return next is(tests.q_count(us, format('select count(*) from public.athlete where id = %L', v_a)), 1::bigint, 'S still sees A');

  -- an extra coordinator is added without disturbing the main
  return next is(tests.q_affected(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (%L, %L, 'secondary')$q$, v_a, v_third)), 1::bigint, 'an extra coordinator is added');
  return next is((select staff_user_id from public.athlete_staff_assignment where athlete_id = v_a and role_on_athlete = 'primary'), ut, 'T is still the only main');

  -- making an existing one main
  return next is(tests.q_affected(ux, format($q$update public.athlete_staff_assignment set role_on_athlete = 'primary' where athlete_id = %L and staff_user_id = %L$q$, v_a, v_third)), 1::bigint,
    'an extra coordinator can be made main');
  return next is((select array_agg(staff_user_id order by role_on_athlete) from public.athlete_staff_assignment where athlete_id = v_a and role_on_athlete = 'primary'), array[v_third], 'exactly one main: the new one');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a and role_on_athlete = 'secondary'), 2::bigint, 'the other two are extra');
  return next is(tests.q_affected(ux, format($q$update public.athlete_staff_assignment set role_on_athlete = 'secondary' where athlete_id = %L and staff_user_id = %L$q$, v_a, v_third)), 1::bigint,
    'a main coordinator can be made an extra one (an athlete may have no main for a while)');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a and role_on_athlete = 'primary'), 0::bigint, 'and then nobody is main');

  -- the move shows in the history
  return next ok((select count(*) from public.change_history where table_name = 'athlete_staff_assignment' and athlete_id = v_a and change_type = 'updated') >= 3,
    'every role change is in the change history');

  -- other athletes are not touched
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = tests.gid('athlete_b')), 0::bigint, 'another athlete''s assignments are not touched');
end;
$f$;

create function tests.test_only_the_role_of_an_assignment_can_be_changed() returns setof text language plpgsql as $f$
declare
  ut uuid; ux uuid; v_a uuid; v_b uuid;
begin
  perform tests.world();
  ut := tests.gid('staff_t'); ux := tests.gid('admin_x'); v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b');

  return next ok(tests.q_fails(ux, format($q$update public.athlete_staff_assignment set staff_user_id = %L where athlete_id = %L$q$, ut, v_a)), 'an assignment cannot be re-pointed to another coordinator');
  return next ok(tests.q_fails(ux, format($q$update public.athlete_staff_assignment set athlete_id = %L where athlete_id = %L$q$, v_b, v_a)), 'or to another athlete');
  return next ok(tests.q_fails(ux, format($q$update public.athlete_staff_assignment set assigned_by = %L where athlete_id = %L$q$, ut, v_a)), 'the author cannot be rewritten');
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, assigned_by) values (%L, %L, %L)$q$, v_b, ut, tests.gid('staff_s'))),
    'the author cannot be chosen on a new assignment');
  return next ok(tests.q_fails(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, assigned_at) values (%L, %L, now() - interval '1 year')$q$, v_b, ut)),
    'nor the date');

  -- an assignment made in the dashboard (no signed-in user) has no author recorded
  insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (v_b, ut);
  return next ok((select assigned_by from public.athlete_staff_assignment where athlete_id = v_b) is null, 'a dashboard assignment has no app author');
end;
$f$;

create function tests.test_removing_an_assignment_ends_the_access_and_the_notes() returns setof text language plpgsql as $f$
declare
  us uuid; ut uuid; ux uuid; v_a uuid;
begin
  perform tests.world();
  us := tests.gid('staff_s'); ut := tests.gid('staff_t'); ux := tests.gid('admin_x'); v_a := tests.gid('athlete_a');
  insert into public.athlete_note (athlete_id, sender, sender_user_id, body) values (v_a, 'athlete', tests.gid('user_a'), 'A question');   -- written as the owner

  perform tests.q_affected(ux, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id, role_on_athlete) values (%L, %L, 'secondary')$q$, v_a, ut));
  return next is(tests.q_count(ut, format('select count(*) from public.athlete_note where athlete_id = %L', v_a)), 1::bigint, 'a newly assigned coordinator can read the conversation');
  return next is(tests.q_count(ut, format('select count(*) from public.next_step where athlete_id = %L', v_a)), 1::bigint, 'and the athlete''s next steps');
  perform tests.q_affected(ux, format($q$delete from public.athlete_staff_assignment where athlete_id = %L and staff_user_id = %L$q$, v_a, ut));
  return next is(tests.q_count(ut, format('select count(*) from public.athlete_note where athlete_id = %L', v_a)), 0::bigint, 'after removal the conversation is closed to them');
  return next is(tests.q_count(ut, format('select count(*) from public.activity_entry where athlete_id = %L', v_a)), 0::bigint, 'and so is the activity log');
  return next is(tests.q_count(us, format('select count(*) from public.athlete_note where athlete_id = %L', v_a)), 1::bigint, 'the main coordinator is not affected');
end;
$f$;

select * from runtests('tests'::name);

rollback;
