-- Competitiveness bands: use a program's POSITION in the division's ranked list, not its raw Massey rank.
-- The source ranks have gaps (Massey also ranks teams that are not in our files, e.g. NJCAA ranks run to 466 for 414
-- programs), so dividing the raw rank by the number of programs would push programs into worse bands than they belong
-- in. Position = dense_rank over the stored division_rank within each division and season, so the six bands each hold
-- about the same share of the programs in the app. Exactly 10% still belongs to the better band.
-- (Two programs with the very same rank would share a position; the source has no ties.)
-- Same columns as before, so create or replace is allowed.

create or replace view public.program_competitiveness with (security_invoker = true) as
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
           (dense_rank() over (partition by p.division_code, p.division_rank_season order by p.division_rank) * 10.0)
           / nullif(count(*) filter (where p.division_rank is not null) over (partition by p.division_code, p.division_rank_season), 0)
         )
       )::integer
  end as band
from public.college_program p;
