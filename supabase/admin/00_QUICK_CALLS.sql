-- QUICK CALLS: the administrator's dashboard tasks, one copy-and-paste line each.
-- Open the Supabase dashboard -> the right project (DEV while testing; PROD only after the pilot is approved) -> SQL Editor,
-- paste ONE of these into a new query, change the values in quotes, and run it. (Save the ones you use as named snippets.)
-- Each call stops with a plain message and changes nothing if something is wrong, and shows the resulting row when it works.
-- The functions live in the `admin` schema, which only the dashboard can use; the app and the API cannot reach it.
-- Details and rules: supabase/migrations/20261126100000_admin_functions.sql (comments above each function).
-- Never put real emails in this file; edit them in the SQL Editor only.

-- WHO IS WHO: everyone who can sign in (role, status, name, team, each athlete's coordinators). Read-only.
select * from admin.who_is_who;

-- CREATE A TEAM (season defaults to the club's; grad_year, team_level and head_coach are optional).
select * from admin.create_team(team_name => 'Iowa Rockets 17R', grad_year => 2028);

-- PROMOTE A SIGN-UP TO STAFF on one team (replaces any earlier team). They sign up first, and must sign out and in afterwards.
-- job_title: 'Recruiting Coordinator' (default), 'Team Coach' or 'Director'.  account_role: 'staff' (default) or 'admin'.
-- Someone with an athlete profile cannot be promoted (staff need their own sign-up; remove a mistaken profile with delete_athlete).
select * from admin.promote_to_staff(account_email => 'COACH_EMAIL', given_name => 'First', family_name => 'Last', team_name => 'Iowa Rockets 16R');

-- ASSIGN ATHLETES to a coordinator. assign_as: 'primary' (default; the old main coordinator becomes 'secondary') or 'secondary'.
select * from admin.assign_athletes(coordinator_email => 'COACH_EMAIL', athlete_emails => array['FAMILY_EMAIL_1', 'FAMILY_EMAIL_2']);

-- TAKE AN ATHLETE AWAY from a coordinator.
select * from admin.unassign_athlete(player_email => 'FAMILY_EMAIL', coordinator_email => 'COACH_EMAIL');

-- SWITCH AN ACCOUNT OFF (bounced at once, data kept) or back on: new_status => 'disabled' or 'active'.
select * from admin.set_account_status(account_email => 'ACCOUNT_EMAIL', new_status => 'disabled');

-- DELETE AN ATHLETE AND ALL THEIR DATA. CANNOT BE UNDONE. Export first (05_export_athlete.sql) if there is any doubt.
-- Step 1, preview (the default; nothing is deleted):
select * from admin.delete_athlete(player_email => 'FAMILY_EMAIL');
-- Step 2, only when the preview shows the right person: repeat the email and confirm.
-- select * from admin.delete_athlete(player_email => 'FAMILY_EMAIL', confirm_email => 'FAMILY_EMAIL', confirm => true);
