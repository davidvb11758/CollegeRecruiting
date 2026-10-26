-- WP2 step 2: club, team, accounts (app_user), staff profile, the sign-up gate, and role helper functions.

create table public.club (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  time_zone text not null default 'America/Chicago',
  season_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.club (id),
  name text not null,
  grad_year_group integer,
  season_label text not null default '',
  level text,
  head_coach_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name, season_label)
);

-- One club, one pilot team (Iowa Rockets 16R).
insert into public.club (name, short_name, season_label) values ('Iowa Rockets', 'Rockets', '2026-27');
insert into public.team (club_id, name, season_label)
select id, 'Iowa Rockets 16R', '2026-27' from public.club where name = 'Iowa Rockets';

-- Today's date in the club's time zone. Every "due date" comparison uses this.
create function private.club_today() returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone coalesce((select c.time_zone from public.club c order by c.created_at limit 1), 'America/Chicago'))::date;
$$;

-- ---------------------------------------------------------------------------------------------
-- app_user: one row per login (auth.users). Role and status live here, never in editable metadata.
-- ---------------------------------------------------------------------------------------------

create table public.app_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  club_id uuid not null references public.club (id),
  role public.user_role not null default 'athlete',
  status public.user_status not null default 'active',
  display_name text not null default '',
  username text check (username is null or username ~ '^[A-Za-z0-9._]{4,30}$'),
  time_zone text not null default 'America/Chicago',
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Username sign-in is not used in the pilot (email sign-in), but the column is kept.
create unique index app_user_username_key on public.app_user (lower(username)) where username is not null;
create index app_user_role_idx on public.app_user (role);

create table public.staff_profile (
  user_id uuid primary key references public.app_user (user_id) on delete cascade,
  first_name text not null,
  last_name text not null,
  title text not null default 'Recruiting Coordinator'
    check (title in ('Recruiting Coordinator', 'Team Coach', 'Director')),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_team (
  staff_user_id uuid not null references public.staff_profile (user_id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_user_id, team_id)
);

-- A staff_profile may exist only for staff or admin users.
create function private.check_staff_profile_role() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_user u where u.user_id = new.user_id and u.role in ('staff', 'admin')) then
    raise exception 'staff_profile requires an app_user with role staff or admin';
  end if;
  return new;
end;
$$;

create trigger check_staff_profile_role
before insert or update of user_id on public.staff_profile
for each row execute function private.check_staff_profile_role();

-- ---------------------------------------------------------------------------------------------
-- Sign-up gate. Sign-up is open but needs the shared pilot code and the acknowledgement checkbox.
-- The code lives in a private table the API cannot read; the check runs inside the database, so it
-- cannot be skipped by calling the sign-up API directly. Until a code is set, every sign-up fails.
-- Set or change it in the dashboard SQL editor (never in a migration):
--   insert into private.secret_setting (key, value) values ('signup_code', 'the-code')
--   on conflict (key) do update set value = excluded.value;
-- The sign-up form sends it as user metadata: { pilot_code, acknowledged: true, display_name }.
-- ---------------------------------------------------------------------------------------------

create table private.secret_setting (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create function private.enforce_signup_gate() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
  v_given text;
begin
  select s.value into v_code from private.secret_setting s where s.key = 'signup_code';
  v_given := new.raw_user_meta_data ->> 'pilot_code';

  if v_code is null or btrim(v_code) = '' or lower(btrim(coalesce(v_given, ''))) is distinct from lower(btrim(v_code)) then
    raise exception 'Invalid sign-up code' using errcode = 'P0001';
  end if;
  if coalesce(new.raw_user_meta_data ->> 'acknowledged', '') <> 'true' then
    raise exception 'The acknowledgement must be accepted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_signup_gate
before insert on auth.users
for each row execute function private.enforce_signup_gate();

-- Every new login gets an app_user row with role athlete. Role is NEVER taken from metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.app_user (user_id, club_id, role, status, display_name, acknowledged_at)
  values (
    new.id,
    (select c.id from public.club c order by c.created_at limit 1),
    'athlete',
    'active',
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 80),
    now()
  );
  return new;
end;
$$;

create trigger handle_new_user
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Role helpers used by RLS policies (WP3). Security definer so they can read app_user regardless of
-- the caller's own permissions; fixed search path; a disabled account fails every helper.
-- ---------------------------------------------------------------------------------------------

create function private.app_role() returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select u.role from public.app_user u where u.user_id = auth.uid() and u.status = 'active';
$$;

create function private.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select u.role = 'admin' from public.app_user u where u.user_id = auth.uid() and u.status = 'active'), false);
$$;

create function private.is_staff() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select u.role in ('staff', 'admin') from public.app_user u where u.user_id = auth.uid() and u.status = 'active'), false);
$$;

-- Staff and admin may edit the shared college data (decision D4).
create function private.can_write_master() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_staff();
$$;

-- Policies and views run as the signed-in user, so that role needs to see the private schema's functions
-- (the schema is not exposed through the API, so nothing in it can be called from the browser).
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on table private.secret_setting from public, anon, authenticated;

-- The sign-up triggers on auth.users fire inside the Auth service's database role.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.enforce_signup_gate() to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['club', 'team', 'app_user', 'staff_profile']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['club', 'team', 'app_user', 'staff_profile', 'staff_team']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
