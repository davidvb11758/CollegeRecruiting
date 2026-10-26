-- WP2 step 1: private schema, shared trigger helpers, enum types, lookup tables and their seed data.
-- Every table gets row-level security switched on here (default deny). The policies come in WP3.

create schema if not exists private;

-- ---------------------------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------------------------

create or replace function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Fills created_by / updated_by from the signed-in user. The browser can never set these.
-- When there is no signed-in user (dashboard SQL, load scripts) the values given are left alone.
create or replace function private.set_authorship() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Enum types (changed only by a migration, because code depends on the values)
-- ---------------------------------------------------------------------------------------------

create type public.user_role as enum ('athlete', 'staff', 'admin');
create type public.user_status as enum ('active', 'disabled');
create type public.program_type as enum ('womens', 'mens');
create type public.preferred_contact as enum ('email', 'phone', 'text');
create type public.handedness as enum ('right', 'left');
create type public.eligibility_status as enum ('not_started', 'registered', 'unsure');
create type public.guardian_relationship as enum ('mother', 'father', 'guardian', 'other');
create type public.interest_level as enum ('top_choice', 'open_to');
create type public.major_kind as enum ('intended', 'interest');
create type public.assignment_role as enum ('primary', 'secondary');
create type public.cost_need as enum ('significant_aid', 'some_aid', 'not_a_factor');
create type public.playing_time as enum ('start_freshman', 'earn_spot', 'develop');

create type public.control_type as enum ('public', 'private_nonprofit', 'private_for_profit');
create type public.campus_setting as enum ('urban', 'suburban', 'rural');
create type public.selectivity_level as enum ('highly_selective', 'selective', 'moderately_selective', 'open');
create type public.program_status as enum ('active', 'program_dropped', 'needs_review');
create type public.coach_title as enum ('head', 'associate_head', 'assistant', 'recruiting_coordinator', 'director_ops', 'other');
create type public.employment_status as enum ('current', 'departed', 'unknown');

create type public.list_stage as enum ('researching', 'shortlisted', 'contacted', 'in_conversation', 'camp_visit', 'offer', 'committed', 'closed');
create type public.closed_reason as enum ('i_passed', 'college_passed', 'no_response', 'other');
create type public.activity_direction as enum ('i_contacted', 'they_contacted', 'not_applicable');
create type public.activity_outcome as enum ('positive', 'neutral', 'negative', 'waiting');
create type public.entry_source as enum ('athlete', 'staff', 'system');
create type public.next_step_status as enum ('open', 'done', 'skipped');
create type public.change_type as enum ('created', 'updated', 'deleted', 'restored');

-- ---------------------------------------------------------------------------------------------
-- Lookup tables (editable by staff/admin without a release)
-- ---------------------------------------------------------------------------------------------

create table public.sport (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.division (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_position (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.major_category (
  code text primary key,
  label text not null,
  cip_series text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_type (
  code text primary key,
  label text not null,
  requires_direction boolean not null default false,
  user_selectable boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.next_step_type (
  code text primary key,
  label text not null,
  suggested_text text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.state (
  code char(2) primary key,
  name text not null unique,
  region text not null check (region in ('Northeast', 'Midwest', 'South', 'West', 'Territory')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_setting (
  key text primary key,
  value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------------------------

insert into public.sport (code, label, sort_order) values ('volleyball', 'Volleyball', 1);

insert into public.division (code, label, sort_order) values
  ('NCAA_D1', 'NCAA Division I', 1),
  ('NCAA_D2', 'NCAA Division II', 2),
  ('NCAA_D3', 'NCAA Division III', 3),
  ('NAIA', 'NAIA', 4),
  ('NJCAA', 'NJCAA (junior college)', 5);

insert into public.player_position (code, label, sort_order) values
  ('OH', 'Outside Hitter', 1),
  ('OPP', 'Opposite Hitter', 2),
  ('MB', 'Middle Hitter', 3),
  ('S', 'Setter', 4),
  ('L_DS', 'Libero / Defensive Specialist', 5);

insert into public.major_category (code, label, cip_series, sort_order) values
  ('AGRI', 'Agriculture & food sciences', '01', 1),
  ('ENVI', 'Environment & natural resources', '03', 2),
  ('ARCH', 'Architecture & design', '04', 3),
  ('ARTS', 'Visual & performing arts', '50', 4),
  ('BIOL', 'Biology & life sciences', '26', 5),
  ('BUSN', 'Business & management', '52', 6),
  ('COMM', 'Communication & media', '09;10', 7),
  ('COMP', 'Computer & information sciences', '11', 8),
  ('CRIM', 'Criminal justice & public safety', '43', 9),
  ('EDUC', 'Education & teaching', '13', 10),
  ('ENGR', 'Engineering', '14', 11),
  ('ENGT', 'Engineering & applied technology', '15', 12),
  ('LANG', 'English & world languages', '16;23', 13),
  ('KINE', 'Exercise science, sport & recreation', '31', 14),
  ('HLTH', 'Health professions & nursing', '51', 15),
  ('HIST', 'History', '54', 16),
  ('INTD', 'Interdisciplinary & general studies', '24;30', 17),
  ('LAWS', 'Law & legal studies', '22', 18),
  ('MATH', 'Mathematics & statistics', '27', 19),
  ('PHIL', 'Philosophy, religion & theology', '38;39', 20),
  ('PSCI', 'Physical sciences', '40;41', 21),
  ('PSYC', 'Psychology', '42', 22),
  ('SOWK', 'Public administration & social work', '44', 23),
  ('SOCS', 'Social sciences & area studies', '45;05', 24),
  ('TRDS', 'Skilled trades, culinary & family sciences', '46;47;48;49;12;19', 25);

insert into public.activity_type (code, label, requires_direction, user_selectable, sort_order) values
  ('email', 'Email', true, true, 1),
  ('phone_call', 'Phone call', true, true, 2),
  ('text_dm', 'Text / DM', true, true, 3),
  ('video_call', 'Video call', true, true, 4),
  ('camp_clinic', 'Camp / clinic', false, true, 5),
  ('campus_visit', 'Campus visit (unofficial)', false, true, 6),
  ('official_visit', 'Official visit', false, true, 7),
  ('questionnaire', 'Questionnaire submitted', false, true, 8),
  ('coach_saw_me', 'Coach saw me play', false, true, 9),
  ('offer', 'Offer', false, true, 10),
  ('other_note', 'Other note', false, true, 11),
  ('system', 'System entry', false, false, 99);

insert into public.next_step_type (code, label, suggested_text, sort_order) values
  ('send_email', 'Send email', 'Send an email to the coach', 1),
  ('follow_up', 'Follow up', 'Follow up with the coach', 2),
  ('call', 'Call', 'Call the coach', 3),
  ('send_video', 'Send video', 'Send my updated highlight video', 4),
  ('register_camp', 'Register for camp', 'Register for the camp', 5),
  ('plan_visit', 'Plan visit', 'Plan a campus visit', 6),
  ('thank_you', 'Thank-you', 'Send a thank-you note', 7),
  ('other', 'Other', null, 8);

insert into public.state (code, name, region, sort_order) values
  ('AL', 'Alabama', 'South', 1), ('AK', 'Alaska', 'West', 2), ('AZ', 'Arizona', 'West', 3),
  ('AR', 'Arkansas', 'South', 4), ('CA', 'California', 'West', 5), ('CO', 'Colorado', 'West', 6),
  ('CT', 'Connecticut', 'Northeast', 7), ('DE', 'Delaware', 'South', 8), ('DC', 'District of Columbia', 'South', 9),
  ('FL', 'Florida', 'South', 10), ('GA', 'Georgia', 'South', 11), ('HI', 'Hawaii', 'West', 12),
  ('ID', 'Idaho', 'West', 13), ('IL', 'Illinois', 'Midwest', 14), ('IN', 'Indiana', 'Midwest', 15),
  ('IA', 'Iowa', 'Midwest', 16), ('KS', 'Kansas', 'Midwest', 17), ('KY', 'Kentucky', 'South', 18),
  ('LA', 'Louisiana', 'South', 19), ('ME', 'Maine', 'Northeast', 20), ('MD', 'Maryland', 'South', 21),
  ('MA', 'Massachusetts', 'Northeast', 22), ('MI', 'Michigan', 'Midwest', 23), ('MN', 'Minnesota', 'Midwest', 24),
  ('MS', 'Mississippi', 'South', 25), ('MO', 'Missouri', 'Midwest', 26), ('MT', 'Montana', 'West', 27),
  ('NE', 'Nebraska', 'Midwest', 28), ('NV', 'Nevada', 'West', 29), ('NH', 'New Hampshire', 'Northeast', 30),
  ('NJ', 'New Jersey', 'Northeast', 31), ('NM', 'New Mexico', 'West', 32), ('NY', 'New York', 'Northeast', 33),
  ('NC', 'North Carolina', 'South', 34), ('ND', 'North Dakota', 'Midwest', 35), ('OH', 'Ohio', 'Midwest', 36),
  ('OK', 'Oklahoma', 'South', 37), ('OR', 'Oregon', 'West', 38), ('PA', 'Pennsylvania', 'Northeast', 39),
  ('RI', 'Rhode Island', 'Northeast', 40), ('SC', 'South Carolina', 'South', 41), ('SD', 'South Dakota', 'Midwest', 42),
  ('TN', 'Tennessee', 'South', 43), ('TX', 'Texas', 'South', 44), ('UT', 'Utah', 'West', 45),
  ('VT', 'Vermont', 'Northeast', 46), ('VA', 'Virginia', 'South', 47), ('WA', 'Washington', 'West', 48),
  ('WV', 'West Virginia', 'South', 49), ('WI', 'Wisconsin', 'Midwest', 50), ('WY', 'Wyoming', 'West', 51),
  ('PR', 'Puerto Rico', 'Territory', 52);

insert into public.app_setting (key, value, description) values
  ('list_cap', '30', 'Maximum number of non-archived colleges on an athlete''s list'),
  ('narrow_list_threshold', '15', 'List size above which a gentle "narrow your list" hint is shown (not in the pilot)'),
  ('next_step_default_days', '7', 'Suggested days until a new next step is due'),
  ('followup_default_days', '14', 'Suggested days until a follow-up when a contacted college has not replied'),
  ('silent_days', '21', 'Days without activity before a college is shown as silent');

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers and row-level security (default deny until WP3 adds policies)
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['sport', 'division', 'player_position', 'major_category', 'activity_type', 'next_step_type', 'state', 'app_setting']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
