# Rockets College Recruiting: MVP Implementation Plan

*Planning only. No code. Draft 1, 2026-10-26. Builds on* `CollegeRecruiting-app-PLAN.md`, `-MVP-DETAIL.md` (Section 12 = pilot scope, which wins where docs differ), `-DATA-MODEL-RLS.md`, and the enriched files in `CollegeInfo\`.

**What "done" means:** the Rockets pilot (about 12 athletes, 2 coordinators, 1 team, 4-6 weeks) runs in the **DEV** Supabase project, the RLS test plan passes before any family signs up, and the success measures in MVP-DETAIL 12.6 can be read from Supabase.

---

## 1. Summary


| Item               | Plan                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape of the build | A mobile-first web app (installable PWA shell, no push) that talks straight to Supabase. **No custom server code for the pilot**: security is in Postgres (RLS, triggers), sign-in is Supabase Auth, admin chores are saved SQL in the Supabase dashboard. |
| Work packages      | 12 (WP0-WP11), grouped into 5 milestones.                                                                                                                                                                                                                  |
| Effort (rough)     | About 55 focused build days, **10-12 calendar weeks** for one full-time builder working with Claude Code; the college-data work (WP4) can overlap the app shell (WP5). Matches the 10-12 weeks in PLAN Section 5. Re-estimate after WP2.                   |
| Longest path       | Decisions (WP0) -> schema (WP2) -> RLS and tests (WP3) -> any screen that reads athlete data -> staff area -> dry run.                                                                                                                                     |
| Hard gate          | No family signs up until the RLS test plan (DATA-MODEL 8.5) passes against DEV.                                                                                                                                                                            |




### Milestones


| #   | Milestone                | Work packages      | Exit test                                                                                                               |
| --- | ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| M1  | **Ready to build**       | WP0, WP1           | Decisions made, repo and both Supabase projects exist, a blank migration applies cleanly.                               |
| M2  | **Secure data layer**    | WP2, WP3, WP4      | Schema and RLS tests pass; 1,662 colleges and their coaches load; competitiveness bands compute.                        |
| M3  | **Athlete can use it**   | WP5, WP6, WP7, WP8 | A test athlete signs up, fills profile and preferences, finds colleges, builds a list, logs activity, sets a next step. |
| M4  | **Coordinator can help** | WP9                | A test coordinator sees only assigned athletes, edits their data and a college record; edits are audited and labelled.  |
| M5  | **Pilot**                | WP10, WP11         | Hardening checklist done, dry run clean, families onboarded.                                                            |


---



## 2. Decisions to settle first (WP0)

Most are already in the docs as open items. None needs code, but several block the build.


| #   | Decision                                       | Recommendation                                                                                                                                                                                                                                   | Blocks            | Answer                                                                                                                                                                               |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | **Front-end stack**                            | React + TypeScript + Vite, Tailwind, React Router, TanStack Query, react-hook-form + zod, `supabase-js`. Static hosting (Cloudflare Pages, Netlify or Vercel). Chosen because there is no server code, so a single-page app is the simplest fit. | WP1               | React + TypeScript + Vite, Tailwind, React Router, TanStack Query, react-hook-form + zod, `supabase-js`. Static hosting on Cloudflare Pages.                                         |
| T2  | **Local development database**                 | Run Supabase locally (CLI + Docker) so the DEV project is not used as a scratchpad. If Docker is not an option, DEV is scratch until the freeze date in WP10, and migrations are still the only way to change it.                                | WP1               | Do not use docker.                                                                                                                                                                   |
| P1  | Carry pilot accounts to PROD, or reset?        | **Reset** (simplest). Tell families the pilot data will not move.                                                                                                                                                                                | Before recruiting | Agreed. Reset before Prod.                                                                                                                                                           |
| P2  | Email vs username sign-in                      | **Email sign-in** for the pilot (no server function). Username later.                                                                                                                                                                            | WP5               | Okay to use email address as the sign-in.                                                                                                                                            |
| P3  | Shared pilot code on sign-up?                  | Private URL + CAPTCHA + email confirmation; add a code only if the URL leaks.                                                                                                                                                                    | WP5               | Shared pilot code. No captcha. No email confirmation.                                                                                                                                |
| P4  | DEV plan: upgrade or weekly exports?           | **Upgrade DEV for the pilot** (backups, no idle pause, session settings). Real minors' data in a free project with no backups is the main avoidable risk.                                                                                        | WP10              | Backups will be manual.                                                                                                                                                              |
| P5  | Which team and which two coordinators?         | Needed to build assignments and to schedule training.                                                                                                                                                                                            | WP9               | Team: Iowa Rockets 16R. Coordinator: [David.Rodgers.vb@gmail.com](mailto:David.Rodgers.vb@gmail.com). [MoriaSlabaugh@gmail.com](mailto:moriaslabaugh@gmail.com)                      |
| S1  | **SMTP provider**                              | Pick one (Resend, Postmark, SendGrid, etc.) and verify a sending domain. The built-in Supabase mailer is test-grade. The verification email is the first thing a family sees.                                                                    | WP5               | Use Resend.                                                                                                                                                                          |
| S2  | One-line notice + checkbox at sign-up          | Yes: a single acknowledgement stored in `app_user` (no consent tables). Wording from you.                                                                                                                                                        | WP5               | Accept recommendation. Consent wording: I acknowledge providing athlete and personal information will be used by Iowa Rockets and necessary data can be shared with college coaches. |
| S3  | Siblings                                       | Require a different email per athlete (plus-addressing works). Say so on the sign-up page.                                                                                                                                                       | WP5               | Siblings will need to use 2 different email addresses.                                                                                                                               |
| S4  | How coordinators get linked to athletes        | **Admin assigns in the dashboard** (athlete self-pick is deferred in MVP 12.5). 12 rows, one SQL script.                                                                                                                                         | WP9               | **Admin assigns in the dashboard**                                                                                                                                                   |
| S5  | Distance, size and major filters in the pilot? | **Include them.** The enrichment is done; size, setting, selectivity and major are plain filters, and distance is one ZIP lookup plus a distance function. MVP 12.3 currently says "Later" and needs updating.                                   | WP7               | Include; size, setting, selectivity and major are plain filters. Do not include distance in pilot.                                                                                   |
| S6  | Load NJCAA?                                    | Files are ready (414 rows). Recommend **load but hide behind a division filter default** so coordinators can switch it on; NJCAA coach data is only about 6% filled. Or skip, as MVP 12.3 says.                                                  | WP4               | Okay to include njcaa in the pilot.                                                                                                                                                  |
| S7  | Registered visibility of coach emails          | Any registered user sees all college coach emails (open sign-up). Accept, since the data is from public staff pages.                                                                                                                             | WP3               | Accept recommendation.                                                                                                                                                               |




---



## 3. Work packages

Effort is focused build days (rough). **AC** = acceptance criteria.

### WP0 Decisions and housekeeping (about 3 days, mostly waiting on you)

- Settle Section 2 above. - DONE
- Update MVP-DETAIL Section 12.3 (new filters, 1,662 colleges, UNITIDs corrected) and DATA-MODEL Section 1 and 9 (enrichment done, new columns, three owner-assigned campus ids that borrow parent data, `college_major` and `zip_location` tables). - DONE 2026-10-26 (also records P1-P5 answers, shared pilot code with no CAPTCHA or email confirmation, no distance filter, NJCAA included).
- Confirm sign-up notice wording (S2). - DONE
- **AC:** every row in Section 2 has an answer; docs agree with each other.



### WP1 Foundation (2 days)

- Git repository with this layout: `supabase/migrations`, `supabase/tests`, `supabase/seed`, `data/` (cleaned college files), `app/`, `docs/`. - DONE
- Create the **DEV** and **PROD** Supabase projects; link the CLI. (No local stack: T2 = no Docker.) - Projects DONE; CLI installed and `supabase/` initialised; DEV is linked and the baseline migration is applied. **WP1 complete.**
  - Dev is:  RocketsDev ([https://ewqocjaurrkamkhhwgll.supabase.co](https://ewqocjaurrkamkhhwgll.supabase.co))
  - Prod is:  Rockets College Recruiting ([https://ivpewjtiwslpjlkfawlt.supabase.co](https://ivpewjtiwslpjlkfawlt.supabase.co))
- App skeleton: build, lint, type-check, environment files (public key only; **the service key never goes in the app or the repo**). - DONE (`app/`; typecheck, lint, 4 tests and build pass).
- CI: type-check, lint, tests, build on every push, plus guardrails (no service key in the app, no committed env files, migration file names). - DONE in `.github/workflows/ci.yml`; first run happens on the next push. **SQL tests are not in CI** (no local database); run `npm run db:test` against DEV by hand (a Docker-free runner, `scripts/db-test.mjs`).
- Branch rule: schema changes only via migration files. - DONE (stated in `README.md`; enable GitHub branch protection on `main` if you want it enforced).
- **AC:** an empty migration applies to DEV (met: `20261026120000` is on both sides in `migration list`; the pgTAP smoke test passes on DEV via `npm run db:test`); the app builds and shows a signed-out page (met); secrets are in a password manager, not git.



### WP2 Database schema (5 days)

Follows DATA-MODEL Section 10, one migration per step:

1. Extensions, enums, lookup tables, `app_setting`.
2. `club`, `team`, `app_user`, `staff_profile`, `staff_team`, sign-up trigger, helper functions.
3. `conference`, `college`, `college_program`, `college_coach`, `college_major`, `zip_location`, competitiveness-band view.
4. `athlete`, `athlete_athletic`, `athlete_academic`, `athlete_preference` and child tables, `athlete_staff_assignment`.
5. `athlete_college`, `activity_entry`, `next_step`, with the 30-college cap, one-open-step index, stage-change system entries, and trigger-set authorship.
6. `change_history` and audit triggers (athlete tables and master college tables).
7. Views, all `security_invoker`: `program_search`, `my_list`, `next_steps_due`, `athlete_completeness`, `staff_roster`.

Pilot cuts from DATA-MODEL: skip `custom_college`, `correction_report`, athlete-chosen coordinator and the optimistic-concurrency version column (MVP 12.5). Keep the audit triggers.

- **AC:** `supabase db reset` rebuilds the whole schema from migrations (not possible without Docker; instead every migration is first run in a rolled-back transaction with `npm run db:dryrun:tests`); constraint tests (bad stage, 31st college, second open next step, age 14-18, direction required) fail as designed.

**WP2 status: DONE 2026-10-26.** Seven migrations (`20261026130000` to `20261026136000`) are applied to DEV: 32 tables and 6 views, row-level security on every table (no policies yet, so default deny), all views `security_invoker`. 25 database tests pass on DEV (`npm run db:test`), including the AC cases. Notes:
- **Shared pilot code** is enforced in the database (trigger on `auth.users`, code kept in `private.secret_setting`; fails closed until you set one). Set it in the dashboard SQL editor: `insert into private.secret_setting (key, value) values ('signup_code', 'THE-CODE') on conflict (key) do update set value = excluded.value;` The sign-up form sends `{ pilot_code, acknowledged: true, display_name }` as user metadata. Checked live on DEV: a sign-up with no code set fails with HTTP 500 and the message "Invalid sign-up code" (the acknowledgement error text is "The acknowledgement must be accepted"), so WP5 can show the database's message.
- **Seeded:** club (Iowa Rockets), team (Iowa Rockets 16R), 5 divisions, 5 positions, 25 major categories, 12 activity types, 8 next-step types, 52 states, 5 settings.
- **Bulk loads** (WP4) can skip the audit trigger with `set local app.skip_audit = '1'`.
- **Band rule** (D6) is in `program_competitiveness` (migration `20261026137000`): a program's position in its division's ranked list x 10 / number of ranked programs, rounded up, capped at 6; exactly 10% is band 1. The owner filled every Massey rank (no blanks); the raw numbers still skip values, which the position-based rule ignores. The CSVs were re-saved in Excel, which dropped leading zeros from 122 ZIP codes; they were restored.
- **Found by the Supabase advisor, for WP3:** `public.rls_auto_enable()` (created by Supabase, not by us) can be called by anonymous and signed-in users through the API; revoke execute from `anon` and `authenticated` in the WP3 migration.
- Not built, per MVP 12.5: `custom_college`, `correction_report`, the `version` columns, `change_history_display`.



### WP3 Row-level security and the test suite (4 days) **gate**

- Helper functions in a private schema; policies per DATA-MODEL 8.3, per action, with `WITH CHECK`.
- Column-level grants so users cannot change `role`, `status`, `user_id`.
- Automated SQL tests (pgTAP via `supabase test db`) for every item in 8.5, plus: views leak nothing, anon gets nothing, disabled user gets nothing, staff cannot self-assign.
- Run the same suite against DEV once; save the result.
- **AC:** all tests green locally and on DEV. Any new table or view must come with a test before it merges.



**WP3 status: DONE 2026-10-26** (migration `20261026140000_rls_policies_and_grants.sql`; tests `20_rls.test.sql` and `helpers.sql`).
- **44 database tests pass on DEV** (`npm run db:test`), covering every case in DATA-MODEL 8.5: athlete A cannot read, insert, update or re-point anything of athlete B (including by changing `athlete_id`); staff see and edit only assigned athletes and cannot assign themselves; nobody can change their own role, status or login id; athletes cannot forge staff/system labels; nobody deletes through the app; system entries are immutable; a disabled account sees nothing; a stranger with a new login sees only the shared college data; anonymous gets nothing, including the views; private coach contacts are visible only to the athlete, their assigned staff and admin; staff edits to shared college data are stamped and audited; change history shows athletes only what staff did.
- **Mutation check:** weakening two policies on purpose made 7 test functions fail, so the suite does catch regressions.
- **Live check against the DEV web API:** signed-out requests to tables, views and the `rls_auto_enable` function are refused (401 / permission denied). The Supabase advisor reports no issues.
- **Bug the tests found:** `college_program` had no read grant; fixed in the same migration before it was applied.
- **Pilot decisions:** no app-side write policies for lookups, club/team, staff profiles, assignments or the ZIP table (the dashboard does those); no DELETE through the app except an athlete's own guardians, videos, majors, target divisions and private coach contacts.
- **Test tooling:** tests run as real database roles using `tests.start_as()`; `supabase/tests/helpers.sql` is added in front of every test file by the runner. Every new table, view or policy from here on needs a test.

### WP4 College data load (4 days; can overlap WP5)


| Step              | Detail                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging           | Load the five CSVs as-is into staging tables. Skip the "do not import" columns.                                                                                                                                                          |
| `college`         | One row per UNITID (1,662, all unique now): name, city, state, ZIP, lat/long, website, net-price URL, control, setting, enrollment, tuition, admit rate, selectivity. Three rows carry parent-institution data (see CollegeInfo README). |
| `college_program` | One per file row: division, conference, Massey rank to `division_rank` within division, status. Tier column ignored (D6 uses percentile bands).                                                                                          |
| `college_coach`   | Unpivot head / assistant / recruiting-coordinator columns into rows with title, name, email; `last_verified_on` = load date, source = "provided CSV, Oct 2026". Skip blanks.                                                             |
| Lookups           | `division`, `conference` (normalise spelling), `major_category` (25), `college_major` (26,351 rows), `zip_location` (33,144).                                                                                                            |
| Checks            | Row counts match the files; every program has a college; no duplicate emails per program; bands: unranked programs get none; boundary rule at exactly 10% is documented and tested.                                                      |


- **AC:** counts reconcile with the CSVs; spot-check 20 colleges against the source; `program_search` returns results in under 2 seconds with the full set; the load script is re-runnable in an empty database.



**WP4 status: DONE 2026-10-26** (`scripts/load-colleges.mjs`; report in `CollegeInfo\LOAD-REPORT.md`). Loaded into DEV: 1,662 colleges and programs, 234 conferences, 2,043 coach contacts, 26,351 college-to-major links and 33,144 ZIP locations. I used one script (clean, validate, load, verify) instead of staging tables.
- **Checks, all passing:** row counts match the CSVs; every program has a college; at most one primary contact per program and every program with coaches has one; the bulk load wrote no audit rows; every division has all six bands (about 10% each, the last band 50%); 20 random colleges match their CSV rows field by field; `program_search` over all programs runs in about 30-110 ms. A `--reset` reload was run to prove the load can be repeated.
- **Cleaning applied (59 items, listed in the report):** one conference spelling merged ("Big 8 Conference"); 4 malformed coach emails fixed (first address kept, stray spaces removed); all emails lower-cased; 22 programs where one person filled two coach slots loaded once; alumni class-year tags ("'15") removed from coach names; one garbled campus name repaired (Itawamba - Fulton).
- **Rules used:** the primary recruiting contact is the recruiting coordinator if there is one, otherwise the head coach. College control comes from IPEDS (it disagrees with the file's Public/Private label on 3 rows). Rank season label is "Massey CSV, Oct 2026" (the real season is not in the files).
- **Good to know:** 636 programs have no coach contact (mostly NJCAA and NAIA), as expected from the source. 21 programs have coaches sharing one team inbox, so email is not unique. Coach edits by staff will refresh `last_verified_on`.
- **Safety:** the script refuses to run unless the linked project is DEV, refuses to load into non-empty tables without `--reset`, and refuses `--reset` once any athlete has a list. `npm run load:colleges:verify` re-checks what is loaded against the CSVs.
- **Tests:** the security tests now scope their counts to their own rows (ids 900000-999999) so real data does not disturb them; 44 tests pass with the data loaded.

### WP5 App shell and authentication (4 days)

- Layout: athlete bottom bar (Home, My List, Find, Profile, More), staff top bar, minimal admin-free shell; usable at 360px.
- Sign up (**shared pilot code, enforced on the server; no CAPTCHA, no email confirmation**; acknowledgement checkbox), sign in, forgot/reset password, sign out, change password, session-expired and not-found pages. Design choice needed first: how the code is checked without custom server code (DATA-MODEL Section 9, item 13).
- Route guard by role (from `app_user`, not the token's editable data); first-login routing: athlete with no athlete row goes to the "create profile" step.
- Real SMTP wired in; email templates reworded.
- **AC:** a new family completes sign-up and verification from a phone; a disabled user is bounced; wrong-password message does not reveal whether the email exists.



### WP6 Athlete profile and preferences (6 days)

- A2a Personal and guardians (up to 2, exactly one primary), A2b Athletic, A2c Academics, A2d Highlights and links (up to 3 videos), A3 Preferences (divisions with top choice / open-to flag, competitiveness bands multi-select, region, distance, size, public/private, setting, majors, cost need, deal-breakers).
- Completeness % from `athlete_completeness`.
- Forms save per section, validate with the same rules as the database, and show database errors readably.
- Every screen takes an athlete id so WP9 reuses it unchanged.
- **AC:** each tab saves and reloads; required fields enforced; age outside 14-18 rejected; completeness bar matches the view.



### WP7 Find Colleges and College detail (5 days; +2 for the extra filters per S5)

- A4: results list with name search and filters (division, state, conference, public/private, competitiveness band; plus size, setting, selectivity, major and distance from home ZIP). Paging or infinite scroll; sorted sensibly.
- A5: facts, program links, coach contacts (tap to copy / email / call), last-verified date, "Add to My List".
- **AC:** each filter returns the right set on a known sample; search under 2 seconds; no "Report a correction" button in the pilot.



### WP8 My College List, activity and next steps (8 days)

- A7 list (priority and stage filters, sort); A8 hub with Overview, Activity, Contacts tabs; A9 Log activity; A10 Set / edit / complete next step; A1 Home (overdue and due-this-week steps, silent colleges, recent activity).
- Rules visible to the user: cap of 30 with a clear message; stage and priority changes write a system entry; completing a step offers "log it?"; one open step per college.
- **AC:** end-to-end athlete walkthrough passes (Section 5); system entries cannot be edited; dates compare in America/Chicago.



### WP9 Club staff area (5 days)

- S1 Roster (name, team, grad year, profile %, # colleges, last activity, # overdue), from `staff_roster`.
- S2 Athlete view: the athlete screens with a banner "Editing as Coach X" and the athlete id from the URL.
- S3 Find Colleges, plus the **edit college / edit coach** form (D4), updating `last_verified_on` and `verified_by`.
- Admin SQL scripts (saved in the repo and the dashboard): promote a user to staff, create team, assign athletes to coordinators, disable account, export an athlete, delete an athlete, list change history.
- **AC:** staff A sees only assigned athletes; edits show the staff member's name; college edits appear in `change_history` with no athlete id.



### WP10 Hardening and operations (4 days)


| Area       | Work                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Security   | Re-run the RLS suite on DEV; review grants; confirm RLS is on for every public table and view; confirm service key is not in the app bundle. |
| Backups    | Backups on (P4), one **restore test** into a scratch project.                                                                                |
| Monitoring | Email alert or weekly look at Supabase auth/API logs; error reporting in the app (free tier).                                                |
| Quality    | 360px layout pass on iPhone Safari and Android Chrome; keyboard and contrast baseline; empty and error states.                               |
| Data       | Weekly export job or script; checklist for changing data after launch.                                                                       |
| Freeze     | From launch, schema changes only via reviewed migrations; no resets of DEV.                                                                  |
| Docs       | One-page family guide, one-page coordinator guide, runbook (promote staff, reset, delete, restore).                                          |


- **AC:** checklist signed off; restore tested; guides written.



### WP11 Dry run, launch, pilot (3 days build time + 4-6 weeks pilot)

- **Week 0:** 2-3 friendly test accounts go through everything on real phones; fix findings; assign coordinators; delete test data or keep as demo accounts.
- **Launch:** share the private URL with the pilot group; coordinators briefed (30 minutes).
- **Weekly:** 15-minute check-in; log requests; review Supabase logs for errors and any cross-athlete access.
- **Week 4:** read the success measures (MVP 12.6) and rank requested features; decide go / change / stop and the PROD plan (P1).

---



## 4. Testing strategy


| Layer           | What                                                                                          | Tool                                         |
| --------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Database rules  | Constraints, triggers, views                                                                  | SQL tests in the repo                        |
| Security        | Every RLS case in DATA-MODEL 8.5, run in CI and on DEV                                        | pgTAP                                        |
| Forms and logic | Validation, completeness, date handling (America/Chicago)                                     | Unit tests                                   |
| Key journeys    | Sign up -> profile -> list -> log -> next step; staff edit; staff scoped to assigned athletes | Playwright end-to-end against local Supabase |
| Real devices    | 360px phone pass, slow-network pass                                                           | Manual, WP10                                 |
| Data            | Load reconciliation and 20-college spot check                                                 | Script + manual                              |


Regression rule: every bug found in the pilot gets a test before it is fixed.

---



## 5. Walkthroughs used as acceptance tests

1. **Athlete:** sign up from a phone, confirm email, enter basics, set preferences, find D-II colleges within 300 miles of home with a major of interest, add 5 to the list, log an email to one coach, set a next step, see it on Home.
2. **Coordinator:** sign in, open roster, see only assigned athletes, open one, fix a GPA, add a next step "Send updated video", correct a coach email on a college record.
3. **Athlete again:** sees the coordinator's name on the edit; cannot see any other athlete.
4. **Attack checks:** change `athlete_id` in a request; read another athlete's list by id; promote self to staff; write a "staff" activity entry; all must fail.

---



## 6. Risks and mitigations


| Risk                                                   | Mitigation                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Real minors' data in DEV with no backups               | P4: upgrade DEV; restore test in WP10; weekly export as fallback                                                               |
| RLS mistake exposes athletes                           | WP3 gate; tests in CI; `security_invoker` views; no new table without a test                                                   |
| Verification email lands in spam or is rate-limited    | Real SMTP with a verified domain (S1); test with Gmail, Outlook, school domains in the dry run                                 |
| College data wrong or stale (coach emails, campus ids) | Last-verified dates; staff can edit; three owner-assigned campus ids and the multi-campus coordinates are known approximations |
| Coordinators do not adopt it                           | Involve both in WP9 review; 30-minute briefing; ask for one real record edit in week 1                                         |
| Scope creep from pilot feedback                        | Requests go to a ranked list at week 4, not into the build                                                                     |
| Schema change after real data exists                   | Migration-only changes, additive where possible, backup before each                                                            |
| Single builder / key-person                            | Everything in the repo; runbook in WP10                                                                                        |
| Sign-up URL leaks                                      | CAPTCHA and email confirmation; shared pilot code available as a switch (P3)                                                   |


---



## 7. Suggested calendar (one full-time builder; adjust to your pace)


| Weeks | Work                                 |
| ----- | ------------------------------------ |
| 1     | WP0 decisions, WP1 foundation        |
| 2-3   | WP2 schema                           |
| 3-4   | WP3 RLS and tests; start WP4 load    |
| 4-5   | Finish WP4; WP5 shell and auth       |
| 5-6   | WP6 profile and preferences          |
| 7     | WP7 Find Colleges and detail         |
| 8-9   | WP8 list, activity, next steps, Home |
| 10    | WP9 staff area                       |
| 11    | WP10 hardening                       |
| 12    | WP11 dry run, then launch            |
| 13-18 | Pilot (4-6 weeks)                    |


---



## 8. What I need from you

1. Answers to Section 2 (shortest path: accept my recommendations for T1, T2, P1-P4, S2-S7, and give me P5 and the sign-up notice wording).
2. A Supabase **DEV** and **PROD** project each (or confirm I should guide you through creating them), and the DEV plan decision.
3. An SMTP provider and a domain or sender address you control.
4. The pilot team, the two coordinators, and 2-3 test families.
5. Permission to update MVP-DETAIL 12.3 and the DATA-MODEL doc (WP0).

When you say go, the first coding step is WP1 only.