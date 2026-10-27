-- CREATE A TEAM. Families choose their team when they create their profile (the choice shows once there is
-- more than one team). Edit the values, run the whole script.

do $$
declare
  v_name   text := 'TEAM_NAME';            -- for example 'Iowa Rockets 17R'
  v_grad   integer := 2028;                -- graduation year of the age group, or null
  v_season text := '2026-27';
  v_level  text := null;                   -- for example '17R'
  v_coach  text := null;                   -- head coach name, or null
begin
  if v_name = 'TEAM_NAME' or btrim(v_name) = '' then
    raise exception 'Edit the team name first.';
  end if;
  if exists (select 1 from public.team where name = btrim(v_name) and season_label = v_season) then
    raise exception 'The team "%" already exists for %.', v_name, v_season;
  end if;
  insert into public.team (club_id, name, grad_year_group, season_label, level, head_coach_name)
  select c.id, btrim(v_name), v_grad, v_season, v_level, v_coach from public.club c order by c.created_at limit 1;
end;
$$;

select t.name, t.grad_year_group, t.season_label, t.active, (select count(*) from public.athlete a where a.team_id = t.id) as athletes
from public.team t
order by t.name;
