-- WP10: a standing audit of the database's security shape. The other files test behaviour (who can read what);
-- this one tests the structure those behaviours rest on, so a future migration that quietly loosens something
-- (a new table without row-level security, a view that bypasses it, a grant to signed-out users) fails here.
-- When a migration legitimately adds a table or a grant, update the expected lists below in the same change.
begin;

create schema if not exists tests;

-- Every relation in the public schema: tables, partitioned tables, views, materialized views.
create function tests.public_rels(p_kinds text) returns table (name text, oid oid, kind "char") language sql stable as $f$
  select c.relname::text, c.oid, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = any (string_to_array(p_kinds, ',')::"char"[])
$f$;

create function tests.test_every_table_has_row_level_security() returns setof text language plpgsql as $f$
begin
  return next is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), null::text[],
    'every public table has row-level security switched on');
  return next is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'v'
                     and not coalesce('security_invoker=true' = any (c.reloptions), false)), null::text[],
    'every public view runs with the caller''s rights (security_invoker), so row-level security applies through it');
  return next is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'm'),
    0::bigint, 'there are no materialized views (they ignore row-level security)');
end;
$f$;

create function tests.test_signed_out_users_can_reach_nothing() returns setof text language plpgsql as $f$
begin
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p,v,m') r
                   where has_table_privilege('anon', r.oid, 'select,insert,update,delete,truncate,references,trigger')
                      or has_any_column_privilege('anon', r.oid, 'select,insert,update,references')), null::text[],
    'the anon role has no privilege of any kind on any public table or view');
  -- Functions are executable by everyone by default; what matters is whether a signed-out caller can reach them.
  -- They cannot enter the private schema, and everything in public had execute revoked.
  return next is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
                     and has_schema_privilege('anon', n.oid, 'usage')), 0::bigint,
    'anon can reach and run no function in the public or private schemas');
  return next is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')), 0::bigint,
    'signed-in users can call no function in the public schema through the API (the app only reads and writes tables)');
  return next ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot enter the private schema');
  return next is((select count(*) from pg_policies where schemaname = 'public' and ('anon' = any (roles) or 'public' = any (roles))), 0::bigint,
    'no policy is open to anon or to everyone');
  return next ok(not has_table_privilege('anon', 'private.secret_setting', 'select')
                 and not has_table_privilege('authenticated', 'private.secret_setting', 'select'),
    'the sign-up code table cannot be read through the API');
end;
$f$;

create function tests.test_signed_in_privileges_match_the_reviewed_list() returns setof text language plpgsql as $f$
declare
  v_tables constant text[] := array['activity_entry', 'activity_type', 'app_setting', 'app_user', 'athlete', 'athlete_academic', 'athlete_athletic',
    'athlete_college', 'athlete_guardian', 'athlete_major', 'athlete_note', 'athlete_note_dismissal', 'athlete_preference', 'athlete_staff_assignment', 'athlete_target_division',
    'athlete_video_link', 'change_history', 'club', 'college', 'college_coach', 'college_major', 'college_program', 'conference', 'division',
    'major_category', 'next_step', 'next_step_type', 'player_position', 'sport', 'staff_profile', 'staff_team', 'state', 'team', 'zip_location'];
  v_views constant text[] := array['athlete_completeness', 'my_list', 'next_steps_due', 'note_thread', 'program_competitiveness', 'program_search', 'staff_roster'];
begin
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p') r where has_table_privilege('authenticated', r.oid, 'select')),
    v_tables, 'signed-in users can read exactly the reviewed tables');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('v') r where has_table_privilege('authenticated', r.oid, 'select')),
    v_views, 'and exactly the reviewed views');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p,v') r where has_table_privilege('authenticated', r.oid, 'insert')),
    array['activity_entry', 'athlete_academic', 'athlete_athletic', 'athlete_college', 'athlete_guardian', 'athlete_major', 'athlete_preference',
          'athlete_target_division', 'athlete_video_link', 'college', 'college_coach', 'college_program', 'next_step'],
    'table-wide INSERT is limited to the reviewed list (athlete is column-limited)');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p,v') r where has_table_privilege('authenticated', r.oid, 'update')),
    array['activity_entry', 'athlete_academic', 'athlete_athletic', 'athlete_college', 'athlete_guardian', 'athlete_major', 'athlete_preference',
          'athlete_target_division', 'athlete_video_link', 'college', 'college_coach', 'college_program', 'next_step'],
    'table-wide UPDATE is limited to the reviewed list');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p,v') r where has_table_privilege('authenticated', r.oid, 'delete')),
    array['athlete_guardian', 'athlete_major', 'athlete_target_division', 'athlete_video_link', 'college_coach'],
    'DELETE is limited to an athlete''s small editable lists and private contacts');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p,v') r
                   where has_table_privilege('authenticated', r.oid, 'truncate,references,trigger')), null::text[],
    'nobody signed in can truncate, reference or add triggers');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('v') r
                   where has_table_privilege('authenticated', r.oid, 'insert,update,delete')), null::text[], 'views are read-only');
end;
$f$;

create function tests.test_accounts_and_ownership_columns_cannot_be_written() returns setof text language plpgsql as $f$
begin
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'role', 'update'), 'nobody can change their own role');
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'status', 'update'), 'nobody can re-enable a disabled account');
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'user_id', 'update'), 'user_id is fixed');
  return next ok(not has_column_privilege('authenticated', 'public.app_user', 'club_id', 'update'), 'club is fixed');
  return next ok(not has_table_privilege('authenticated', 'public.app_user', 'insert'), 'accounts are created only by the sign-up trigger');
  return next ok(has_column_privilege('authenticated', 'public.app_user', 'display_name', 'update'), 'but the display name can be changed');
  return next ok(not has_column_privilege('authenticated', 'public.staff_profile', 'user_id', 'update'), 'a staff profile cannot be moved to another login');
  return next ok(not has_column_privilege('authenticated', 'public.staff_profile', 'active', 'update'), 'a staff member cannot reactivate themselves');
  return next ok(not has_table_privilege('authenticated', 'public.staff_profile', 'insert'), 'staff profiles are created only in the dashboard');
  return next ok(not has_column_privilege('authenticated', 'public.athlete', 'id', 'update'), 'an athlete id is fixed');
  return next ok(not has_column_privilege('authenticated', 'public.athlete', 'user_id', 'update'), 'an athlete cannot be handed to another login');
  return next ok(has_column_privilege('authenticated', 'public.athlete', 'user_id', 'insert'), 'but the first-login insert can set it (policy: only to yourself)');
  return next ok(not has_table_privilege('authenticated', 'public.athlete', 'delete'), 'an athlete record cannot be deleted through the app');
  return next ok(not has_table_privilege('authenticated', 'public.athlete_staff_assignment', 'insert')
                 and not has_table_privilege('authenticated', 'public.athlete_staff_assignment', 'update')
                 and not has_table_privilege('authenticated', 'public.athlete_staff_assignment', 'delete'),
    'assignments are changed only in the dashboard');
  return next ok(not has_table_privilege('authenticated', 'public.change_history', 'insert')
                 and not has_table_privilege('authenticated', 'public.change_history', 'update')
                 and not has_table_privilege('authenticated', 'public.change_history', 'delete'), 'the change history cannot be written or erased through the app');
end;
$f$;

create function tests.test_policies_exist_where_access_is_granted() returns setof text language plpgsql as $f$
begin
  -- A table the app may read needs a select policy; without one every read quietly returns nothing.
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p') r
                   where has_table_privilege('authenticated', r.oid, 'select')
                     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.name and p.cmd in ('SELECT', 'ALL'))),
    null::text[], 'every readable table has a select policy');
  -- The reverse: a write grant without a matching policy is dead weight, and a policy without a grant hides a gap.
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p') r
                   where has_table_privilege('authenticated', r.oid, 'insert')
                     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.name and p.cmd in ('INSERT', 'ALL'))),
    null::text[], 'every insertable table has an insert policy');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p') r
                   where has_table_privilege('authenticated', r.oid, 'update')
                     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.name and p.cmd in ('UPDATE', 'ALL'))),
    null::text[], 'every updatable table has an update policy');
  return next is((select array_agg(r.name order by r.name) from tests.public_rels('r,p') r
                   where has_table_privilege('authenticated', r.oid, 'delete')
                     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.name and p.cmd in ('DELETE', 'ALL'))),
    null::text[], 'every table with delete has a delete policy');
  return next is((select array_agg(distinct p.tablename::text order by p.tablename::text) from pg_policies p where p.schemaname = 'public' and p.permissive = 'RESTRICTIVE'),
    null::text[], 'no restrictive policies are in use (the model is plain allow-lists)');
end;
$f$;

create function tests.test_helper_functions_are_locked_down() returns setof text language plpgsql as $f$
begin
  -- The role and access helpers are security definer so policies can read app_user. They must pin their search path,
  -- or a caller could shadow a table name and borrow the definer's rights.
  return next is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'private' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
    null::text[], 'every security-definer function in the private schema pins its search_path');
  -- rls_auto_enable is Supabase's own event-trigger function (it switches row-level security on for new tables);
  -- the policies migration already revoked execute on it from every API role.
  return next is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prosecdef and p.proname <> 'rls_auto_enable'), null::text[],
    'no security-definer function of ours is exposed in the public schema');
  return next ok(not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
                 and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'),
    'Supabase''s rls_auto_enable cannot be called through the API');
end;
$f$;

select * from runtests('tests'::name);

rollback;
