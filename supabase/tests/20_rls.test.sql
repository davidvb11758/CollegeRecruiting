-- WP3 security tests (DATA-MODEL 8.5 plus extras). House style: xUnit; shared helpers come from helpers.sql.
-- tests.world() builds: athletes A and B, staff S (assigned to A only), staff T (assigned to nobody), admin X,
-- and Z (a login with no athlete record). tests.q_* run one statement AS a user so row-level security applies.
begin;

create schema if not exists tests;

-- ---------------------------------------------------------------------------------------------
-- Privileges: what the signed-out and signed-in roles can touch at all
-- ---------------------------------------------------------------------------------------------

create function tests.test_signed_out_role_has_no_privileges() returns setof text language plpgsql as $f$
begin
  return next is(
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')),
    0, 'anon has no privilege on any table or view in public');
  return next is(
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
    0, 'anon can run no function in public');
  return next is(
    (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    0, 'signed-in users can run no function in public (this closes the rls_auto_enable warning)');
  return next ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use the private schema');
  return next ok(tests.q_fails(null, 'select count(*) from public.athlete', 'anon'), 'a signed-out request to athlete is refused');
  return next ok(tests.q_fails(null, 'select count(*) from public.college', 'anon'), 'a signed-out request to the college list is refused');
  return next ok(tests.q_fails(null, 'select count(*) from public.my_list', 'anon'), 'a signed-out request to a view is refused');
  return next ok(tests.q_fails(null, 'select count(*) from public.change_history', 'anon'), 'a signed-out request to change history is refused');
end;
$f$;

create function tests.test_signed_in_role_cannot_write_protected_things() returns setof text language plpgsql as $f$
begin
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'role', 'UPDATE'), 'role cannot be changed from the app');
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'status', 'UPDATE'), 'status cannot be changed from the app');
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'user_id', 'UPDATE'), 'user_id cannot be changed from the app');
  return next ok(not has_table_privilege('authenticated', 'public.app_user', 'INSERT'), 'app_user rows are created by the sign-up trigger only');
  return next ok(not has_column_privilege('authenticated', 'public.athlete', 'user_id', 'UPDATE'), 'an athlete cannot be re-pointed to another login');
  return next ok(not has_table_privilege('authenticated', 'public.staff_profile', 'INSERT'), 'staff profiles are created in the dashboard');
  return next ok(not has_table_privilege('authenticated', 'public.athlete_staff_assignment', 'INSERT'), 'assignments are made in the dashboard');
  return next ok(not has_table_privilege('authenticated', 'public.athlete_staff_assignment', 'DELETE'), 'assignments are removed in the dashboard');
  return next ok(not has_table_privilege('authenticated', 'public.change_history', 'INSERT, UPDATE, DELETE'), 'change history is read-only for the app');
  return next ok(not has_table_privilege('authenticated', 'public.athlete', 'DELETE'), 'nobody deletes an athlete from the app');
  return next ok(not has_table_privilege('authenticated', 'public.athlete_college', 'DELETE'), 'list entries are archived, never deleted');
  return next ok(not has_table_privilege('authenticated', 'public.activity_entry', 'DELETE'), 'activity entries are soft-deleted, never removed');
  return next ok(not has_table_privilege('authenticated', 'public.next_step', 'DELETE'), 'next steps are never deleted');
  return next ok(not has_table_privilege('authenticated', 'public.college', 'DELETE'), 'colleges are not deleted from the app');
  return next ok(not has_table_privilege('authenticated', 'public.college_program', 'DELETE'), 'programs are not deleted from the app');
  return next ok(not has_table_privilege('authenticated', 'public.division', 'INSERT, UPDATE, DELETE'), 'lookup lists are edited in the dashboard');
  return next ok(not has_table_privilege('authenticated', 'public.zip_location', 'INSERT, UPDATE, DELETE'), 'the ZIP table is read-only');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Athletes cannot see or touch each other
-- ---------------------------------------------------------------------------------------------

create function tests.test_athlete_sees_only_their_own_data() returns setof text language plpgsql as $f$
declare
  v_a uuid; v_b uuid; ua uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); ua := tests.gid('user_a');

  return next is(tests.q_count(ua, 'select count(*) from public.athlete'), 1::bigint, 'A sees exactly one athlete record');
  return next is(tests.q_count(ua, format('select count(*) from public.athlete where id = %L', v_a)), 1::bigint, 'and it is their own');
  return next is(tests.q_count(ua, format('select count(*) from public.athlete where id = %L', v_b)), 0::bigint, 'A cannot read B by id');
  return next is(tests.q_count(ua, format('select count(*) from public.athlete_college where athlete_id = %L', v_b)), 0::bigint, 'A cannot read B''s list');
  return next is(tests.q_count(ua, format('select count(*) from public.activity_entry where athlete_id = %L', v_b)), 0::bigint, 'A cannot read B''s activity');
  return next is(tests.q_count(ua, format('select count(*) from public.next_step where athlete_id = %L', v_b)), 0::bigint, 'A cannot read B''s next steps');
  return next is(tests.q_count(ua, format('select count(*) from public.athlete_guardian where athlete_id = %L', v_b)), 0::bigint, 'A cannot read B''s guardians');
  return next is(tests.q_count(ua, 'select count(*) from public.activity_entry'), 2::bigint, 'A sees only their own two entries (one system, one note)');
  return next is(tests.q_count(ua, 'select count(*) from public.app_user'), 1::bigint, 'A sees only their own account row');
  return next is(tests.q_count(ua, 'select count(*) from public.athlete_staff_assignment'), 1::bigint, 'A sees only their own assignment');
  return next is(tests.q_count(ua, 'select count(*) from public.staff_profile'), 3::bigint, 'A can see the staff directory (their coordinators)');
end;
$f$;

create function tests.test_athlete_cannot_write_for_another_athlete() returns setof text language plpgsql as $f$
declare
  v_a uuid; v_b uuid; ua uuid; v_p2 bigint; v_lb uuid; v_la uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); ua := tests.gid('user_a');
  v_p2 := tests.bid('program_2'); v_lb := tests.gid('list_b'); v_la := tests.gid('list_a');

  return next ok(tests.q_fails(ua, format('insert into public.athlete_college (athlete_id, program_id) values (%L, %s)', v_b, tests.mk_program(10))),
    'A cannot add a college to B''s list');
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'forged')$q$, v_b, v_lb)),
    'A cannot log activity for B');
  return next ok(tests.q_fails(ua, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'forged', current_date)$q$, v_b, v_lb)),
    'A cannot set a next step for B');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_guardian (athlete_id, relationship, full_name) values (%L, 'father', 'forged')$q$, v_b)),
    'A cannot add a guardian to B');
  return next is(tests.q_affected(ua, format($q$update public.athlete set first_name = 'Hacked' where id = %L$q$, v_b)), 0::bigint, 'A cannot update B''s profile');
  return next is(tests.q_affected(ua, format($q$update public.athlete_college set priority = 1 where athlete_id = %L$q$, v_b)), 0::bigint, 'A cannot update B''s list');
  return next is(tests.q_affected(ua, format($q$update public.next_step set status = 'done' where athlete_id = %L$q$, v_b)), 0::bigint, 'A cannot complete B''s next step');
  -- re-pointing A's own rows at B
  insert into public.athlete_athletic (athlete_id, primary_position) values (v_a, 'OH');
  return next ok(tests.q_fails(ua, format('update public.athlete_college set athlete_id = %L where id = %L', v_b, v_la)),
    'A cannot move their own list entry to B');
  return next ok(tests.q_fails(ua, format('update public.activity_entry set athlete_id = %L where id = %L', v_b, tests.gid('entry_a'))),
    'A cannot move their own log entry to B');
  return next ok(tests.q_fails(ua, format('update public.athlete set user_id = %L where id = %L', tests.gid('user_b'), v_a)),
    'A cannot take over B''s login');
  return next ok(tests.q_fails(ua, format('update public.athlete_athletic set athlete_id = %L where athlete_id = %L', v_b, v_a)),
    'A cannot re-point profile tabs');
  return next is((select first_name from public.athlete where id = v_b), 'Test', 'B''s data is untouched');
end;
$f$;

create function tests.test_athlete_can_manage_their_own_data() returns setof text language plpgsql as $f$
declare
  v_a uuid; ua uuid; v_la uuid; v_p1 bigint;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); ua := tests.gid('user_a'); v_la := tests.gid('list_a'); v_p1 := tests.bid('program_1');

  return next is(tests.q_affected(ua, format($q$update public.athlete set preferred_name = 'Ace' where id = %L$q$, v_a)), 1::bigint, 'A can update their profile');
  return next is(tests.q_affected(ua, format($q$insert into public.athlete_athletic (athlete_id, primary_position) values (%L, 'S')$q$, v_a)), 1::bigint, 'A can fill the athletic tab');
  return next is(tests.q_affected(ua, format($q$insert into public.athlete_preference (athlete_id, competitiveness_bands) values (%L, array[1,2])$q$, v_a)), 1::bigint, 'A can save preferences');
  return next is(tests.q_affected(ua, format($q$update public.athlete_college set stage = 'contacted', priority = 2 where id = %L$q$, v_la)), 1::bigint, 'A can change stage and priority');
  return next is(tests.q_affected(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, direction, summary) values (%L, %L, 'email', 'i_contacted', 'Intro')$q$, v_a, v_la)),
    1::bigint, 'A can log activity');
  return next is(tests.q_affected(ua, format($q$update public.next_step set status = 'done' where athlete_id = %L$q$, v_a)), 1::bigint, 'A can complete a next step');
  return next is(tests.q_affected(ua, format($q$delete from public.athlete_guardian where athlete_id = %L$q$, v_a)), 1::bigint, 'A can remove a guardian');
  return next is(tests.q_count(ua, 'select count(*) from public.my_list'), 1::bigint, 'the list view shows A''s list');
  return next is(tests.q_count(ua, 'select count(*) from public.program_search where unitid between 900000 and 999999'), 2::bigint, 'any user can search the college database');
end;
$f$;

create function tests.test_athlete_cannot_delete_or_edit_system_rows() returns setof text language plpgsql as $f$
declare
  ua uuid; v_a uuid; v_sys uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); v_a := tests.gid('athlete_a');
  select e.id into v_sys from public.activity_entry e where e.athlete_id = v_a and e.source = 'system' limit 1;

  return next ok(tests.q_fails(ua, format('delete from public.athlete where id = %L', v_a)), 'A cannot delete their athlete record');
  return next ok(tests.q_fails(ua, format('delete from public.athlete_college where athlete_id = %L', v_a)), 'A cannot delete list entries');
  return next ok(tests.q_fails(ua, format('delete from public.activity_entry where athlete_id = %L', v_a)), 'A cannot delete activity entries');
  return next ok(tests.q_fails(ua, format('delete from public.next_step where athlete_id = %L', v_a)), 'A cannot delete next steps');
  return next ok(tests.q_fails(ua, 'delete from public.change_history'), 'A cannot delete change history');
  return next ok(tests.q_fails(ua, $q$update public.change_history set new_values = '{}'$q$), 'A cannot rewrite change history');
  return next ok(tests.q_fails(ua, $q$insert into public.change_history (table_name, record_id, change_type) values ('x', 'x', 'created')$q$), 'A cannot write change history');
  return next is(tests.q_affected(ua, format($q$update public.activity_entry set summary = 'edited' where id = %L$q$, v_sys)), 0::bigint, 'A cannot edit a system entry');
  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set deleted_at = now() where id = %L$q$, v_sys)) or
                 tests.q_affected(ua, format($q$update public.activity_entry set deleted_at = now() where id = %L$q$, v_sys)) = 0,
    'A cannot soft-delete a system entry');
end;
$f$;

create function tests.test_athlete_cannot_fake_staff_or_system_authorship() returns setof text language plpgsql as $f$
declare
  ua uuid; v_a uuid; v_la uuid; v_e uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); v_a := tests.gid('athlete_a'); v_la := tests.gid('list_a');

  perform tests.q_affected(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, source, entered_by)
                                         values (%L, %L, 'other_note', 'Trying to look like staff', 'staff', %L)$q$, v_a, v_la, tests.gid('staff_s')));
  select e.id into v_e from public.activity_entry e where e.summary = 'Trying to look like staff';
  return next is((select source::text from public.activity_entry where id = v_e), 'athlete', 'the source label is forced to athlete');
  return next is((select entered_by from public.activity_entry where id = v_e), ua, 'the author is forced to the real user');
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, source) values (%L, %L, 'system', 'fake', 'system')$q$, v_a, v_la)),
    'A cannot write a system entry');
  return next ok(tests.q_fails(ua, format($q$update public.activity_entry set source = 'staff' where id = %L$q$, v_e)), 'A cannot relabel an entry');
  perform tests.q_affected(ua, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date, created_source, created_by) values (%L, %L, 'x', current_date, 'staff', %L)$q$,
                                      v_a, tests.mk_list_entry(v_a, tests.mk_program(20)), tests.gid('staff_s')));
  return next is((select created_source::text from public.next_step where description = 'x' and athlete_id = v_a), 'athlete', 'a next step''s source is forced to athlete');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Staff see and edit only assigned athletes
-- ---------------------------------------------------------------------------------------------

create function tests.test_staff_scope_is_assigned_athletes_only() returns setof text language plpgsql as $f$
declare
  v_a uuid; v_b uuid; us uuid; ut uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t');

  return next is(tests.q_count(us, 'select count(*) from public.athlete'), 1::bigint, 'S sees exactly the one assigned athlete');
  return next is(tests.q_count(us, format('select count(*) from public.athlete where id = %L', v_b)), 0::bigint, 'S gets zero rows for B');
  return next is(tests.q_count(us, format('select count(*) from public.athlete_college where athlete_id = %L', v_b)), 0::bigint, 'S cannot read B''s list');
  return next is(tests.q_count(us, format('select count(*) from public.activity_entry where athlete_id = %L', v_a)), 2::bigint, 'S can read A''s log');
  return next is(tests.q_count(us, format('select count(*) from public.next_step where athlete_id = %L', v_a)), 1::bigint, 'S can read A''s next steps');
  return next is(tests.q_affected(us, format($q$update public.athlete set preferred_name = 'Coach edit' where id = %L$q$, v_a)), 1::bigint, 'S can edit A');
  return next is(tests.q_affected(us, format($q$update public.athlete set preferred_name = 'Coach edit' where id = %L$q$, v_b)), 0::bigint, 'S cannot edit B');
  return next is(tests.q_affected(us, format($q$insert into public.athlete_academic (athlete_id, hs_name) values (%L, 'West High')$q$, v_a)), 1::bigint, 'S can fill A''s academics');
  return next ok(tests.q_fails(us, format($q$insert into public.athlete_academic (athlete_id, hs_name) values (%L, 'West High')$q$, v_b)), 'S cannot fill B''s academics');
  return next ok(tests.q_fails(us, format($q$insert into public.next_step (athlete_id, athlete_college_id, description, due_date) values (%L, %L, 'x', current_date)$q$, v_b, tests.gid('list_b'))),
    'S cannot add a next step for B');

  return next is(tests.q_count(ut, 'select count(*) from public.athlete'), 0::bigint, 'T (assigned to nobody) sees no athletes');
  return next is(tests.q_count(ut, 'select count(*) from public.activity_entry'), 0::bigint, 'T sees no activity');
  return next is(tests.q_count(ut, 'select count(*) from public.my_list'), 0::bigint, 'T sees no lists');
  return next is(tests.q_affected(ut, format($q$update public.athlete set preferred_name = 'x' where id = %L$q$, v_a)), 0::bigint, 'T cannot edit A');
end;
$f$;

create function tests.test_staff_cannot_assign_themselves_or_escalate() returns setof text language plpgsql as $f$
declare
  v_b uuid; us uuid; ua uuid;
begin
  perform tests.world();
  v_b := tests.gid('athlete_b'); us := tests.gid('staff_s'); ua := tests.gid('user_a');

  return next ok(tests.q_fails(us, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, v_b, us)), 'S cannot assign themselves to B');
  return next ok(tests.q_fails(ua, format($q$insert into public.athlete_staff_assignment (athlete_id, staff_user_id) values (%L, %L)$q$, tests.gid('athlete_a'), us)), 'an athlete cannot create assignments either');
  return next ok(tests.q_fails(us, format($q$update public.app_user set role = 'admin' where user_id = %L$q$, us)), 'S cannot make themselves admin');
  return next ok(tests.q_fails(ua, format($q$update public.app_user set role = 'staff' where user_id = %L$q$, ua)), 'A cannot become staff');
  return next ok(tests.q_fails(ua, format($q$update public.app_user set status = 'active', role = 'admin' where user_id = %L$q$, ua)), 'A cannot become admin');
  return next ok(tests.q_fails(ua, format($q$insert into public.staff_profile (user_id, first_name, last_name) values (%L, 'A', 'Fake')$q$, ua)), 'A cannot create a staff profile');
  return next is(tests.q_affected(us, format($q$update public.app_user set display_name = 'Coach S' where user_id = %L$q$, us)), 1::bigint, 'S can change their own display name');
  return next is(tests.q_affected(us, format($q$update public.app_user set display_name = 'x' where user_id = %L$q$, ua)), 0::bigint, 'S cannot change someone else''s account');
  return next is((select role::text from public.app_user where user_id = ua), 'athlete', 'A is still an athlete');
end;
$f$;

create function tests.test_assignments_are_visible_to_the_right_people() returns setof text language plpgsql as $f$
begin
  perform tests.world();
  return next is(tests.q_count(tests.gid('staff_s'), 'select count(*) from public.athlete_staff_assignment'), 1::bigint, 'S sees their own assignment');
  return next is(tests.q_count(tests.gid('staff_t'), 'select count(*) from public.athlete_staff_assignment'), 0::bigint, 'T sees none');
  return next is(tests.q_count(tests.gid('user_b'), 'select count(*) from public.athlete_staff_assignment'), 0::bigint, 'B sees none (nobody is assigned to B)');
  return next is(tests.q_count(tests.gid('admin_x'), 'select count(*) from public.athlete_staff_assignment'), 1::bigint, 'admin sees all');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------------------------

create function tests.test_admin_sees_everything() returns setof text language plpgsql as $f$
declare
  ux uuid;
begin
  perform tests.world();
  ux := tests.gid('admin_x');
  return next is(tests.q_count(ux, 'select count(*) from public.athlete'), 2::bigint, 'admin sees every athlete');
  return next is(tests.q_count(ux, 'select count(*) from public.athlete_college'), 2::bigint, 'admin sees every list');
  return next is(tests.q_count(ux, 'select count(*) from public.app_user'), 6::bigint, 'admin sees every account');
  return next is(tests.q_count(ux, 'select count(*) from public.staff_roster'), 2::bigint, 'admin roster has both athletes');
  return next is(tests.q_affected(ux, format($q$update public.athlete set preferred_name = 'Admin edit' where id = %L$q$, tests.gid('athlete_b'))), 1::bigint, 'admin can edit any athlete');
  return next ok(tests.q_fails(ux, 'delete from public.athlete'), 'even admin cannot delete an athlete from the app');
  return next ok(tests.q_fails(ux, $q$update public.app_user set role = 'athlete'$q$), 'admin changes roles in the dashboard, not the app');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Disabled accounts and strangers
-- ---------------------------------------------------------------------------------------------

create function tests.test_disabled_account_sees_nothing() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s');
  update public.app_user set status = 'disabled' where user_id in (ua, us);

  return next is(tests.q_count(ua, 'select count(*) from public.athlete'), 0::bigint, 'a disabled athlete sees no athlete data');
  return next is(tests.q_count(ua, 'select count(*) from public.app_user'), 0::bigint, 'a disabled athlete cannot even read their account row');
  return next is(tests.q_count(ua, 'select count(*) from public.college'), 0::bigint, 'a disabled user sees no college data');
  return next is(tests.q_count(ua, 'select count(*) from public.state'), 0::bigint, 'a disabled user sees no lookup lists');
  return next ok(tests.q_fails(ua, format($q$insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary) values (%L, %L, 'other_note', 'x')$q$, tests.gid('athlete_a'), tests.gid('list_a'))),
    'a disabled athlete cannot write');
  return next is(tests.q_count(us, 'select count(*) from public.athlete'), 0::bigint, 'a disabled coordinator sees no athletes');
  return next is(tests.q_affected(us, format($q$update public.athlete set preferred_name = 'x' where id = %L$q$, tests.gid('athlete_a'))), 0::bigint, 'a disabled coordinator cannot edit');
  return next is(tests.q_count(us, 'select count(*) from public.college_coach'), 0::bigint, 'a disabled coordinator sees no coach contacts');
end;
$f$;

create function tests.test_a_stranger_sees_almost_nothing() returns setof text language plpgsql as $f$
declare
  uz uuid;
begin
  perform tests.world();
  uz := tests.gid('user_z');
  return next is(tests.q_count(uz, 'select count(*) from public.athlete'), 0::bigint, 'a new login sees no athletes');
  return next is(tests.q_count(uz, 'select count(*) from public.athlete_college'), 0::bigint, 'a new login sees no lists');
  return next is(tests.q_count(uz, 'select count(*) from public.activity_entry'), 0::bigint, 'a new login sees no activity');
  return next is(tests.q_count(uz, 'select count(*) from public.change_history'), 0::bigint, 'a new login sees no change history');
  return next is(tests.q_count(uz, 'select count(*) from public.app_user'), 1::bigint, 'a new login sees only their own account');
  return next is(tests.q_count(uz, 'select count(*) from public.college where unitid between 900000 and 999999'), 2::bigint, 'a new login can read the college database');
  return next is(tests.q_count(uz, 'select count(*) from public.college_coach where owner_athlete_id is not null'), 0::bigint, 'and none of the private coach contacts');
  return next is(tests.q_count(uz, 'select count(*) from public.state'), 52::bigint, 'and the lookup lists');
  return next is(tests.q_count(uz, 'select count(*) from public.staff_roster'), 0::bigint, 'the roster view is empty');
end;
$f$;

create function tests.test_creating_your_own_athlete_record() returns setof text language plpgsql as $f$
declare
  uz uuid; ua uuid; us uuid; v_team uuid;
begin
  perform tests.world();
  uz := tests.gid('user_z'); ua := tests.gid('user_a'); us := tests.gid('staff_s');
  select t.id into v_team from public.team t limit 1;

  return next ok(tests.q_fails(uz, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
                                           values (%L, %L, 'Imp', 'Ostor', (current_date - interval '16 years')::date, 2028, 'IA')$q$, ua, v_team)),
    'a login cannot create an athlete record for someone else');
  return next is(tests.q_affected(uz, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
                                               values (%L, %L, 'Zed', 'Athlete', (current_date - interval '16 years')::date, 2028, 'IA')$q$, uz, v_team)),
    1::bigint, 'a login can create their own athlete record');
  return next ok(tests.q_fails(uz, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
                                            values (%L, %L, 'Zed', 'Again', (current_date - interval '16 years')::date, 2028, 'IA')$q$, uz, v_team)),
    'but only one');
  return next ok(tests.q_fails(us, format($q$insert into public.athlete (user_id, team_id, first_name, last_name, date_of_birth, graduation_year, home_state)
                                            values (%L, %L, 'Coach', 'Kid', (current_date - interval '16 years')::date, 2028, 'IA')$q$, us, v_team)),
    'a coordinator login cannot create an athlete record');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Coach contacts: shared vs private
-- ---------------------------------------------------------------------------------------------

create function tests.test_private_coach_contacts() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; us uuid; ut uuid; v_a uuid; v_b uuid; v_p1 bigint;
begin
  perform tests.world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t');
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); v_p1 := tests.bid('program_1');

  return next is(tests.q_count(ua, format('select count(*) from public.college_coach where program_id = %s', v_p1)), 2::bigint, 'A sees the shared coach and their own private one');
  return next is(tests.q_count(ub, format('select count(*) from public.college_coach where program_id = %s', v_p1)), 1::bigint, 'B sees only the shared coach');
  return next is(tests.q_count(us, format('select count(*) from public.college_coach where program_id = %s', v_p1)), 2::bigint, 'S (assigned to A) sees A''s private contact');
  return next is(tests.q_count(ut, format('select count(*) from public.college_coach where program_id = %s', v_p1)), 1::bigint, 'T (not assigned) does not');
  return next is(tests.q_affected(ua, format($q$insert into public.college_coach (program_id, full_name, owner_athlete_id) values (%s, 'New private', %L)$q$, v_p1, v_a)), 1::bigint, 'A can add a private contact');
  return next ok(tests.q_fails(ua, format($q$insert into public.college_coach (program_id, full_name, owner_athlete_id) values (%s, 'Planted', %L)$q$, v_p1, v_b)), 'A cannot add a private contact to B');
  return next ok(tests.q_fails(ua, format($q$insert into public.college_coach (program_id, full_name) values (%s, 'Fake master coach')$q$, v_p1)), 'A cannot add a shared (master) coach');
  return next is(tests.q_affected(ua, format($q$update public.college_coach set full_name = 'Changed' where id = %s$q$, tests.bid('coach_master'))), 0::bigint, 'A cannot edit the shared coach');
  return next ok(tests.q_fails(ua, format($q$update public.college_coach set owner_athlete_id = null where id = %s$q$, tests.bid('coach_private_a'))), 'A cannot promote their private contact to the shared list');
  return next is(tests.q_affected(ua, format($q$delete from public.college_coach where id = %s$q$, tests.bid('coach_master'))), 0::bigint, 'A cannot delete the shared coach');
  return next is(tests.q_affected(ua, format($q$delete from public.college_coach where id = %s$q$, tests.bid('coach_private_a'))), 1::bigint, 'A can delete their own private contact');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Shared college data: staff may edit (D4), athletes may not; edits are audited and stamped
-- ---------------------------------------------------------------------------------------------

create function tests.test_staff_edit_shared_college_data_and_athletes_cannot() returns setof text language plpgsql as $f$
declare
  ua uuid; us uuid; v_p1 bigint; v_c bigint;
begin
  perform tests.world();
  ua := tests.gid('user_a'); us := tests.gid('staff_s'); v_p1 := tests.bid('program_1'); v_c := tests.bid('coach_master');
  update public.college_program set last_verified_on = date '2020-01-01', verified_by = null where id = v_p1;

  return next is(tests.q_affected(ua, format($q$update public.college_program set program_url = 'https://example.com/a' where id = %s$q$, v_p1)), 0::bigint, 'an athlete cannot edit a program');
  return next is(tests.q_affected(ua, format($q$update public.college set website_url = 'https://example.com/a' where unitid = 900001$q$)), 0::bigint, 'an athlete cannot edit a college');
  return next ok(tests.q_fails(ua, $q$insert into public.college (unitid, name) values (900099, 'Planted College')$q$), 'an athlete cannot add a college');

  return next is(tests.q_affected(us, format($q$update public.college_program set program_url = 'https://example.com/staff' where id = %s$q$, v_p1)), 1::bigint, 'staff can edit a program');
  return next is(tests.q_affected(us, $q$update public.college set website_url = 'https://example.com/staff' where unitid = 900001$q$), 1::bigint, 'staff can edit a college');
  return next is(tests.q_affected(us, format($q$update public.college_coach set email = 'coach@example.edu' where id = %s$q$, v_c)), 1::bigint, 'staff can edit a shared coach');
  return next is(tests.q_affected(us, format($q$insert into public.college_coach (program_id, full_name) values (%s, 'Added by staff')$q$, v_p1)), 1::bigint, 'staff can add a shared coach');
  return next ok(tests.q_fails(us, format($q$delete from public.college_program where id = %s$q$, v_p1)), 'staff cannot delete a program');

  return next is((select verified_by from public.college_program where id = v_p1), us, 'the staff member is stamped as verifier');
  return next ok((select last_verified_on >= current_date - 1 from public.college_program where id = v_p1), 'and the verified date is today');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'college_program' and h.record_id = v_p1::text
                           and h.changed_by = us and h.athlete_id is null and h.changed_by_role = 'staff'),
    'the edit is in change history with the staff member as author');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Change history visibility
-- ---------------------------------------------------------------------------------------------

create function tests.test_change_history_visibility() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; us uuid; ut uuid; ux uuid; v_a uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t'); ux := tests.gid('admin_x');
  v_a := tests.gid('athlete_a');

  perform tests.q_affected(ua, format($q$update public.athlete set preferred_name = 'By athlete' where id = %L$q$, v_a));
  perform tests.q_affected(us, format($q$update public.athlete set jersey_number = '7' where id = %L$q$, v_a));
  perform tests.q_affected(us, $q$update public.college set website_url = 'https://example.com/s' where unitid = 900001$q$);

  return next is(tests.q_count(ua, format($q$select count(*) from public.change_history where athlete_id = %L and new_values ->> 'preferred_name' = 'By athlete'$q$, v_a)),
    0::bigint, 'A does not see the history of their own edits');
  return next is(tests.q_count(ua, format($q$select count(*) from public.change_history where athlete_id = %L and new_values ->> 'jersey_number' = '7'$q$, v_a)),
    1::bigint, 'A sees what the coordinator changed');
  return next is(tests.q_count(ua, 'select count(*) from public.change_history where athlete_id is null'), 0::bigint, 'A does not see edits to the shared college data');
  return next is(tests.q_count(ub, 'select count(*) from public.change_history where athlete_id is not null'), 0::bigint, 'B sees no history about A');
  return next ok(tests.q_count(us, format($q$select count(*) from public.change_history where athlete_id = %L$q$, v_a)) >= 3, 'S sees all history for A');
  return next is(tests.q_count(us, format($q$select count(*) from public.change_history where athlete_id = %L$q$, tests.gid('athlete_b'))), 0::bigint, 'S sees none for B');
  return next ok(tests.q_count(us, $q$select count(*) from public.change_history where athlete_id is null and table_name = 'college'$q$) >= 1, 'S sees shared-college edits');
  return next is(tests.q_count(us, $q$select count(*) from public.change_history where table_name = 'app_user'$q$), 0::bigint, 'S does not see account changes');
  return next is(tests.q_count(ut, 'select count(*) from public.change_history where athlete_id is not null'), 0::bigint, 'T sees no athlete history');
  return next ok(tests.q_count(ux, 'select count(*) from public.change_history') > 10, 'admin sees everything');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Views do not leak
-- ---------------------------------------------------------------------------------------------

create function tests.test_views_respect_row_level_security() returns setof text language plpgsql as $f$
declare
  ua uuid; ub uuid; us uuid; ut uuid;
begin
  perform tests.world();
  ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t');

  return next is(tests.q_count(ua, format($q$select count(*) from public.my_list where athlete_id <> %L$q$, tests.gid('athlete_a'))), 0::bigint, 'my_list shows A only A''s rows');
  return next is(tests.q_count(ub, 'select count(*) from public.my_list'), 1::bigint, 'my_list shows B only B''s row');
  return next is(tests.q_count(ua, format($q$select count(*) from public.next_steps_due where athlete_id = %L$q$, tests.gid('athlete_b'))), 0::bigint, 'next_steps_due hides B from A');
  return next is(tests.q_count(ub, 'select count(*) from public.next_steps_due'), 1::bigint, 'next_steps_due shows B their own step');
  return next is(tests.q_count(us, 'select count(*) from public.staff_roster'), 1::bigint, 'the roster shows S one athlete');
  return next is(tests.q_count(us, format($q$select count(*) from public.staff_roster where athlete_id = %L$q$, tests.gid('athlete_b'))), 0::bigint, 'the roster hides B from S');
  return next is(tests.q_count(ut, 'select count(*) from public.staff_roster'), 0::bigint, 'the roster is empty for T');
  return next is(tests.q_count(ub, format($q$select count(*) from public.athlete_completeness where athlete_id = %L$q$, tests.gid('athlete_a'))), 0::bigint, 'completeness hides A from B');
  return next is(tests.q_count(ua, format('select count(*) from public.program_competitiveness where program_id in (%s, %s)', tests.bid('program_1'), tests.bid('program_2'))), 2::bigint, 'the college band view is shared reference data');
end;
$f$;

select * from runtests('tests'::name);

rollback;
