# Launch checklist (WP10 sign-off)

`[x]` = done and checked by an automated test or script (how to re-run it is shown). `[ ]` = needs the administrator. Tick each box and date it before sharing the link with families.

## Security

- [x] Row-level security is on for every table; every view runs with the caller's rights; signed-out users have no access to anything; signed-in users have only the reviewed grants; role, status and ownership columns cannot be written from the app. Re-run: `npm run db:test` (file `70_security_audit`). It fails if a later change loosens any of this.
- [x] Who-can-see-what behaviour (athlete, coordinator, other coordinator, administrator, signed-out) is tested. Re-run: `npm run db:test` (files 20, 30, 50, 60).
- [x] No Supabase service or secret key in the app or the repo: checked on every push by CI (source files) and by `npm run check:bundle` after a build (the finished site). The only key the site holds is the public one.
- [ ] Cloudflare → Settings → Build → Build variables hold only `VITE_SUPABASE_URL` and the **publishable** key (not the secret key). Add `&& npm run check:bundle` to the build command so a bad build cannot deploy.
- [ ] Supabase → Project Settings → API (Data API): exposed schemas are `public` only (never `private` or `auth`).
- [ ] Supabase Auth settings applied as in `supabase/auth-settings.md`: Confirm email **off**, minimum password 8, anonymous sign-ins off, Site URL and the `/reset-password` redirect set to the live address.
- [ ] Password reset works end to end (Resend domain verified, SMTP saved in Supabase, a real reset email received and the link opens the app's reset page).
- [ ] The shared sign-up code is set, and a new sign-up with a wrong code is refused.
- [ ] The Resend key and database password exist only in their own dashboards (not in chat, files or the repo).

## Backups and recovery

- [x] Export and restore rehearsal built and proved on DEV: `npm run backup:data`, then `npm run backup:check -- backups/<folder>`. The first rehearsal restored all 24 tables identically; a deliberately damaged copy was detected.
- [ ] Take a fresh export just before launch, copy it to encrypted storage, and run the rehearsal on it (PASSED).
- [ ] Put a weekly reminder in your calendar for the backup and the 10-minute log look (see the runbook).
- [ ] Optional but recommended: a full restore test into a scratch Supabase project (the runbook's disaster steps), to prove the part the rehearsal cannot: signing up again and restoring by email.

## Monitoring

- [x] A crashed screen shows a plain message and a Reload button instead of a blank page (tested).
- [ ] Decide whether to add online error reporting (for example Sentry's free plan). It is not built: it would send technical details of every error to an outside service, so it is your call. Without it, errors are found in the browser console and in the Supabase logs during the weekly look.
- [ ] Do the first weekly look at Supabase logs now, so you know what normal looks like.

## Quality

- [x] Accessibility baseline: 28 automated checks (labels, roles, landmarks, ids, form errors) over every main screen for families and staff. Re-run: `cd app && npm test`.
- [x] Colour contrast measured: every text and background pair in use passes WCAG AA (lowest 6.1:1; links and buttons 10:1).
- [x] Layout has no fixed widths; the page is built for 360px; main buttons and inputs are 44px tall. The built site is split so only staff download the staff screens.
- [ ] Hand pass on a real phone (iPhone Safari and Android Chrome) and keyboard pass on a computer, using the steps at the end of the runbook. Note anything found.
- [ ] Two or three friendly families try sign-up to first logged activity on their own phones, without help.

## Data and operations

- [x] Admin scripts for promoting staff, assigning, disabling, exporting, deleting and reading history, with a script check. Re-run: `npm run admin:check`.
- [ ] Coordinators promoted and assigned their athletes (scripts 01 and 03); each has signed in once and seen the roster.
- [ ] A 30-minute briefing with the coordinators using `guides/COORDINATOR-GUIDE.md`; each makes one real college correction in week one.
- [ ] The family guide (`guides/FAMILY-GUIDE.md`) is sent with the link.
- [ ] Decide what to do with the test accounts and test colleges' data (delete with script 06, or keep as demo accounts).

## Freeze (from launch day)

- [ ] Write the launch date here: ________. From that day: no database resets, no edits to applied migrations, schema changes only by the steps in the runbook (backup first, dry run, push, test).
- [ ] `main` stays deployable. Fixes go in small commits; each push redeploys the site.
