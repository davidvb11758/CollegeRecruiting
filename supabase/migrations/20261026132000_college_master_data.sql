-- WP2 step 3: college master data (shared reference data) and the competitiveness-band view.
-- The data itself is loaded in WP4. Staff and admin may edit these tables (decision D4; policies in WP3).

create table public.conference (
  id bigint generated always as identity primary key,
  name text not null,
  division_code text not null references public.division (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_code, name)
);

-- One row per institution. unitid is a plain integer key: it is the IPEDS id for almost every row, but three
-- campuses use owner-assigned ids (17373502, 17373505, 213613), so it must NOT reference an IPEDS table.
create table public.college (
  unitid integer primary key check (unitid > 0),
  name text not null,
  short_name text,
  city text,
  state char(2) references public.state (code),
  zip char(5) check (zip is null or zip ~ '^[0-9]{5}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  cost_url text check (cost_url is null or cost_url ~* '^https?://'),
  control public.control_type,
  enrollment integer check (enrollment is null or enrollment > 0),
  enrollment_term text,
  campus_setting public.campus_setting,
  locale_code text,
  selectivity public.selectivity_level,
  admit_rate numeric(4, 3) check (admit_rate is null or admit_rate between 0 and 1),
  tuition_in_state integer check (tuition_in_state is null or tuition_in_state >= 0),
  tuition_out_state integer check (tuition_out_state is null or tuition_out_state >= 0),
  tuition_year text,
  religious_affiliation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index college_state_idx on public.college (state);

create table public.college_major (
  unitid integer not null references public.college (unitid) on delete cascade,
  major_code text not null references public.major_category (code),
  primary key (unitid, major_code)
);

create index college_major_code_idx on public.college_major (major_code);

-- A volleyball program. In the pilot it is one-to-one with college; it has its own id so a college can later
-- have several programs (other sports, other divisions).
create table public.college_program (
  id bigint generated always as identity primary key,
  unitid integer not null references public.college (unitid),
  sport_code text not null default 'volleyball' references public.sport (code),
  program_type public.program_type not null default 'womens',
  division_code text not null references public.division (code),
  conference_id bigint references public.conference (id),
  program_name text not null,
  campus_label text not null default '',
  program_url text check (program_url is null or program_url ~* '^https?://'),
  questionnaire_url text check (questionnaire_url is null or questionnaire_url ~* '^https?://'),
  camps_url text check (camps_url is null or camps_url ~* '^https?://'),
  instagram_url text,
  x_url text,
  last_season_record text,
  division_rank integer check (division_rank is null or division_rank > 0),
  division_rank_season text,
  rating numeric(8, 3),
  last_verified_on date not null default current_date,
  verified_by uuid,
  data_source text,
  status public.program_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unitid, division_code, sport_code, program_type, campus_label)
);

create index college_program_unitid_idx on public.college_program (unitid);
create index college_program_division_idx on public.college_program (division_code);
create index college_program_conference_idx on public.college_program (conference_id);

-- College coach contact records. A row with owner_athlete_id null is shared master data; a row owned by an athlete is
-- private to that athlete and their staff (athlete-added contact). The athlete foreign key is added in step 4.
-- Email is deliberately NOT unique: some programs share one inbox between coaches.
create table public.college_coach (
  id bigint generated always as identity primary key,
  program_id bigint not null references public.college_program (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  title public.coach_title not null default 'other',
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  is_primary_recruiting_contact boolean not null default false,
  recruits_note text,
  staff_page_url text check (staff_page_url is null or staff_page_url ~* '^https?://'),
  social_handles text,
  employment_status public.employment_status not null default 'current',
  last_verified_on date not null default current_date,
  verified_by uuid,
  source text,
  owner_athlete_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index college_coach_program_idx on public.college_coach (program_id);
create index college_coach_owner_idx on public.college_coach (owner_athlete_id) where owner_athlete_id is not null;
create unique index college_coach_one_primary_idx on public.college_coach (program_id)
  where is_primary_recruiting_contact and owner_athlete_id is null;

-- Loaded once from Census ZIP-area centres; used by the distance filter (not in the pilot).
create table public.zip_location (
  zip char(5) primary key check (zip ~ '^[0-9]{5}$'),
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null
);

-- ---------------------------------------------------------------------------------------------
-- Competitiveness band (decision D6): rank within division as a percentile of the ranked programs.
--   Top 10% = 1, 10-20% = 2, 20-30% = 3, 30-40% = 4, 40-50% = 5, 50%-rest = 6. No rank = no band.
-- Boundary rule: a program exactly at 10%, 20%, ... belongs to the better band ("up to and including").
-- Computed here, never typed in.
-- ---------------------------------------------------------------------------------------------

create view public.program_competitiveness with (security_invoker = true) as
select
  p.id as program_id,
  p.division_code,
  p.division_rank,
  p.division_rank_season,
  case when p.division_rank is null then null
       else count(*) filter (where p.division_rank is not null) over (partition by p.division_code, p.division_rank_season)
  end as ranked_count,
  case when p.division_rank is null then null
       else least(
         6,
         ceil(
           p.division_rank * 10.0
           / nullif(count(*) filter (where p.division_rank is not null) over (partition by p.division_code, p.division_rank_season), 0)
         )
       )::integer
  end as band
from public.college_program p;

-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['conference', 'college', 'college_program', 'college_coach']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['conference', 'college', 'college_major', 'college_program', 'college_coach', 'zip_location']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
