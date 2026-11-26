-- The administrator's dashboard functions (schema `admin`): what each one does, what each one refuses, and that nobody
-- signed in (or the web app, or the anonymous key) can reach any of them. They run here as the owner, like the SQL editor.
-- The world: athletes A and B, coordinator S (main for A), coordinator T (nobody), administrator X, and Z (a sign-up with no
-- athlete record, so promotable). The real project may also hold real administrators: where a test needs X to be the only
-- active one, it switches the others off (everything is rolled back).
begin;

create schema if not exists tests;

-- The error text a statement raises, or null when it succeeds.
create function tests.admin_error_of(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$f$;

-- True when the statement fails with a message matching the pattern (and so changed nothing).
create function tests.admin_refuses(p_sql text, p_like text) returns boolean language plpgsql as $f$
begin
  return coalesce(tests.admin_error_of(p_sql) like p_like, false);
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Closed to everyone but the owner
-- ---------------------------------------------------------------------------------------------
create function tests.test_admin_functions_are_unreachable_from_the_app() returns setof text language plpgsql as $f$
declare
  ux uuid;
begin
  perform tests.world();
  ux := tests.gid('admin_x');

  -- even a signed-in administrator, acting through the app, cannot reach them
  return next ok(tests.q_fails(ux, 'select * from admin.who_is_who'), 'an administrator signed in to the app cannot read the admin view');
  return next ok(tests.q_fails(ux, $q$select * from admin.create_team(team_name => 'Nope')$q$), 'or run an admin function');
  return next ok(tests.q_fails(ux, $q$select admin.user_id_of('a@example.com')$q$), 'or the lookup helper');
  return next ok(tests.q_fails(ux, $q$select * from admin.delete_athlete('a@example.com', 'a@example.com', true)$q$), 'or delete an athlete');
  return next ok(tests.q_fails(tests.gid('user_a'), 'select * from admin.who_is_who'), 'an athlete cannot read the admin view');
  return next ok(tests.q_fails(null, 'select * from admin.who_is_who', 'anon'), 'a signed-out request cannot read the admin view');
  return next ok(tests.q_fails(null, $q$select * from admin.create_team(team_name => 'Nope')$q$, 'anon'), 'or run an admin function');
  return next is((select count(*) from public.team where name = 'Nope'), 0::bigint, 'and nothing was created');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- create_team
-- ---------------------------------------------------------------------------------------------
create function tests.test_create_team() returns setof text language plpgsql as $f$
declare
  r record;
  v_season text := (select c.season_label from public.club c order by c.created_at limit 1);
begin
  perform tests.world();

  select * into r from admin.create_team(team_name => '  Test 17R  ', grad_year => 2028, team_level => '17R', head_coach => ' Coach Q ');
  return next is(r.team, 'Test 17R', 'the name is tidied');
  return next is(r.grad_year_group, 2028, 'the graduation year is kept');
  return next is(r.season_label, v_season, 'the season defaults to the club''s season');
  return next ok(r.active, 'the team is active');
  return next is(r.athletes, 0::bigint, 'with no athletes yet');
  return next is((select t.level || '/' || t.head_coach_name from public.team t where t.name = 'Test 17R'), '17R/Coach Q', 'level and head coach are saved, tidied');

  select * into r from admin.create_team(team_name => 'Test 17R', season => '2099-00');
  return next is(r.season_label, '2099-00', 'the same name in another season is allowed');
  select * into r from admin.create_team(team_name => 'Test 18R');
  return next ok(r.grad_year_group is null, 'the graduation year is optional');

  return next ok(tests.admin_refuses($q$select * from admin.create_team(team_name => 'Test 17R')$q$, '%already exists%'), 'the same name in the same season is refused');
  return next ok(tests.admin_refuses($q$select * from admin.create_team(team_name => '   ')$q$, '%Enter the team name%'), 'a blank name is refused');
  return next ok(tests.admin_refuses($q$select * from admin.create_team(team_name => null)$q$, '%Enter the team name%'), 'so is a missing one');
  return next ok(tests.admin_refuses($q$select * from admin.create_team(team_name => 'Test 19R', grad_year => 28)$q$, '%does not look right%'), 'a two-digit year is refused');
  return next is((select count(*) from public.team where name = 'Test 19R'), 0::bigint, 'and the refused team was not created');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- promote_to_staff
-- ---------------------------------------------------------------------------------------------
create function tests.test_promote_to_staff() returns setof text language plpgsql as $f$
declare
  r record;
  uz uuid; us uuid;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
begin
  perform tests.world();
  uz := tests.gid('user_z'); us := tests.gid('staff_s');
  perform admin.create_team(team_name => 'Test 17R');

  select * into r from admin.promote_to_staff(account_email => '  Z@Example.COM ', given_name => ' Zed ', family_name => 'Zee', team_name => v_pilot);
  return next is(r.role::text, 'staff', 'a sign-up becomes staff (email case and spaces do not matter)');
  return next is(r.staff_name, 'Zed Zee', 'with a tidied name');
  return next is(r.title, 'Recruiting Coordinator', 'and the default job title');
  return next is(r.team, v_pilot, 'on the team they were given');
  return next is((select role::text from public.app_user where user_id = uz), 'staff', 'the account really has the staff role');
  return next is((select email from public.staff_profile where user_id = uz), 'z@example.com', 'the staff email is stored in lower case');

  -- again: the team is replaced, not added to; the names and title update
  select * into r from admin.promote_to_staff(account_email => 'z@example.com', given_name => 'Zed', family_name => 'Zeta', team_name => 'Test 17R', job_title => 'Team Coach');
  return next is(r.team, 'Test 17R', 'promoting again moves them to the new team');
  return next is((select count(*) from public.staff_team where staff_user_id = uz), 1::bigint, 'they are linked to exactly one team');
  return next is(r.staff_name || ' / ' || r.title, 'Zed Zeta / Team Coach', 'and the name and title are updated');
  return next is((select count(*) from public.staff_profile where user_id = uz), 1::bigint, 'with one staff profile');

  -- an administrator, and an existing coordinator keeps their athletes
  select * into r from admin.promote_to_staff(account_email => 'z@example.com', given_name => 'Zed', family_name => 'Zeta', team_name => 'Test 17R', account_role => 'admin');
  return next is(r.role::text, 'admin', 'promoting with the admin role makes an administrator');
  select * into r from admin.promote_to_staff(account_email => 's@example.com', given_name => 'Sam', family_name => 'Stone', team_name => v_pilot);
  return next is(r.staff_name, 'Sam Stone', 'an existing coordinator can be updated');
  return next is((select count(*) from public.athlete_staff_assignment where staff_user_id = us), 1::bigint, 'and keeps their assigned athletes');

  -- refusals
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('a@example.com', 'A', 'A', %L)$q$, v_pilot), '%has an athlete profile%'),
    'someone with an athlete profile cannot be promoted');
  return next is((select role::text from public.app_user where user_id = tests.gid('user_a')), 'athlete', 'and stays an athlete');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('nobody@example.com', 'A', 'A', %L)$q$, v_pilot), '%No account with the email%'), 'an unknown email is refused');
  return next ok(tests.admin_refuses($q$select * from admin.promote_to_staff('z@example.com', 'A', 'A', 'No Such Team')$q$, '%No team named%Teams:%'), 'an unknown team is refused, and the real ones are listed');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('z@example.com', '', 'A', %L)$q$, v_pilot), '%first and last name%'), 'a blank name is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('z@example.com', 'A', 'A', %L, 'Janitor')$q$, v_pilot), '%job title%'), 'an unknown job title is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('z@example.com', 'A', 'A', %L, account_role => 'athlete')$q$, v_pilot), '%staff or admin%'), 'only staff or admin can be given');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff(null, 'A', 'A', %L)$q$, v_pilot), '%No account%'), 'a missing email is refused');

  -- a switched-off account must be switched on first
  perform admin.set_account_status('t@example.com', 'disabled');
  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('t@example.com', 'T', 'T', %L)$q$, v_pilot), '%switched off%'), 'a switched-off account is not promoted behind its back');
  return next is((select status::text from public.app_user where user_id = tests.gid('staff_t')), 'disabled', 'and stays switched off');
end;
$f$;

create function tests.test_the_only_administrator_is_protected() returns setof text language plpgsql as $f$
declare
  r record;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
begin
  perform tests.world();
  update public.app_user set status = 'disabled' where role = 'admin' and user_id <> tests.gid('admin_x');   -- real administrators, if any (rolled back)

  return next ok(tests.admin_refuses(format($q$select * from admin.promote_to_staff('x@example.com', 'X', 'X', %L)$q$, v_pilot), '%only active administrator%'),
    'the only administrator cannot be turned into a coordinator');
  return next ok(tests.admin_refuses($q$select * from admin.set_account_status('x@example.com', 'disabled')$q$, '%only active administrator%'), 'or switched off');
  return next is((select role::text || '/' || status::text from public.app_user where user_id = tests.gid('admin_x')), 'admin/active', 'and is unchanged');

  -- with a second administrator, either may be changed
  perform admin.promote_to_staff('z@example.com', 'Zed', 'Zee', v_pilot, account_role => 'admin');
  select * into r from admin.set_account_status('x@example.com', 'disabled');
  return next is(r.status::text, 'disabled', 'with another active administrator, the first can be switched off');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- assign_athletes / unassign_athlete
-- ---------------------------------------------------------------------------------------------
create function tests.test_assign_athletes() returns setof text language plpgsql as $f$
declare
  v_a uuid; v_b uuid; us uuid; ut uuid;
  v_role text;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); us := tests.gid('staff_s'); ut := tests.gid('staff_t');

  -- a new main coordinator moves the old one to extra
  return next is((select count(*) from admin.assign_athletes(coordinator_email => 't@example.com', athlete_emails => array['a@example.com'])), 1::bigint, 'one athlete assigned');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut), 'primary', 'T is now A''s main coordinator');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = us), 'secondary', 'and S moved to extra');

  -- again: nothing breaks, nothing changes
  perform admin.assign_athletes('t@example.com', array['a@example.com']);
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a), 2::bigint, 'assigning the same person again adds nothing');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut), 'primary', 'and T is still main');

  -- change the role of an existing assignment
  perform admin.assign_athletes('s@example.com', array['a@example.com']);
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = us), 'primary', 'an extra coordinator can be made main');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut), 'secondary', 'and the previous main one moves to extra');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a and role_on_athlete = 'primary'), 1::bigint, 'there is only ever one main coordinator');

  -- several athletes, a role, emails with other case and spaces; the access follows
  perform admin.assign_athletes('t@example.com', array['  B@Example.com ', 'a@example.com'], 'secondary');
  return next is((select role_on_athlete::text from public.athlete_staff_assignment where athlete_id = v_b and staff_user_id = ut), 'secondary', 'an extra coordinator is assigned to B');
  return next is(tests.q_count(ut, format('select count(*) from public.athlete where id = %L', v_b)), 1::bigint, 'and can now open B');
  return next ok((select assigned_by from public.athlete_staff_assignment where athlete_id = v_b and staff_user_id = ut) is null, 'a dashboard assignment has no app author');
  return next is((select count(*) from public.change_history where table_name = 'athlete_staff_assignment' and athlete_id = v_b and change_type = 'created'
                     and changed_by is null and changed_by_role = 'system'), 1::bigint, 'the change history records it as a dashboard change');

  -- all or nothing
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('s@example.com', array['b@example.com', 'ghost@example.com'])$q$, '%No athlete profile%ghost%'),
    'one wrong email refuses the whole call');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_b and staff_user_id = us), 0::bigint, 'and nobody was assigned to the good one either');

  -- refusals
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('a@example.com', array['b@example.com'])$q$, '%No active staff account%'), 'an athlete cannot be the coordinator');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('nobody@example.com', array['b@example.com'])$q$, '%No active staff account%'), 'an unknown coordinator is refused');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('z@example.com', array['b@example.com'])$q$, '%Promote them first%'), 'someone not yet promoted is refused');
  perform admin.set_account_status('t@example.com', 'disabled');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('t@example.com', array['b@example.com'])$q$, '%No active staff account%'), 'a switched-off coordinator is refused');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('s@example.com', array[]::text[])$q$, '%at least one athlete%'), 'an empty list is refused');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('s@example.com', null)$q$, '%at least one athlete%'), 'so is a missing one');
  return next ok(tests.admin_refuses($q$select * from admin.assign_athletes('s@example.com', array['b@example.com'], null)$q$, '%primary or secondary%'), 'and a missing role');
end;
$f$;

create function tests.test_unassign_athlete() returns setof text language plpgsql as $f$
declare
  v_a uuid; us uuid; ut uuid;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); us := tests.gid('staff_s'); ut := tests.gid('staff_t');

  return next is(tests.q_count(us, format('select count(*) from public.athlete where id = %L', v_a)), 1::bigint, 'S can open A today');
  perform admin.unassign_athlete('a@example.com', 's@example.com');
  return next is(tests.q_count(us, format('select count(*) from public.athlete where id = %L', v_a)), 0::bigint, 'after unassigning, S cannot');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a), 0::bigint, 'and the assignment is gone');
  return next is((select count(*) from public.change_history where table_name = 'athlete_staff_assignment' and athlete_id = v_a and change_type = 'deleted'), 1::bigint,
    'the removal is in the change history');

  return next ok(tests.admin_refuses($q$select * from admin.unassign_athlete('a@example.com', 's@example.com')$q$, '%is not assigned%Nothing changed%'), 'removing it twice is refused');
  return next ok(tests.admin_refuses($q$select * from admin.unassign_athlete('ghost@example.com', 's@example.com')$q$, '%No athlete profile%'), 'an unknown athlete is refused');
  return next ok(tests.admin_refuses($q$select * from admin.unassign_athlete('a@example.com', 'ghost@example.com')$q$, '%No account%'), 'an unknown coordinator is refused');

  -- a coordinator who has since been switched off can still be taken off an athlete
  perform admin.assign_athletes('t@example.com', array['a@example.com']);
  perform admin.set_account_status('t@example.com', 'disabled');
  perform admin.unassign_athlete('a@example.com', 't@example.com');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a and staff_user_id = ut), 0::bigint, 'a switched-off coordinator can be removed from an athlete');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- set_account_status
-- ---------------------------------------------------------------------------------------------
create function tests.test_set_account_status() returns setof text language plpgsql as $f$
declare
  r record;
  ub uuid;
begin
  perform tests.world();
  ub := tests.gid('user_b');

  return next is(tests.q_count(ub, 'select count(*) from public.athlete'), 1::bigint, 'B sees their own record');
  select * into r from admin.set_account_status(account_email => ' B@example.com ', new_status => 'disabled');
  return next is(r.status::text, 'disabled', 'the account is switched off');
  return next ok(r.sign_in_blocked, 'and sign-in is blocked');
  return next ok((select banned_until from auth.users where id = ub) = 'infinity'::timestamptz, 'at the sign-in service too');
  return next is(tests.q_count(ub, 'select count(*) from public.athlete'), 0::bigint, 'a switched-off person sees nothing');
  return next is((select count(*) from public.athlete where user_id = ub), 1::bigint, 'but nothing is deleted');

  select * into r from admin.set_account_status('b@example.com', 'active');
  return next is(r.status::text, 'active', 'it can be switched back on');
  return next ok(not r.sign_in_blocked, 'sign-in works again');
  return next ok((select banned_until from auth.users where id = ub) is null, 'the ban is lifted');
  return next is(tests.q_count(ub, 'select count(*) from public.athlete'), 1::bigint, 'and B sees their record again');

  select * into r from admin.set_account_status('b@example.com', 'active');
  return next is(r.status::text, 'active', 'switching on an account that is on is harmless');

  return next ok(tests.admin_refuses($q$select * from admin.set_account_status('ghost@example.com', 'disabled')$q$, '%No account%'), 'an unknown account is refused');
  return next ok(tests.admin_refuses($q$select * from admin.set_account_status('b@example.com', null)$q$, '%disabled or active%'), 'a missing status is refused');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- delete_athlete
-- ---------------------------------------------------------------------------------------------
create function tests.test_delete_athlete() returns setof text language plpgsql as $f$
declare
  r record;
  v_a uuid; v_b uuid; ub uuid;
  v_hist_a bigint;
  v_hist_b bigint;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); ub := tests.gid('user_b');
  perform admin.assign_athletes('t@example.com', array['b@example.com']);
  v_hist_a := (select count(*) from public.change_history where athlete_id = v_a);
  v_hist_b := (select count(*) from public.change_history where athlete_id = v_b);

  -- the preview is the default and deletes nothing
  select * into r from admin.delete_athlete(player_email => ' B@example.com ');
  return next ok(not r.deleted, 'the default is a preview');
  return next is(r.email, 'b@example.com', 'it names the person');
  return next is(r.colleges, (select count(*) from public.athlete_college where athlete_id = v_b), 'it counts the college list');
  return next is(r.log_entries, (select count(*) from public.activity_entry where athlete_id = v_b), 'the log');
  return next is(r.next_steps, (select count(*) from public.next_step where athlete_id = v_b), 'the next steps');
  return next is(r.history_rows, v_hist_b, 'and the change history');
  return next ok(r.message like 'PREVIEW ONLY%confirm => true%b@example.com%', 'and says how to go ahead');
  return next is((select count(*) from public.athlete where id = v_b), 1::bigint, 'nothing was deleted');
  return next is((select count(*) from admin.delete_athlete(player_email => 'b@example.com', confirm => false)), 1::bigint, 'confirm => false is also a preview');
  return next is((select count(*) from public.athlete where id = v_b), 1::bigint, 'still there');

  -- confirm must come with the email repeated
  return next ok(tests.admin_refuses($q$select * from admin.delete_athlete('b@example.com', null, true)$q$, '%confirm_email must repeat%'), 'confirming without repeating the email is refused');
  return next ok(tests.admin_refuses($q$select * from admin.delete_athlete('b@example.com', 'a@example.com', true)$q$, '%confirm_email must repeat%'), 'repeating a different email is refused');
  return next ok(tests.admin_refuses($q$select * from admin.delete_athlete('ghost@example.com')$q$, '%No athlete profile%Nothing deleted%'), 'an unknown email is refused');
  return next ok(tests.admin_refuses($q$select * from admin.delete_athlete('s@example.com')$q$, '%No athlete profile%'), 'a coordinator is not an athlete, so there is nothing to delete');
  return next is((select count(*) from public.athlete where id = v_b), 1::bigint, 'the refusals deleted nothing');

  -- the real thing
  select * into r from admin.delete_athlete(player_email => 'b@example.com', confirm_email => ' B@Example.com ', confirm => true);
  return next ok(r.deleted, 'confirmed: deleted');
  return next is((select count(*) from auth.users where id = ub), 0::bigint, 'the sign-in is gone');
  return next is((select count(*) from public.app_user where user_id = ub), 0::bigint, 'the account is gone');
  return next is((select count(*) from public.athlete where id = v_b), 0::bigint, 'the athlete is gone');
  return next is((select count(*) from public.athlete_college where athlete_id = v_b), 0::bigint, 'their college list is gone');
  return next is((select count(*) from public.activity_entry where athlete_id = v_b), 0::bigint, 'their log is gone');
  return next is((select count(*) from public.next_step where athlete_id = v_b), 0::bigint, 'their next steps are gone');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_b), 0::bigint, 'their coordinator assignments are gone');
  return next is((select count(*) from public.change_history where athlete_id = v_b or (table_name = 'athlete' and record_id = v_b::text)
                     or (table_name = 'app_user' and record_id = ub::text)), 0::bigint, 'and so is the change history about them, including the deletion itself');

  -- nobody else is touched, and auditing is back on
  return next is((select count(*) from public.athlete where id = v_a), 1::bigint, 'the other athlete is untouched');
  return next is((select count(*) from public.change_history where athlete_id = v_a), v_hist_a, 'and so is their history');
  return next is(coalesce(nullif(current_setting('app.skip_audit', true), ''), 'off'), 'off', 'the switch that pauses the history is back off');
  return next ok(tests.admin_refuses($q$select * from admin.delete_athlete('b@example.com', 'b@example.com', true)$q$, '%No athlete profile%'), 'deleting again is refused');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- convert_athlete_to_staff: keep the login, delete everything that belongs to the student role
-- ---------------------------------------------------------------------------------------------
create function tests.test_convert_athlete_to_staff_previews_and_refuses() returns setof text language plpgsql as $f$
declare
  r record;
  v_a uuid; ua uuid;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); ua := tests.gid('user_a');

  -- the preview is the default and changes nothing
  select * into r from admin.convert_athlete_to_staff(account_email => ' A@example.com ', given_name => 'Alex', family_name => 'Able', team_name => v_pilot);
  return next ok(not r.converted, 'the default is a preview');
  return next is(r.email, 'a@example.com', 'it names the account');
  return next is(r.colleges, (select count(*) from public.athlete_college where athlete_id = v_a), 'it counts the college list');
  return next is(r.history_rows, (select count(*) from public.change_history where athlete_id = v_a), 'and the history that would go');
  return next ok(r.message like 'PREVIEW ONLY%PERMANENTLY DELETES%confirm => true%a@example.com%', 'and says what will happen and how to go ahead');
  return next is((select count(*) from public.athlete where id = v_a), 1::bigint, 'nothing was deleted');
  return next is((select role::text from public.app_user where user_id = ua), 'athlete', 'and the role is unchanged');
  return next is((select count(*) from public.staff_profile where user_id = ua), 0::bigint, 'with no staff profile made');
  return next is((select count(*) from admin.convert_athlete_to_staff(account_email => 'a@example.com', given_name => 'Alex', family_name => 'Able',
                                                                      team_name => v_pilot, confirm => false)), 1::bigint, 'confirm => false is also a preview');

  -- refusals
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'Alex', 'Able', %L, confirm => true)$q$, v_pilot),
    '%confirm_email must repeat%'), 'confirming without repeating the email is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'Alex', 'Able', %L, confirm_email => 'b@example.com', confirm => true)$q$, v_pilot),
    '%confirm_email must repeat%'), 'repeating a different email is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('ghost@example.com', 'A', 'A', %L)$q$, v_pilot), '%No account with the email%'), 'an unknown email is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('z@example.com', 'A', 'A', %L)$q$, v_pilot), '%no athlete profile%admin.promote_to_staff%'),
    'someone with no athlete profile is sent to promote_to_staff');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('s@example.com', 'A', 'A', %L)$q$, v_pilot), '%no athlete profile%'), 'and so is a coordinator');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', '', 'A', %L)$q$, v_pilot), '%first and last name%'), 'a blank name is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'A', 'A', %L, 'Janitor')$q$, v_pilot), '%job title%'), 'an unknown job title is refused');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'A', 'A', %L, account_role => 'athlete')$q$, v_pilot), '%staff or admin%'), 'only staff or admin can be given');
  return next ok(tests.admin_refuses($q$select * from admin.convert_athlete_to_staff('a@example.com', 'A', 'A', 'No Such Team')$q$, '%No team named%Teams:%'), 'an unknown team is refused');
  perform admin.set_account_status('a@example.com', 'disabled');
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'A', 'A', %L)$q$, v_pilot), '%switched off%'), 'a switched-off account is refused');
  return next is((select count(*) from public.athlete where id = v_a), 1::bigint, 'none of the refusals deleted anything');
  return next is((select role::text from public.app_user where user_id = ua), 'athlete', 'or changed the role');
end;
$f$;

create function tests.test_convert_athlete_to_staff_keeps_the_login_and_deletes_the_student_data() returns setof text language plpgsql as $f$
declare
  r record;
  v_a uuid; v_b uuid; ua uuid; ub uuid; us uuid;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
  v_note_a uuid; v_note_b uuid;
  v_hist_b bigint;
  v_auth_before timestamptz;
begin
  perform tests.world();
  v_a := tests.gid('athlete_a'); v_b := tests.gid('athlete_b'); ua := tests.gid('user_a'); ub := tests.gid('user_b'); us := tests.gid('staff_s');

  -- everything the student role can own: a note, a dismissal of it, a dismissal of a note on someone else's account, and history of what they did
  insert into public.athlete_note (athlete_id, sender, sender_user_id, body) values (v_a, 'athlete', ua, 'A question') returning id into v_note_a;
  insert into public.athlete_note (athlete_id, sender, sender_user_id, body) values (v_b, 'staff', us, 'A note for B') returning id into v_note_b;
  insert into public.athlete_note_dismissal (note_id, user_id) values (v_note_a, ua), (v_note_b, ua);
  insert into public.change_history (athlete_id, table_name, record_id, change_type, changed_by, changed_by_role)
  values (null, 'college_coach', 'x', 'updated', ua, 'athlete');
  v_hist_b := (select count(*) from public.change_history where athlete_id = v_b);
  v_auth_before := (select created_at from auth.users where id = ua);

  return next ok((select count(*) from public.athlete_college where athlete_id = v_a) > 0
                 and (select count(*) from public.activity_entry where athlete_id = v_a) > 0
                 and (select count(*) from public.next_step where athlete_id = v_a) > 0
                 and (select count(*) from public.athlete_guardian where athlete_id = v_a) > 0
                 and (select count(*) from public.college_coach where owner_athlete_id = v_a) > 0
                 and (select count(*) from public.athlete_staff_assignment where athlete_id = v_a) > 0, 'before: the athlete has data in every area');

  select * into r from admin.convert_athlete_to_staff(account_email => ' A@example.com ', given_name => ' Alex ', family_name => 'Able', team_name => v_pilot,
                                                       job_title => 'Team Coach', confirm_email => 'A@Example.com', confirm => true);
  return next ok(r.converted, 'confirmed: converted');
  return next ok(r.message like 'Converted.%sign out and in%', 'and it says they must sign in again');

  -- the login stays, as the same account
  return next is((select count(*) from auth.users where id = ua and email = 'a@example.com'), 1::bigint, 'the login is still there, with the same email');
  return next is((select created_at from auth.users where id = ua), v_auth_before, 'and it is the same account, not a new one');
  return next is((select role::text || '/' || status::text from public.app_user where user_id = ua), 'staff/active', 'the account is now staff, and active');
  return next is((select first_name || ' ' || last_name || ' / ' || title || ' / ' || email from public.staff_profile where user_id = ua), 'Alex Able / Team Coach / a@example.com',
    'with a staff profile (name tidied)');
  return next is((select t.name from public.staff_team st join public.team t on t.id = st.team_id where st.staff_user_id = ua), v_pilot, 'on the team they were given');
  return next is((select count(*) from public.staff_team where staff_user_id = ua), 1::bigint, 'and only that one');

  -- everything that belonged to the student role is gone
  return next is((select count(*) from public.athlete where id = v_a or user_id = ua), 0::bigint, 'the athlete profile is gone');
  return next is((select count(*) from public.athlete_college where athlete_id = v_a), 0::bigint, 'the college list is gone');
  return next is((select count(*) from public.activity_entry where athlete_id = v_a), 0::bigint, 'the activity log is gone');
  return next is((select count(*) from public.next_step where athlete_id = v_a), 0::bigint, 'the next steps are gone');
  return next is((select count(*) from public.athlete_note where athlete_id = v_a), 0::bigint, 'the notes are gone');
  return next is((select count(*) from public.athlete_note_dismissal where note_id = v_note_a), 0::bigint, 'and the dismissals of them');
  return next is((select count(*) from public.athlete_note_dismissal where user_id = ua), 0::bigint, 'and their dismissals of other notes');
  return next is((select count(*) from public.athlete_guardian where athlete_id = v_a), 0::bigint, 'the guardians are gone');
  return next is((select count(*) from public.college_coach where owner_athlete_id = v_a), 0::bigint, 'their own coach contacts are gone');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_a), 0::bigint, 'the coordinator assignments are gone');
  return next is((select count(*) from public.change_history where athlete_id = v_a or (table_name = 'athlete' and record_id = v_a::text)), 0::bigint, 'the history about the athlete is gone');
  return next is((select count(*) from public.change_history where changed_by = ua and changed_by_role = 'athlete'), 0::bigint, 'and the history of what they did as a student');

  -- nothing else is touched
  return next is((select count(*) from public.athlete where id = v_b), 1::bigint, 'the other athlete is untouched');
  return next is((select count(*) from public.change_history where athlete_id = v_b), v_hist_b, 'including their history');
  return next is((select count(*) from public.athlete_note where id = v_note_b), 1::bigint, 'and the note on their account');
  return next is((select count(*) from public.athlete_note_dismissal where note_id = v_note_b), 0::bigint, 'minus this person''s dismissal of it');
  return next ok(exists (select 1 from public.college_coach where id = tests.bid('coach_master')) and exists (select 1 from public.college_program where id = tests.bid('program_1')),
    'shared college data is kept');
  return next is((select count(*) from public.athlete_staff_assignment where athlete_id = v_b), 0::bigint, 'and nobody''s other assignments changed');

  -- the switch that pauses the history is off again, and the role change itself is on record as a dashboard change
  return next is(coalesce(nullif(current_setting('app.skip_audit', true), ''), 'off'), 'off', 'the switch that pauses the history is back off');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'app_user' and h.record_id = ua::text and h.change_type = 'updated'
                           and h.changed_by is null and h.changed_by_role = 'system' and h.new_values ->> 'role' = 'staff'),
    'the change to staff is in the history as a dashboard change');

  -- and they now act as staff: no athletes until assigned, then only the assigned ones
  return next is(tests.q_count(ua, 'select count(*) from public.athlete'), 0::bigint, 'signed in, they see no athletes yet');
  perform admin.assign_athletes('a@example.com', array['b@example.com']);
  return next is(tests.q_count(ua, format('select count(*) from public.athlete where id = %L', v_b)), 1::bigint, 'after being assigned B they can open B');
  return next is((select w.role::text || ' / ' || w.team from admin.who_is_who w where w.email = 'a@example.com'), 'staff / ' || v_pilot, 'who_is_who shows them as staff');

  -- it cannot be run twice
  return next ok(tests.admin_refuses(format($q$select * from admin.convert_athlete_to_staff('a@example.com', 'A', 'A', %L)$q$, v_pilot), '%no athlete profile%'), 'running it again is refused');
  return next is((select role::text || '/' || status::text from public.app_user where user_id = ub), 'athlete/active', 'the other athlete''s login is unchanged');
end;
$f$;

create function tests.test_convert_athlete_to_staff_can_make_an_administrator() returns setof text language plpgsql as $f$
declare
  r record;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
begin
  perform tests.world();
  select * into r from admin.convert_athlete_to_staff(account_email => 'a@example.com', given_name => 'Alex', family_name => 'Able', team_name => v_pilot,
                                                       account_role => 'admin', confirm_email => 'a@example.com', confirm => true);
  return next ok(r.converted, 'converted');
  return next is((select role::text from public.app_user where user_id = tests.gid('user_a')), 'admin', 'as an administrator');
  return next is(tests.q_count(tests.gid('user_a'), format('select count(*) from public.athlete where id = %L', tests.gid('athlete_b'))), 1::bigint, 'who sees every athlete');
end;
$f$;

create function tests.test_promote_to_staff_points_at_the_convert_function() returns setof text language plpgsql as $f$
begin
  perform tests.world();
  return next ok(tests.admin_refuses($q$select * from admin.promote_to_staff('a@example.com', 'A', 'A', 'Iowa Rockets 16R')$q$, '%has an athlete profile%admin.convert_athlete_to_staff%'),
    'promoting someone with an athlete profile points at convert_athlete_to_staff');
end;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Who is who, and what a dashboard change looks like in the history
-- ---------------------------------------------------------------------------------------------
create function tests.test_who_is_who_and_the_history() returns setof text language plpgsql as $f$
declare
  r record;
  v_pilot text := (select t.name from public.team t order by t.created_at limit 1);
begin
  perform tests.world();

  select * into r from admin.who_is_who w where w.email = 'a@example.com';
  return next is(r.role::text, 'athlete', 'the view shows an athlete');
  return next is(r.athlete, 'Test Athlete', 'by name');
  return next ok(r.coordinators like '%(primary)%', 'with their coordinators');
  select * into r from admin.who_is_who w where w.email = 's@example.com';
  return next is(r.role::text, 'staff', 'and a coordinator');
  return next ok(r.athlete is null and r.staff_name is not null, 'by their staff name');

  perform admin.promote_to_staff('z@example.com', 'Zed', 'Zee', v_pilot);
  select * into r from admin.who_is_who w where w.email = 'z@example.com';
  return next is(r.team, v_pilot, 'a promoted person shows their team');
  return next ok(exists (select 1 from public.change_history h where h.table_name = 'app_user' and h.record_id = tests.gid('user_z')::text
                           and h.changed_by is null and h.changed_by_role = 'system'),
    'the promotion is in the change history as a dashboard change');
end;
$f$;

select * from runtests('tests'::name);

rollback;
