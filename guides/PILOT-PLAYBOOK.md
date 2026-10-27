# Pilot playbook (WP11): dry run, launch, weekly check-ins, week-4 decision

For the club administrator. It turns the plan (week 0, launch, weekly, week 4) into steps you can follow. Keep your real notes (names, what families said) in a private document, **not in this repo**: the repository is public.

## Week 0: dry run with friendly accounts

**Who:** 2 or 3 families you trust, one on iPhone and one on Android if you can, plus yourself and one coordinator. Use the real site link and the real sign-up code.

**Ground rules:** tell them it is a rehearsal, ask them to think aloud, and **do not help** unless they are stuck for a minute. Time the first task with a phone stopwatch.

| # | Task (each one is a walkthrough of the plan, section 5) | Look for |
|---|---|---|
| 1 | Open the link on the phone and create an account with the sign-up code | Anything unclear on the form; the code error message if they mistype it |
| 2 | Create the athlete profile, fill the four tabs, set preferences | **Stopwatch: minutes from starting the profile to a list of 5 colleges (the target is about 10)**; which tab people skip |
| 3 | In Find, search for Division II programs with a major, add 5 to the list | Filters understood? The "Match my preferences" button used? |
| 4 | Open a college, log an email to a coach, set a next step with a date | The next step appears on Home; the date is right (club time zone) |
| 5 | Sign out, sign in, use *Forgot password* once | The reset email arrives and the link opens the app's reset page |
| 6 | Coordinator: sign in, open the roster, open the athlete, fix the GPA, add the next step "Send updated video" | The roster shows only assigned athletes |
| 7 | Coordinator: correct a coach email on a college page, then press **Mark as verified today** | The edit shows in History with the coordinator's name |
| 8 | Athlete again: open the profile and Activity | The athlete sees the coordinator's name on the edit and sees no other athlete |
| 9 | Rotate the phone, zoom the text to 200%, tab through a form with a keyboard (computer) | Nothing cut off; focus visible (see the hand checks in `RUNBOOK.md`) |

The same story is proved by the database every time you run `npm run db:test` (file `80_walkthroughs`), so a failure here that is *not* a mistake in how the test was run points at a screen or wording problem, not at the access rules.

**Record each finding** (private notes):

| Severity | Meaning | What happens |
|---|---|---|
| Blocker | A task cannot be finished, data is wrong, someone sees what they should not | Fix before launch. Per the regression rule, **write a test first**, then the fix |
| Annoying | Finished with confusion or a workaround | Fix if small; otherwise goes on the ranked list |
| Idea | "It would be nice if…" | Goes on the ranked list for week 4. It does **not** go into the build now |

**Dry run is clean when:** every task is finished on both phone types with no blocker open, the stopwatch task is at or near 10 minutes, the password reset email arrived, and the coordinator finished tasks 6 and 7.

**Afterwards:** decide what to do with the test accounts. Either delete them (`06_delete_athlete.sql`, export first if the family wants a copy) or keep them as demo accounts and list their emails in `leave_out` at the top of `supabase/admin/08_pilot_measures.sql` so they do not count in the measures.

## Before you share the link

Work through `LAUNCH-CHECKLIST.md` until every box is ticked and dated, then:

- Take a fresh backup (`npm run backup:data`) and run `npm run backup:check -- backups/<folder>` until it says PASSED. Copy the backup to encrypted storage.
- Run `npm run db:test` and `npm run admin:check` (edit your private copies of scripts 01 and 03 back to placeholders first, or run `node scripts/admin-scripts-check.mjs 08` for the measures only). Both should be clean.
- Promote and assign the coordinators (scripts 01 and 03). Each coordinator signs in once and sees the roster.
- Write the launch date into the checklist. From that day: no resets of DEV and no edits to applied migrations (the freeze in `RUNBOOK.md`).

## Launch

**The message.** Send the link and the family guide to the pilot group (about 12 athletes). Send the **sign-up code separately** (text or phone call, not in the same message as the link). Suggested wording:

> Hi families. The Rockets are trying a small tool to help our players organise their college search: a list of colleges, a log of every email, call or visit, and reminders for what to do next. You are one of about 12 families in the pilot. Link: <site link>. I will text you the sign-up code. It takes about 10 minutes to set up: please do it on your phone this week. The one-page guide is attached. Only you and your club coordinators can see what you enter; no college sees anything. Tell me or your coordinator what is confusing. This is a trial and your feedback decides what happens next.

**Coordinator briefing (30 minutes).** Use `COORDINATOR-GUIDE.md`.

1. (5 min) What the app is for, and what it is not (no scholarships promised; no emails sent to colleges).
2. (10 min) Sign in on the projector or a phone: roster, open an athlete, edit a field, add a next step. Everything is labelled with their name.
3. (5 min) Shared college data: correct a coach email, mark verified. It changes the page for every athlete.
4. (5 min) Limits: assigned athletes only; do not share exports; how to report a problem.
5. (5 min) Their week-one task: make **one real college correction** and help **one athlete** finish their list.

**First week:** answer questions the same day, check the logs twice (runbook weekly look), and run the measures once after three days to see who has not started. Use the roster's "Least complete profile" sort to find who to nudge, and let the coordinator send the reminder (the app sends no email).

## Every week: the 15-minute check-in

Hold it with the two coordinators, and talk to two or three parents in rotation.

1. (3 min) **Numbers.** Run `supabase/admin/08_pilot_measures.sql` in the SQL Editor and read the table: signed up, finished, active in two weeks, coordinator edits, the safety rows. Write the three headline numbers in your notes.
2. (5 min) **Questions** (ask the same ones each week so you can compare):
   - Coordinators: Did you open the roster this week? What did you change for an athlete? What did you have to leave undone?
   - Parents and athletes: What did you do in the app this week? What did you try to do and could not? Did anything look wrong or confuse you?
3. (3 min) **Requests.** Add each request to the log below. One line each, with who asked.
4. (4 min) **Health.** The weekly look and the weekly backup from `RUNBOOK.md`. If a safety row in the measures reads CHECK, stop and follow "Someone may have seen another family's data".

**Request log** (keep in your private notes):

| Week | Request | Asked by (role, not name) | Times asked | Type (bug / confusing / missing / idea) |
|---|---|---|---|---|

A bug goes to the build at once (with a test first). Everything else waits for week 4. This is the scope-creep defence in the plan.

## Week 4: read the measures and decide

Run `08_pilot_measures.sql` and set it beside the plan's success measures (MVP-DETAIL 12.6):

| Measure | Target | Where it is in the table |
|---|---|---|
| Athletes who finished profile, preferences and 5 colleges, quickly | 8 of 12, in about 10 minutes | Section 1 |
| Athletes active in two different weeks | at least 6 | Section 2 |
| Each coordinator edited an athlete and a college | both coordinators | Section 3 (roster use is asked in the check-in) |
| No data leaks | zero | Section 4 stays 0 and `npm run db:test` passes |
| Weekly check-ins held, requests ranked | yes | your notes |

**Rank the requests:** count how many different families asked for each (the "Times asked" column), then mark each *must* (people stopped using the app without it), *should* or *could*. Sort by times asked, then by must/should/could. Keep the top five.

**Decide, in writing:**

| Result | Decision |
|---|---|
| All targets met, no leaks | **Go**: plan the PROD launch |
| Most met, and a few fixes would clearly change the rest | **Change**: build only the top fixes, then run two more weeks and read the measures again |
| Few met and the reasons are not fixable cheaply | **Stop**: export what families want (05), say thank you, switch accounts off |

**If Go (decision P1):** accounts are **reset**, not carried over. Create the PROD project (`ivpewjtiwslpjlkfawlt`), apply the migrations, load the college data with `npm run load:colleges`, set the Auth settings and the sign-up code, then ask the families to sign up again. Offer each family their own export (`05_export_athlete.sql`) so nothing they entered is lost. The coordinators' corrections to college data during the pilot are only in DEV (list them with `07_list_change_history.sql`, part B) and the loader does not carry them over: either re-enter them in PROD, or ask for a one-off copy script before the switch. Repoint the Cloudflare variables at PROD only after a test sign-up works there.
