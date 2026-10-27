-- DISABLE (or RE-ENABLE) AN ACCOUNT. A disabled person is bounced to the sign-in page and sees nothing: the
-- database treats every request from them as having no access. Nothing is deleted, so you can switch it back on.
-- (To remove a family's data, see 06_delete_athlete.sql instead.)
-- Edit the email and the wanted status (and the email again at the bottom), run the whole script.

do $$
declare
  v_email  text := 'ACCOUNT_EMAIL';
  v_status public.user_status := 'disabled';      -- 'disabled' to switch off, 'active' to switch back on
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));
  if v_user is null then
    raise exception 'No account with the email "%".', v_email;
  end if;
  if v_status = 'disabled' and (select role from public.app_user where user_id = v_user) = 'admin'
     and (select count(*) from public.app_user where role = 'admin' and status = 'active') <= 1 then
    raise exception 'This is the only active administrator. Promote another administrator before disabling this one.';
  end if;
  update public.app_user set status = v_status where user_id = v_user;
  -- Also stop new sign-ins at the sign-in service. 'infinity' bans; null lifts the ban.
  update auth.users set banned_until = case when v_status = 'disabled' then 'infinity'::timestamptz else null end where id = v_user;
end;
$$;

-- Check: put the same email below.
select u.email, au.role, au.status, u.banned_until
from auth.users u join public.app_user au on au.user_id = u.id
where lower(u.email) = lower('ACCOUNT_EMAIL');
