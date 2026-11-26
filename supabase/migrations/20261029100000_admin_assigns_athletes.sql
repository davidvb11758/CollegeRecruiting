-- An administrator assigns athletes to coordinators from the app (until now only the dashboard script could).
--
-- Who may do what, through the app:
--   administrator  add an assignment, change its role (main / extra), remove it.
--   everyone else  nothing. Coordinators and athletes still only read the rows that concern them (assignment_select).
-- The columns that say who and whom are fixed once a row exists: to move an athlete, remove the row and add another.
-- The dashboard scripts (supabase/admin/03_*) keep working as before.

-- The rules that cannot be a policy:
--   * only an administrator, checked again here so a future policy change cannot open it up by itself;
--   * the person being assigned is an active coordinator (or administrator) with an active staff profile;
--   * an athlete has one main coordinator: making someone main moves the previous one to extra, in the same statement,
--     so there is never a moment with two (the unique index would refuse it) and nobody has to remember to do it;
--   * assigned_by records who made the assignment; the caller cannot choose it.
create function private.assignment_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    raise exception 'Only an administrator can change assignments' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.app_user u
      join public.staff_profile sp on sp.user_id = u.user_id
      where u.user_id = new.staff_user_id and u.role in ('staff', 'admin') and u.status = 'active' and sp.active
    ) then
      raise exception 'That person is not an active coordinator' using errcode = '23514';
    end if;
    if auth.uid() is not null then
      new.assigned_by := auth.uid();
    end if;
  end if;

  if new.role_on_athlete = 'primary' then
    update public.athlete_staff_assignment s
       set role_on_athlete = 'secondary'
     where s.athlete_id = new.athlete_id and s.role_on_athlete = 'primary' and s.id <> new.id;
  end if;
  return new;
end;
$$;

create trigger assignment_guard before insert or update on public.athlete_staff_assignment
for each row execute function private.assignment_guard();

-- Administrators only. (The trigger above does not fire for a delete, so the delete policy is the whole guard there.)
create policy assignment_insert on public.athlete_staff_assignment for insert to authenticated
  with check ((select private.is_admin()));
create policy assignment_update on public.athlete_staff_assignment for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy assignment_delete on public.athlete_staff_assignment for delete to authenticated
  using ((select private.is_admin()));

-- Only these columns can be supplied: who, whom and the role. assigned_by, assigned_at and the bookkeeping columns cannot.
grant insert (athlete_id, staff_user_id, role_on_athlete) on public.athlete_staff_assignment to authenticated;
grant update (role_on_athlete) on public.athlete_staff_assignment to authenticated;
grant delete on public.athlete_staff_assignment to authenticated;
