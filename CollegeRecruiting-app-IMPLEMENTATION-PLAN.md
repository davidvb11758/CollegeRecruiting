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

**WP5 status: code DONE 2026-10-26; three owner steps remain before the AC can be tried end to end** (see `supabase/auth-settings.md`). Built in `app/`:
- **Screens:** sign in, sign up (name, email, password twice, pilot code, the acknowledgement checkbox with the WP0 wording), forgot password, reset password (from the email link), change password, sign out, session-ended page, not-found, and a first-login "create your athlete profile" stand-in (the form is WP6).
- **Layout:** athlete bottom bar (Home, My List, Find, Profile, More) and a staff top bar (Roster, Find Colleges, Account). Home, My List, Find, Profile and Roster are stand-ins until WP6-WP9.
- **Access:** role and status come from `app_user` through row-level security, never from the token. The wrong role is sent to its own home. A disabled account (no readable `app_user` row) is signed out with "This account is not active".
- **Messages:** sign-in gives one message for a wrong password or an unknown email. The live server hides the code-check text ("Database error saving new user"), so sign-up shows "Check the sign-up code and try again". Forgot-password gives the same answer for every email.
- **Tests:** 36 app tests (routing and role guards, sign-in, sign-up, forgot and change password, error wording). Mutation-checked: removing the role check makes two tests fail. Live check on DEV confirmed the three failure responses above and that nothing was created.
- **Not yet proven live:** the successful sign-up (needs the pilot code), the reset email (needs Resend), and a phone-sized run.
- **Owner steps:** (1) apply the Auth settings and email template in `supabase/auth-settings.md`; (2) configure Resend SMTP; (3) try a real sign-up with the pilot code (`npm run dev` in `app/`).



### WP6 Athlete profile and preferences (6 days)

- A2a Personal and guardians (up to 2, exactly one primary), A2b Athletic, A2c Academics, A2d Highlights and links (up to 3 videos), A3 Preferences (divisions with top choice / open-to flag, competitiveness bands multi-select, region, distance, size, public/private, setting, majors, cost need, deal-breakers).
- Completeness % from `athlete_completeness`.
- Forms save per section, validate with the same rules as the database, and show database errors readably.
- Every screen takes an athlete id so WP9 reuses it unchanged.
- **AC:** each tab saves and reloads; required fields enforced; age outside 14-18 rejected; completeness bar matches the view.

**WP6 status: code DONE 2026-10-26; waiting for your hands-on test in the browser.** Built in `app/`:
- **First login:** "Create your athlete profile" (first and last name, date of birth, graduation year, home state; the only team is filled in). Age 14-18 is checked in the form and again by the database.
- **Profile (4 tabs):** Personal (identity, contact, up to 2 guardians with one main contact), Athletic, Academics (GPA, tests, eligibility, up to 3 intended majors or "Undecided"), Highlights (up to 3 video links, social handles, profile and film links). Each tab saves on its own and shows "Saved." or a readable error.
- **Preferences** (More tab, "My College Preferences"): a choice per division (not interested / open to / top choice), program levels 1-6 (at least one), playing time, regions, school size, public/private, setting, academics importance, cost, other majors, must-haves, deal-breakers, ideal school.
- **Completeness bar:** read from the `athlete_completeness` view, so it always matches the database.
- **Staff reuse (WP9):** `ProfileScreen` and `PreferencesScreen` take an athlete id.
- **Decisions to know:** (1) the preferences form has **no distance field** (distance is out of the pilot filters; the database column stays); (2) intended majors live on Academics and "other majors I would consider" on Preferences (the two kinds in `athlete_major`); (3) social and profile links sit on the athletic record, so Highlights asks the family to save Athletic first; (4) date of birth can be corrected later (the 14-18 rule applies at creation only, so a senior who turns 19 can still save).
- **Tests:** 99 app tests (schemas and the ranges the database enforces; every tab's save payload; the guardian demote-then-promote order, mutation-checked) and a new database test file `30_profile_saves.test.sql` that runs the same writes as the athlete under row-level security (first login with no RETURNING, upserts, guardian swap, 3-video and 3-major limits, other athletes and unassigned staff blocked). All 50 database checks pass on DEV.
- **Found and fixed on the way:** an old security test assumed an empty database; it now counts only its own test rows.
- **Not yet proven live:** a real athlete saving each tab in the browser (your hands-on test), and a phone-sized run.



### WP7 Find Colleges and College detail (5 days; +2 for the extra filters per S5)

- A4: results list with name search and filters (division, state, conference, public/private, competitiveness band; plus size, setting, selectivity, major and distance from home ZIP). Paging or infinite scroll; sorted sensibly.
- A5: facts, program links, coach contacts (tap to copy / email / call), last-verified date, "Add to My List".
- **AC:** each filter returns the right set on a known sample; search under 2 seconds; no "Report a correction" button in the pilot.

**WP7 status: code DONE 2026-10-26; waiting for your hands-on test.** Built in `app/`, plus migration `20261027100000_program_search_division_sort.sql` (applied to DEV; adds the division order to `program_search` so "Division, best ranked first" sorts D1, D2, D3, NAIA, NJCAA).
- **Find Colleges** (`/find`): search by part of the name (any case; `%` and `_` typed by the family are matched as plain characters), and filters for division, state (any number), conference, public/private, program level 1-6, school size, campus setting, admission selectivity, and major offered. **No distance filter** (WP0). Filters combine with AND and live in the page address, so Back from a college returns to the same search. Sorts: name, division then rank, state. 25 results at a time with "Show more", the count shown, "On My List" badges, and "Match my preferences" (applies divisions, levels, sizes, public/private and setting from the saved preferences). Dropped programs are not shown.
- **College page** (`/find/:id`): school facts (public/private, setting, students, admission and admit rate, tuition), program level and rank, last season, links (program page, questionnaire, camps, college site, cost, social), coach contacts (tap to email or call, Copy button, main recruiting contact marked, former coaches hidden, the athlete's own contacts included, other families' hidden), and the last-verified date. **No "Report a correction"** button.
- **Add to My List:** adds the entry (30-college limit and one-per-college come from the database, with readable messages); an archived entry is restored instead of duplicated; the first add shows the "20 to 30, then narrow to 10 to 15" tip.
- **Staff** (`/staff/find`): same search and college page without the add button or preference matching; WP9 adds the athlete context (`FindScreen` and `CollegeDetailScreen` already take an optional athlete).
- **Tests:** 146 app tests (all filters, sorts, paging, address round-trip, college page, add/restore/full list, staff view; a deliberately broken filter made 6 fail) and `40_find_colleges.test.sql`, which runs the exact filter predicates AS an athlete on an 11-program sample (name, division, state, conference, control, size, setting, selectivity, band, major, AND-combinations, missing facts, sorts, LIKE escaping). All database checks pass on DEV. Search on all 1,662 programs plans at about 50 ms in the database.
- **Also fixed:** each app instance now has its own query cache (a shared cache leaked between tests); failed loads retry once then show "Try again".
- **Not yet proven live:** a real athlete searching and adding in the browser, and a phone-sized run. Contact details are only as good as the loaded data (636 programs have no coach listed; 21 share an inbox).



### WP8 My College List, activity and next steps (8 days)

- A7 list (priority and stage filters, sort); A8 hub with Overview, Activity, Contacts tabs; A9 Log activity; A10 Set / edit / complete next step; A1 Home (overdue and due-this-week steps, silent colleges, recent activity).
- Rules visible to the user: cap of 30 with a clear message; stage and priority changes write a system entry; completing a step offers "log it?"; one open step per college.
- **AC:** end-to-end athlete walkthrough passes (Section 5); system entries cannot be edited; dates compare in America/Chicago.

**WP8 status: code DONE 2026-10-26; waiting for your hands-on test.** No new migration (the tables, rules and views from WP2/WP3 were enough). Built in `app/`:
- **Home** (`/home`): profile percentage with a link to finish it and a prompt to set preferences; **Overdue** and **Due this week** next steps (soonest first, "Overdue by 2 days", "added by your coordinator"), a count of later ones; **No recent contact** (colleges still being pursued with 21+ days quiet, longest first; closed, committed and removed ones left out; the 21 comes from the `silent_days` setting); **Recent activity** (newest real entries with college names and "added by <coordinator>"; automatic and deleted entries left out).
- **My List** (`/list`): priority, stage and "removed" filters, four sorts (priority, longest quiet, next step due, name), "N of 30 colleges", a next-step line on each card, filters kept in the page address, a link to Find Colleges when empty.
- **College page** (`/list/:id`): header (priority, stage, main contact, link to the database record), the **next step card** (Done, Change, Skip, or Set a next step; one open step only), and three tabs.
  - **Overview:** priority, stage, closing reason (required when closed), main coach, questionnaire tick (dated in the club day), "why I like it", notes, and Remove from My List (two taps; history kept; Restore from the page).
  - **Activity:** timeline newest first with a type filter; log, edit and delete (hide) your own entries; automatic entries are labelled and have no buttons; coordinator entries are labelled; direction required for emails, calls, texts and video calls; dates in the future refused; flagging "I need to follow up" offers the next step.
  - **Contacts:** shared coaches plus the athlete's own; tap to email or call, Copy, make or clear the main contact; add, edit and delete your own contacts (private to the athlete and their coordinators).
- **"Log it?"**: marking a step done offers to log it, pre-filled from the step, then offers to set the next step. Skipping a step also offers the next one.
- **Dates** use the Chicago day everywhere (`clubToday`), not the browser's or UTC.
- **Tests:** 209 app tests (63 new: the screens above, sorting, date and time-zone rules; breaking the silent-college rule made a test fail) and `50_list_flow.test.sql` (day buckets in the club day, remove and restore, automatic entries cannot be edited or hidden, coordinator entries labelled staff by the database, own contacts and main coach). 62 database checks pass on DEV.
- **Found and fixed on the way:** a pre-filled pick-list would not show if the list loaded after the form (forms now wait for their lists); older security tests now count only their own rows.
- **Left for later, as scoped:** Add a college not in the database (A6), All Next Steps and All Activity pages (Home and per-college timelines cover them), the "narrow your list" hint.
- **Not yet proven live:** a real athlete walking through the whole flow in the browser, and a phone-sized run.



### WP9 Club staff area (5 days)

- S1 Roster (name, team, grad year, profile %, # colleges, last activity, # overdue), from `staff_roster`.
- S2 Athlete view: the athlete screens with a banner "Editing as Coach X" and the athlete id from the URL.
- S3 Find Colleges, plus the **edit college / edit coach** form (D4), updating `last_verified_on` and `verified_by`.
- Admin SQL scripts (saved in the repo and the dashboard): promote a user to staff, create team, assign athletes to coordinators, disable account, export an athlete, delete an athlete, list change history.
- **AC:** staff A sees only assigned athletes; edits show the staff member's name; college edits appear in `change_history` with no athlete id.

**WP9 status: code DONE 2026-10-26; waiting for your hands-on test with a real coordinator account.** No new migration (the grants, policies, stamping and audit from WP2/WP3 already covered it). Built in `app/`, `supabase/admin/` and `scripts/`:
- **Roster** (`/staff`): one card per athlete from `staff_roster` with team, class, profile %, number of colleges, last activity ("5 days ago") and an "N overdue" badge; search by the start of a name; sort by name, most overdue, longest without activity, least complete profile; the address keeps the search and sort. Who is on the roster is decided only by the database (assigned athletes for a coordinator, everyone for an administrator).
- **Inside an athlete's account** (`/staff/athlete/<id>/...`): a yellow banner, "Editing Pat Player's account as <your name>. Your name is recorded on every change you make", and tabs Home, List, Find, Profile, Preferences, History. These are the athlete's own screens, reused with the athlete's id, so there is one copy of every form. Links inside them stay inside the athlete (a small scope in `lib/scope.ts` adds the address prefix) and the wording changes from "you" to "the athlete/staff". If the athlete is not assigned to the coordinator, the page says "not found, or not assigned to you".
- **History tab:** the athlete's change history (their own edits and the coordinators'), newest first, with coordinators named, and a "staff changes only" filter.
- **Find Colleges inside an athlete** adds colleges to *that* athlete's list and marks the ones already on it. The general **Find Colleges** tab (no athlete) still has no add button.
- **Edit college data (D4):** on any college page, staff and admin get a "Staff tools" panel: edit program page, questionnaire, camps, Instagram, X, last season, college site, cost page and program status (active / needs review / dropped, which hides it from search); **Mark as verified today**; edit or add shared coaches, mark a coach as left (kept, hidden from families), and move the "main recruiting contact" mark (the old mark is cleared first and put back if the save fails). The database stamps who verified and when, and writes every edit to the change history with no athlete id. Athletes never see the panel.
- **Admin SQL scripts** (`supabase/admin/`, with a README): who is who, promote a sign-up to staff/admin, create team, assign athletes to a coordinator (and remove), disable/enable an account, export one athlete as JSON, delete an athlete with their history (preview first, confirmation word required), list change history. Each one fails with a clear message if run unedited. `npm run admin:check` runs all of them on made-up test users inside a rolled-back transaction (26 cases; removing the history purge from the delete script makes a case fail).
- **Tests:** 258 app tests (49 new: roster, sorting, search, banner, links, profile/next-step/add-college writes for the right athlete, history, every college and coach edit, the primary-contact order and its rollback, athletes cannot see the panel; breaking either rule made tests fail) and `60_staff_area.test.sql` (college edits stamped and audited, any coordinator may edit shared data, bad links and statuses refused, main-contact swap order, coordinator work labelled "staff" and visible to the athlete, assignments decide who sees an athlete). 67 database test checks pass on DEV across 7 files.
- **Decisions to know:** (1) a coordinator not assigned to anyone can still edit shared college data (D4 says all Club Staff); (2) only the links, last season and status of a program can be edited, not enrolment, tuition or admission figures (they come from the source files); (3) coaches added by an athlete are private and not part of the staff tools; (4) the Instagram/X fields are links, as loaded.
- **Not yet proven live:** a real coordinator promoted in DEV, assigned an athlete, and editing a college in the browser (your hands-on test), and a phone-sized run. To try it: sign up a second account, run `01_promote_user_to_staff.sql` and `03_assign_athletes_to_coordinator.sql` in the dashboard, sign in as that account.



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

**WP10 status: build work DONE 2026-10-27; the sign-off needs your steps in `guides/LAUNCH-CHECKLIST.md`.** No new migration. Added:
- **Security audit** (`supabase/tests/70_security_audit.test.sql`, runs with `npm run db:test`): RLS on every table; every view `security_invoker`; no materialized views; signed-out users reach nothing; signed-in privileges equal the reviewed lists (read, insert, update, delete); role, status, ownership and assignment columns not writable; every granted action has a policy; security-definer helpers pin their search path. Breaking it on purpose (an open table, a view that bypasses RLS) failed 8 checks. It found no hole; it did show that two older RLS tests counted real accounts, now scoped to test rows. All 8 database test files pass (73 checks).
- **Secret scan of the built site** (`app/scripts/check-bundle.mjs`, `npm run check:bundle`, also in CI): fails on `sb_secret_`, `service_role`, a non-anon JWT or a database connection string, and prints which Supabase project and key kind the build holds. A planted fake key was caught.
- **Resilience:** an error screen instead of a blank page; staff screens and edit forms are downloaded only by staff (the 500 kB build warning is gone).
- **Accessibility:** `vitest-axe` over 28 screens and states (signed out, athlete, staff, forms with errors, edit forms). One real finding, fixed (the error screen's landmark role). Colour contrast measured separately: lowest ratio 6.1:1 (AA needs 4.5). 286 app tests now.
- **Backups (P4, manual):** `npm run backup:data` exports 26 tables (college data included, so ids survive) to the git-ignored `backups/`, no passwords. `npm run backup:check -- <folder>` rehearses a restore on DEV (athlete, staff and coach data into the real tables inside a rolled-back transaction; every table including the 26k-row college data into a scratch copy) and compares row counts and content hashes: **PASSED on the real DEV data, all 24 tables identical (before the notes tables existed); a deliberately damaged copy was caught; DEV was left unchanged.** `npm run backup:restore -- <folder> --project <ref> [--yes]` restores into an empty migrated project, matches logins by email, translates author ids, removes the new project's duplicate club and team, and is safe to repeat. 15 unit tests for the translation and chunking (`npm run test:scripts`, also in CI). The disaster path itself (sign-up again, then restore) has not been run against a second project; that is an optional step on the checklist.
- **Guides** (`guides/`): family guide, coordinator guide, runbook (jobs, backups, disaster restore, the freeze procedure, weekly look, incidents, hand checks) and the launch checklist.
- **Left for you (decisions and hands):** online error reporting (not built on purpose: it sends data to an outside service), the phone and keyboard hand pass, the first weekly log look, a fresh export before launch, the Cloudflare build command and variables check, Resend, and the freeze date.



### WP11 Dry run, launch, pilot (3 days build time + 4-6 weeks pilot)

- **Week 0:** 2-3 friendly test accounts go through everything on real phones; fix findings; assign coordinators; delete test data or keep as demo accounts.
- **Launch:** share the private URL with the pilot group; coordinators briefed (30 minutes).
- **Weekly:** 15-minute check-in; log requests; review Supabase logs for errors and any cross-athlete access.
- **Week 4:** read the success measures (MVP 12.6) and rank requested features; decide go / change / stop and the PROD plan (P1).

**WP11 status: build work DONE 2026-10-27; the dry run, launch and pilot are yours to run.** No new migration, no app change. Added:
- **Acceptance walkthroughs** (`supabase/tests/80_walkthroughs.test.sql`, part of `npm run db:test`): the four walkthroughs of section 5, each start to finish through the real roles (grants and row-level security apply). (1) A login creates its profile, fills the tabs, saves preferences, finds five Division II programs by division and major, adds them, logs an email to a coach, sets a next step and sees it on Home. (2) A coordinator's roster holds only the assigned athlete; they fix a GPA, add "Send updated video" and correct a coach email (stamped and in the history). (3) The athlete sees the change, the coordinator's name and label, and no other athlete. (4) The attack checks (change `athlete_id`, read another athlete by id, promote self, write a "staff" or "system" entry, signed-out) all fail. 77 database checks across 9 files pass.
- **Pilot measures** (`supabase/admin/08_pilot_measures.sql`, read-only): MVP 12.6 as one table with no names: athletes signed up, finished profile + preferences + 5 colleges (and within 10 minutes / 7 days, median minutes), active in two or more different weeks (Chicago weeks), activities, coach replies, next steps done, each coordinator's athlete edits and college edits, and four safety rows (coordinator edits on an unassigned athlete, athlete edits recorded against someone else, disabled accounts) that must read ok. Test and demo accounts are left out through a `leave_out` list. Five cases in `npm run admin:check` (31 in all): totals, the thresholds, leave-out, the safety flags, and running on real data as shipped. Breaking the week counting made a case fail.
- **Pilot playbook** (`guides/PILOT-PLAYBOOK.md`): the week-0 task table with severity rules and a "clean" definition, the launch message, the 30-minute coordinator briefing, the weekly 15-minute check-in with fixed questions and a request log, and the week-4 decision table (go / change / stop) and PROD reset steps (P1).
- **Tooling fix found while preparing:** the Supabase CLI prints a table or a plain list of rows in an ordinary terminal and an object only when it detects an assistant, so every script now asks for JSON and reads both shapes (`scripts/lib/cli-json.mjs`). `admin:check` can run on a copy of the scripts (`ADMIN_SCRIPTS_DIR`) while the working copies hold real emails.
- **Not done, on purpose:** Playwright browser tests against a live backend (the plan wanted a local Supabase; DEV holds real data and the sign-up code must not be read, so the screens stay covered by the 286 app tests and your hands-on dry run); in-app analytics events (cut from the MVP, the measures come from the data instead).
- **Yours:** everything in `guides/PILOT-PLAYBOOK.md` and the open boxes of `guides/LAUNCH-CHECKLIST.md`.

**Change after WP11 (2026-10-27): notes between athlete and coordinators, several coaches per activity, College page opens on Activity.** Three migrations, applied to DEV after a backup (`20261028100000_activity_multiple_coaches`, `20261028110000_notes_between_athlete_and_staff`, `20261028120000_note_thread_mine`):
- **Notes:** `athlete_note` (note or question, up to 1000 characters; sender, author and time are set by the database; no edit, no delete) and `athlete_note_dismissal` (one row per person who dismissed it), read through the `note_thread` view. One conversation per athlete, readable by the athlete, every coordinator assigned to them and administrators. A note from the athlete is addressed to the athlete's assigned coordinators; a note from a coordinator is addressed to the athlete (an administrator who is not assigned is not a recipient). A new note shows on the recipient's home until they dismiss it: the athlete's Home, and the top of the coordinator's Roster. Dismissing is per person. Screens: athlete `/notes` (from Home and More), and a **Notes** tab inside the athlete's account for coordinators. No email is sent (D5).
- **Several coaches:** `activity_entry.coach_ids` (up to 10, same program, or the athlete's own contacts) replaces `coach_id`. Existing entries were carried over, deleting a private contact removes it from entries, and the form shows a tick list; the free-text coach name is only asked when no listed coach is ticked.
- **Default tab:** `/list/<id>` and every link into a college open on Activity.
- **Tests:** `65_notes_and_coaches.test.sql` (who can write, read and dismiss; the sender cannot be faked; no edit or delete; coach rules); `70_security_audit` and `80_walkthroughs` updated; 19 new app tests (`notes.test.tsx`, coach and tab cases in `list.test.tsx`, two accessibility checks), 305 in all; the backup tooling (26 tables, older backups are upgraded on restore) and the export and delete scripts include notes. Loosening the note policies or grants on purpose failed the new tests.
- **Decisions to know:** notes cannot be retracted by the sender (an administrator removes one in the dashboard); notes are not recorded in the change history (they are append-only and carry their author); the athlete's note goes to all assigned coordinators, not one chosen coordinator.

**Change after WP11 (2026-10-27): fields hidden for this phase.** Hidden from the screens and no longer sent on save; the columns stay in the database and keep any saved value, so a field can come back by adding it to its schema, form and save (`profileSchemas.ts`, `profileApi.ts`, `listSchemas.ts`, `listApi.ts`). No migration.
- **Athletic tab:** Club level, High school coach phone.
- **Academics tab:** SAT total, SAT date, ACT date, School counselor name, School counselor email (ACT composite stays).
- **Highlights tab:** X (Twitter), Recruiting profile link, Game film link.
- **Activity log:** Time, Link to the email or document (an existing link is no longer shown on the entry).
- Tests: each tab and the log form are checked for the missing labels and for the columns not being sent (a save or an edit leaves a stored value alone). 306 app tests.

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