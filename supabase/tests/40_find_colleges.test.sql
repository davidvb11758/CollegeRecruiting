-- WP7: Find Colleges on a known sample. The app filters public.program_search with these exact predicates
-- (see app/src/lib/findFilters.ts), run here AS a signed-in athlete.
-- Sample: 11 Division III programs, unitid 900101..900111, ranked 1..10 inside their own test season (so bands are 1..6),
-- plus #11 with no rank and no facts at all.
--   n      state  control            enrollment  setting        selectivity           majors
--   odd    IA     public (n=10: for-profit)  n*1500  n%3: 0 urban, 1 suburban, 2 rural  n%4: 0 highly, 1 selective, 2 moderately, 3 open
--   even   MN     private_nonprofit
--   majors: BUSN for 1-3, COMP for 3-5; conference "Find Test Conf" for 1-4.
begin;

create schema if not exists tests;

create function tests.find_world() returns uuid language plpgsql as $f$
declare
  v_conf bigint;
  v_athlete uuid;
  n integer;
begin
  insert into public.conference (name, division_code) values ('Find Test Conf', 'NCAA_D3') returning id into v_conf;
  for n in 1..10 loop
    insert into public.college (unitid, name, city, state, control, enrollment, campus_setting, selectivity)
    values (900100 + n, 'Find Test College ' || n, 'Testville',
            case when n % 2 = 1 then 'IA' else 'MN' end,
            case when n = 10 then 'private_for_profit'::public.control_type when n % 2 = 1 then 'public' else 'private_nonprofit' end,
            n * 1500,
            (array['urban', 'suburban', 'rural'])[n % 3 + 1]::public.campus_setting,
            (array['highly_selective', 'selective', 'moderately_selective', 'open'])[n % 4 + 1]::public.selectivity_level);
    insert into public.college_program (unitid, division_code, program_name, conference_id, division_rank, division_rank_season)
    values (900100 + n, 'NCAA_D3', 'Find Test College ' || n, case when n <= 4 then v_conf end, n, 'T-find');
  end loop;
  insert into public.college (unitid, name) values (900111, 'Find Test College 11');
  insert into public.college_program (unitid, division_code, program_name) values (900111, 'NCAA_D3', 'Find Test College 11');
  insert into public.college_major (unitid, major_code) select 900100 + g, 'BUSN' from generate_series(1, 3) g;
  insert into public.college_major (unitid, major_code) select 900100 + g, 'COMP' from generate_series(3, 5) g;
  v_athlete := tests.mk_athlete('find@example.com');
  return (select a.user_id from public.athlete a where a.id = v_athlete);
end;
$f$;

create function tests.n_of(p_user uuid, p_where text) returns bigint language plpgsql as $f$
begin
  return tests.q_count(p_user, 'select count(*) from public.program_search where unitid between 900101 and 900111 and ' || p_where);
end;
$f$;

create function tests.test_name_division_and_state_filters() returns setof text language plpgsql as $f$
declare
  u uuid := tests.find_world();
begin
  return next is(tests.n_of(u, 'true'), 11::bigint, 'the sample has 11 programs');
  return next is(tests.n_of(u, $q$college_name ilike '%find test college 1%'$q$), 3::bigint, 'name search is case-insensitive and finds a part of the name (1, 10, 11)');
  return next is(tests.n_of(u, $q$college_name ilike '%FIND TEST COLLEGE 7%'$q$), 1::bigint, 'upper-case search still matches');
  return next is(tests.q_text(u, $q$select ('a%b' ilike '%a\%b%')::text || ('axb' ilike '%a\%b%')::text || ('a_b' ilike '%a\_b%')::text || ('axb' ilike '%a\_b%')::text$q$),
    'truefalsetruefalse', 'a typed % or _ is matched as itself when the app puts a backslash in front');
  return next is(tests.n_of(u, $q$division_code in ('NCAA_D3')$q$), 11::bigint, 'division filter');
  return next is(tests.n_of(u, $q$division_code in ('NCAA_D1', 'NAIA')$q$), 0::bigint, 'other divisions give none');
  return next is(tests.n_of(u, $q$state in ('IA')$q$), 5::bigint, 'state IA: the five odd-numbered colleges');
  return next is(tests.n_of(u, $q$state in ('IA', 'MN')$q$), 10::bigint, 'two states: ten (the unknown-state one is not included)');
  return next is(tests.n_of(u, $q$conference = 'Find Test Conf'$q$), 4::bigint, 'conference filter');
end;
$f$;

create function tests.test_control_size_setting_and_selectivity_filters() returns setof text language plpgsql as $f$
declare
  u uuid := tests.find_world();
begin
  return next is(tests.n_of(u, $q$control in ('public')$q$), 5::bigint, 'public: 5');
  return next is(tests.n_of(u, $q$control in ('private_nonprofit', 'private_for_profit')$q$), 5::bigint, 'private (both kinds): 5');
  return next is(tests.n_of(u, $q$size_band in ('small')$q$), 1::bigint, 'small (under 3,000): 1');
  return next is(tests.n_of(u, $q$size_band in ('medium')$q$), 5::bigint, 'medium (3,000 up to 10,000): 5');
  return next is(tests.n_of(u, $q$size_band in ('large')$q$), 4::bigint, 'large (10,000 and over): 4');
  return next is(tests.n_of(u, $q$size_band in ('small', 'large')$q$), 5::bigint, 'two sizes together: 5');
  return next is(tests.n_of(u, $q$campus_setting in ('urban')$q$), 3::bigint, 'city: 3, 6, 9');
  return next is(tests.n_of(u, $q$campus_setting in ('suburban', 'rural')$q$), 7::bigint, 'suburb or rural: 7');
  return next is(tests.n_of(u, $q$selectivity in ('highly_selective')$q$), 2::bigint, 'highly selective: 4, 8');
  return next is(tests.n_of(u, $q$selectivity in ('selective', 'open')$q$), 5::bigint, 'selective or open: 5');
end;
$f$;

create function tests.test_band_and_major_filters_and_missing_facts() returns setof text language plpgsql as $f$
declare
  u uuid := tests.find_world();
begin
  return next is(tests.n_of(u, 'competitiveness_band in (1)'), 1::bigint, 'band 1: rank 1');
  return next is(tests.n_of(u, 'competitiveness_band in (1, 2)'), 2::bigint, 'bands 1 and 2: 2');
  return next is(tests.n_of(u, 'competitiveness_band in (6)'), 5::bigint, 'band 6 (the lower half): ranks 6-10');
  return next is(tests.n_of(u, 'competitiveness_band is null'), 1::bigint, 'the unranked program has no band');
  return next is(tests.n_of(u, $q$major_codes @> '{BUSN}'$q$), 3::bigint, 'major BUSN: 1-3');
  return next is(tests.n_of(u, $q$major_codes @> '{COMP}'$q$), 3::bigint, 'major COMP: 3-5');
  return next is(tests.n_of(u, $q$major_codes @> '{BUSN}' and major_codes @> '{COMP}'$q$), 1::bigint, 'both majors: only college 3');
  return next is(tests.n_of(u, $q$major_codes @> '{HLTH}'$q$), 0::bigint, 'a major nobody offers gives none');
  return next is(tests.n_of(u, $q$state in ('IA') and control in ('private_nonprofit')$q$), 0::bigint, 'filters combine with AND (odd colleges are never private non-profit)');
  return next is(tests.n_of(u, $q$status = 'active'$q$), 11::bigint, 'all sample programs are active');
end;
$f$;

create function tests.test_sorts() returns setof text language plpgsql as $f$
declare
  u uuid := tests.find_world();
begin
  return next is(tests.q_text(u, $q$select college_name from public.program_search where unitid between 900101 and 900111 order by division_sort, division_rank, program_id limit 1$q$),
    'Find Test College 1', 'best-ranked first puts rank 1 first');
  return next is(tests.q_text(u, $q$select college_name from public.program_search where unitid between 900101 and 900111 order by division_sort, division_rank nulls last, program_id desc limit 1$q$),
    'Find Test College 1', 'unranked programs sort last');
  return next is(tests.q_text(u, $q$select division_sort::text from public.program_search where unitid = 900101$q$), '3',
    'division_sort for Division III is 3');
  return next is(tests.q_text(u, $q$select string_agg(code, ',' order by sort_order) from public.division$q$), 'NCAA_D1,NCAA_D2,NCAA_D3,NAIA,NJCAA',
    'divisions sort D1, D2, D3, NAIA, NJCAA');
  return next is(tests.q_text(u, $q$select college_name from public.program_search where unitid between 900101 and 900111 order by college_name, program_id limit 1$q$),
    'Find Test College 1', 'name order puts "1" before "10" and "11"');
end;
$f$;

select * from runtests('tests'::name);

rollback;
