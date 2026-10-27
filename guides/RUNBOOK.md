# Runbook: running the pilot

For the club administrator. Plain steps for the jobs that come up. Nothing here needs code, except where a command is shown (run it in a terminal at the repo root).

## Where things live

| Thing | Where |
|---|---|
| The app | Cloudflare (Workers & Pages, project `devcollegerecruiting`), built from the `main` branch on GitHub |
| The database and logins | Supabase project **RocketsDev** (`ewqocjaurrkamkhhwgll`) = DEV, where the pilot runs. PROD (`ivpewjtiwslpjlkfawlt`) stays empty until the pilot is judged a success |
| Password-reset emails | Resend, connected in Supabase → Authentication → Emails → SMTP Settings (see `supabase/auth-settings.md`) |
| Admin jobs | SQL scripts in `supabase/admin/` (read its README), run in the Supabase SQL Editor |
| Backups | `backups/` folder on the administrator's computer (git-ignored, never shared) |

Secrets: the Resend key lives only in the Supabase dashboard. The Supabase service/secret key is never put in the app, in GitHub, in Cloudflare, or in chat. The only key in the app is the public (publishable) one.

## Everyday jobs

| Job | How |
|---|---|
| Add a family | Give them the site link and the sign-up code. Nothing else to do |
| Change the sign-up code | SQL Editor: `insert into private.secret_setting (key, value) values ('signup_code', 'NEW-CODE') on conflict (key) do update set value = excluded.value;` (the code is not case sensitive). Tell new families the new code; existing accounts are not affected |
| Make someone a coordinator | They sign up, then run `supabase/admin/01_promote_user_to_staff.sql` |
| Give a coordinator athletes | `03_assign_athletes_to_coordinator.sql` (and the end of that file to remove one) |
| Add a team | `02_create_team.sql` |
| Switch an account off or on | `04_disable_or_enable_account.sql` |
| Give a family a copy of their data | `05_export_athlete.sql`, send only to the parent or guardian |
| Delete a family's data | Export first (05), then `06_delete_athlete.sql` (preview, then confirm). It also removes their history |
| See who changed what | `07_list_change_history.sql`, or a coordinator's **History** tab inside the athlete |
| Who is who | `00_who_is_who.sql` |
| A family forgot their password | They use *Forgot password*. If email is not working, they cannot reset it themselves: Supabase → Authentication → Users → the person → send a recovery link or set a new password, and tell them privately |

## Backups (decision P4: manual)

The free Supabase plan has no automatic backups, so you take them.

- **Weekly, and before any database change:** `npm run backup:data`. It writes a dated folder under `backups/` (24 tables, no passwords). Copy it to encrypted storage (BitLocker drive, encrypted cloud folder) and delete old copies after 8 weeks.
- **Monthly, and after any big change:** prove the latest backup can be restored: `npm run backup:check -- backups/<folder>`. It restores the data into a scratch copy and a rolled-back transaction on DEV, compares every table with the live data, and prints PASSED or FAILED. It changes nothing. A FAILED result means the backup or the tooling is not trustworthy: stop and ask for help before relying on it.
- The files contain real data about minors. Never email them, never put them in chat or GitHub, never leave them on a shared computer.

### If the database is lost or damaged

1. Decide whether it is one bad record (use the History view and fix the record by hand) or the whole project.
2. For a lost project: create a new Supabase project, link it (`npm run db:link:dev` edited for the new project ref), run `npm run db:push` to build the tables, and apply the Auth settings and SMTP from `supabase/auth-settings.md`. Set the sign-up code. **Do not** run the college loader; the backup has the college data with its ids.
3. Every family and coordinator signs up again with the **same email** (the code is needed). Passwords are not in backups.
4. Dry run: `npm run backup:restore -- backups/<folder> --project <new project ref>`. It lists any email that has not signed up yet. When none are missing, run it again with `--yes`. If it stops, fix the cause and run the same command again; it is safe to repeat.
5. Point the Cloudflare variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) at the new project, retry the build, and update the Supabase URL settings. Check sign-in, one athlete's list and one college page.
6. Tell families what happened and what, if anything, was lost since the last backup.

## Changing the database after launch (the freeze)

From launch, DEV holds real data: **no resets, no editing applied migrations.** Every change is a new file in `supabase/migrations/`:

1. `npm run backup:data` (keep the folder until the change has proved itself).
2. Write the migration (`npm run db:new -- short_name`). Prefer additive changes (new column with a default, new table). Add or update a database test for it.
3. `npm run db:dryrun:tests`, then `npm run db:push`, then `npm run db:test` and `npm run backup:check -- <new backup>` if the change touches a backed-up table.
4. Merge the matching app change; Cloudflare redeploys on every push to `main`. Deploy the database change first when the app needs it.
5. If the security audit (`70_security_audit`) fails, a table, view or grant changed shape. Fix it, or update the audit lists in the same change if it was deliberate.

## Deploying the app

- Every push to `main` builds and deploys automatically (Cloudflare → project → Deployments shows each build).
- The build runs `npm run build`. Add `&& npm run check:bundle` to the Cloudflare build command to stop a deploy if a secret key ever ends up in the site (CI already checks this on every push).
- **Roll back:** Deployments → pick the last good build → roll back to it. Or revert the commit on GitHub and let it redeploy.
- Build variables live in Cloudflare → Settings → Build → Build variables and secrets. Changing them needs a new build.

## Weekly look (10 minutes)

1. Supabase → **Logs** (Auth, API and Postgres): scan the last 7 days for spikes of failed sign-ins, repeated errors (status 500), and "permission denied" or row-level-security errors from the app. A handful is normal; a burst from one person or one hour is worth a question.
2. Supabase → **Reports/Usage**: the database is far below its free limits (about 12 families). Note the size.
3. Cloudflare → Deployments: the latest build is green.
4. Run `07_list_change_history.sql` (part B) to see the last 30 days of coordinator edits to college data.
5. Run `08_pilot_measures.sql` and read the safety rows (they must say ok) and the headline numbers. The weekly check-in and the week-4 decision are in `PILOT-PLAYBOOK.md`.
6. Take the weekly backup.

Free Supabase projects **pause after a week with no activity**. During the pilot there is daily use, but after the pilot ends or over a long quiet break, open the project and unpause it before families need it.

## If something looks wrong

| Situation | Do this |
|---|---|
| Someone may have seen another family's data | Switch the accounts involved off (04), note times and what was seen, run `07_list_change_history.sql`, check Supabase logs for the period, and ask for help. The database tests (`npm run db:test`) prove the access rules; a leak would mean a bug to fix |
| A password or key was exposed (chat, email, screenshot) | Rotate it now: Resend key (Resend dashboard, then Supabase SMTP settings); Supabase keys (Project Settings → API Keys, create a new publishable key and update Cloudflare); database password (Project Settings → Database). Never paste the new value anywhere but the dashboard that needs it |
| A coordinator or family member left the club | Switch the account off (04). Delete it later with 06 if asked |
| The site shows "Something went wrong" | Reload; check Cloudflare Deployments for a bad build and roll back; check Supabase status |
| Sign-up fails for a family | Check the code (not case sensitive) and that the acknowledgement box is ticked. Re-enter the code with `insert ... on conflict` above if it was never set |

## Hand checks (not automated)

Before launch, and after any change to screens or colours, on a real phone (Android Chrome and iPhone Safari, 360px wide):

1. Sign up, create a profile, save every tab, add colleges, log an activity, set a next step, sign out and in.
2. Rotate the phone and zoom the text to 200%: nothing is cut off, no sideways scrolling on the pages.
3. Keyboard (computer): Tab through sign-in, a form and a college page; every control is reachable, the focus is visible, Enter submits.
4. A screen reader (VoiceOver or TalkBack) reads the fields' labels and error messages.

Colours were measured against WCAG AA (4.5:1) on 2026-10-26: the lowest ratio in use is 6.1:1 (secondary text on the grey badge), links and buttons are 10:1. Small action buttons (Copy, Edit) are 36 px tall; main buttons and inputs are 44 px.
