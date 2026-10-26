-- WP2 step 4: athlete profile tables (split into 1:1 tables so an athlete and a coordinator can edit different tabs),
-- child lists, staff assignment, and the access helpers used by RLS in WP3.
-- Pilot cuts: no `version` column (last save wins); the audit trail is the safety net.

create table public.athlete (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_user (user_id) on delete cascade,
  team_id uuid not null references public.team (id),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  preferred_name text,
  date_of_birth date not null,
  graduation_year integer not null check (graduation_year between 2025 and 2040),
  sport_code text not null default 'volleyball' references public.sport (code),
  program_type public.program_type not null default 'womens',
  home_city text,
  home_state char(2) not null references public.state (code),
  home_zip char(5) check (home_zip is null or home_zip ~ '^[0-9]{5}$'),
  athlete_email text check (athlete_email is null or athlete_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  athlete_phone text,
  preferred_contact public.preferred_contact,
  jersey_number text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athlete_team_idx on public.athlete (team_id);

create table public.athlete_athletic (
  athlete_id uuid primary key references public.athlete (id) on delete cascade,
  primary_position text not null references public.player_position (code),
  secondary_position text references public.player_position (code),
  height_in integer check (height_in is null or height_in between 48 and 96),
  standing_reach_in integer check (standing_reach_in is null or standing_reach_in between 60 and 130),
  approach_touch_in integer check (approach_touch_in is null or approach_touch_in between 60 and 160),
  block_touch_in integer check (block_touch_in is null or block_touch_in between 60 and 160),
  dominant_hand public.handedness,
  club_team_name text,
  club_level text,
  club_coach_name text,
  club_coach_email text check (club_coach_email is null or club_coach_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  club_coach_phone text,
  hs_coach_name text,
  hs_coach_email text check (hs_coach_email is null or hs_coach_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  hs_coach_phone text,
  awards_text text check (awards_text is null or length(awards_text) <= 4000),
  stats_summary_text text check (stats_summary_text is null or length(stats_summary_text) <= 4000),
  about_me_text text check (about_me_text is null or length(about_me_text) <= 2000),
  instagram_handle text,
  x_handle text,
  tiktok_handle text,
  external_profile_url text check (external_profile_url is null or external_profile_url ~* '^https?://'),
  game_film_url text check (game_film_url is null or game_film_url ~* '^https?://'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (secondary_position is null or secondary_position <> primary_position)
);

create table public.athlete_academic (
  athlete_id uuid primary key references public.athlete (id) on delete cascade,
  hs_name text,
  hs_city text,
  hs_state char(2) references public.state (code),
  gpa_unweighted numeric(3, 2) check (gpa_unweighted is null or gpa_unweighted between 0 and 4),
  gpa_weighted numeric(3, 2) check (gpa_weighted is null or gpa_weighted between 0 and 5.5),
  gpa_updated_on date,
  class_rank_text text,
  major_undecided boolean not null default false,
  sat_total integer check (sat_total is null or sat_total between 400 and 1600),
  sat_date date,
  act_composite integer check (act_composite is null or act_composite between 1 and 36),
  act_date date,
  planned_test_dates_text text,
  ncaa_ec_status public.eligibility_status,
  naia_status public.eligibility_status,
  counselor_name text,
  counselor_email text check (counselor_email is null or counselor_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A row exists only after the athlete saves preferences, so "row missing" means "preferences not done".
create table public.athlete_preference (
  athlete_id uuid primary key references public.athlete (id) on delete cascade,
  competitiveness_bands integer[] not null
    check (cardinality(competitiveness_bands) between 1 and 6 and competitiveness_bands <@ array[1, 2, 3, 4, 5, 6]),
  playing_time_expectation public.playing_time,
  preferred_regions text[] not null default '{}'
    check (preferred_regions <@ array['Northeast', 'Midwest', 'South', 'West']),
  max_distance_miles integer check (max_distance_miles is null or max_distance_miles > 0),
  school_sizes text[] not null default '{}' check (school_sizes <@ array['small', 'medium', 'large']),
  control_types text[] not null default '{}' check (control_types <@ array['public', 'private']),
  campus_settings text[] not null default '{}' check (campus_settings <@ array['urban', 'suburban', 'rural']),
  academic_importance integer check (academic_importance is null or academic_importance between 1 and 5),
  cost_need public.cost_need,
  must_haves_text text check (must_haves_text is null or length(must_haves_text) <= 2000),
  deal_breakers_text text check (deal_breakers_text is null or length(deal_breakers_text) <= 2000),
  ideal_school_text text check (ideal_school_text is null or length(ideal_school_text) <= 2000),
  last_reviewed_on date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.athlete_target_division (
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  division_code text not null references public.division (code),
  interest public.interest_level not null default 'open_to',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, division_code)
);

create table public.athlete_major (
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  major_code text not null references public.major_category (code),
  kind public.major_kind not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, major_code, kind)
);

create table public.athlete_guardian (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  relationship public.guardian_relationship not null,
  full_name text not null check (btrim(full_name) <> ''),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  is_primary boolean not null default false,
  ok_to_share boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athlete_guardian_athlete_idx on public.athlete_guardian (athlete_id);
create unique index athlete_guardian_one_primary_idx on public.athlete_guardian (athlete_id) where is_primary;

create table public.athlete_video_link (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  label text not null default '',
  url text not null check (url ~* '^https?://'),
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athlete_video_link_athlete_idx on public.athlete_video_link (athlete_id);

-- Which staff members see which athletes. The pilot assigns these in the dashboard (about 12 rows).
create table public.athlete_staff_assignment (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete (id) on delete cascade,
  staff_user_id uuid not null references public.staff_profile (user_id) on delete cascade,
  role_on_athlete public.assignment_role not null default 'primary',
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, staff_user_id)
);

create index athlete_staff_assignment_staff_idx on public.athlete_staff_assignment (staff_user_id);
create unique index athlete_staff_assignment_one_primary_idx on public.athlete_staff_assignment (athlete_id)
  where role_on_athlete = 'primary';

-- Athlete-added coach contacts (step 3 left this column without its foreign key).
alter table public.college_coach
  add constraint college_coach_owner_athlete_fk foreign key (owner_athlete_id) references public.athlete (id) on delete cascade;

-- ---------------------------------------------------------------------------------------------
-- Rules that need triggers
-- ---------------------------------------------------------------------------------------------

-- The athlete must be 14 to 18 years old when the record is created (checked at insert only).
create function private.check_athlete_age() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_age integer := extract(year from age(private.club_today(), new.date_of_birth));
begin
  if v_age < 14 or v_age > 18 then
    raise exception 'Athletes must be 14 to 18 years old (date of birth gives %)', v_age using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_athlete_age before insert on public.athlete
for each row execute function private.check_athlete_age();

-- Row-count limits on child lists: max 2 guardians, 3 video links, 3 intended majors.
create function private.enforce_child_limits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'athlete_guardian' then
    if (select count(*) from public.athlete_guardian g where g.athlete_id = new.athlete_id and g.id <> new.id) >= 2 then
      raise exception 'An athlete can have at most 2 guardians' using errcode = '23514';
    end if;
  elsif tg_table_name = 'athlete_video_link' then
    if (select count(*) from public.athlete_video_link v where v.athlete_id = new.athlete_id and v.id <> new.id) >= 3 then
      raise exception 'An athlete can have at most 3 video links' using errcode = '23514';
    end if;
  elsif tg_table_name = 'athlete_major' and new.kind = 'intended' then
    if (select count(*) from public.athlete_major m
        where m.athlete_id = new.athlete_id and m.kind = 'intended' and m.major_code <> new.major_code) >= 3 then
      raise exception 'An athlete can have at most 3 intended majors' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_child_limits before insert or update on public.athlete_guardian
for each row execute function private.enforce_child_limits();
create trigger enforce_child_limits before insert or update on public.athlete_video_link
for each row execute function private.enforce_child_limits();
create trigger enforce_child_limits before insert or update on public.athlete_major
for each row execute function private.enforce_child_limits();

-- ---------------------------------------------------------------------------------------------
-- Access helpers for RLS (WP3). Security definer, fixed search path.
-- ---------------------------------------------------------------------------------------------

create function private.my_athlete_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select a.id
  from public.athlete a
  join public.app_user u on u.user_id = a.user_id and u.status = 'active'
  where a.user_id = auth.uid();
$$;

-- True when the caller owns the athlete, is staff assigned to that athlete, or is an admin.
create function private.can_access_athlete(p_athlete_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    p_athlete_id is not null
    and coalesce((select u.status = 'active' from public.app_user u where u.user_id = auth.uid()), false)
    and (
      p_athlete_id = private.my_athlete_id()
      or private.is_admin()
      or (
        private.is_staff()
        and exists (
          select 1 from public.athlete_staff_assignment s
          where s.athlete_id = p_athlete_id and s.staff_user_id = auth.uid()
        )
      )
    );
$$;

-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['athlete', 'athlete_athletic', 'athlete_academic', 'athlete_preference',
                           'athlete_target_division', 'athlete_major', 'athlete_guardian', 'athlete_video_link']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger set_authorship before insert or update on public.%I for each row execute function private.set_authorship()', t);
  end loop;
  create trigger set_updated_at before update on public.athlete_staff_assignment
    for each row execute function private.set_updated_at();

  foreach t in array array['athlete', 'athlete_athletic', 'athlete_academic', 'athlete_preference',
                           'athlete_target_division', 'athlete_major', 'athlete_guardian', 'athlete_video_link',
                           'athlete_staff_assignment']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
