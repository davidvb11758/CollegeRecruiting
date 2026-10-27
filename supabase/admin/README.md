# Admin SQL scripts

Things the club administrator does that have no screen in the app (decision: pilot admin work is done in the Supabase
dashboard). Each script is one file, written to be hard to run by accident.

## How to run one

1. Supabase dashboard → the right project (**DEV** while testing; PROD only after the pilot is approved) → **SQL Editor**.
2. Open the script from this folder, copy its text into a new query.
3. Edit the values in the first block (`'COORDINATOR_EMAIL'`, `'ATHLETE_EMAIL'`, and so on). The email also appears
   again in the check query at the bottom; edit it there too.
4. Run it. If it stops with a message, nothing has been changed; read the message and fix the value.
5. Read the result table at the bottom to confirm.

A script run unedited fails with a clear message instead of doing anything.

## The scripts

| File | What it does | Changes data? |
|---|---|---|
| `00_who_is_who.sql` | Lists every account: role, status, athlete, team, coordinators | No |
| `01_promote_user_to_staff.sql` | Turns a sign-up into a coordinator (or administrator) and links them to a team | Yes |
| `02_create_team.sql` | Adds a team | Yes |
| `03_assign_athletes_to_coordinator.sql` | Gives a coordinator access to athletes (and takes it away, last statement) | Yes |
| `04_disable_or_enable_account.sql` | Switches an account off (bounced at once, data kept) or back on | Yes |
| `05_export_athlete.sql` | One athlete's whole record as JSON, for the family | No |
| `06_delete_athlete.sql` | Deletes an athlete, their login and their history. **Cannot be undone.** Preview first | Yes |
| `07_list_change_history.sql` | Who changed what: one athlete's history, and edits to shared college data | No |

## Rules

- **Real families' data is in DEV once the pilot starts.** There are no resets of DEV after launch. Take an export (05)
  before any delete (06).
- Never paste an export, an email list or a result table into chat, a ticket or the repo. Send an export only to the
  athlete's parent or guardian, by a private channel.
- A person must sign up in the app first (with the shared sign-up code) before you can promote them or assign them.
- A promoted person must sign out and in again.
- Changes made here are recorded in the change history as "Dashboard/system" (there is no signed-in person).
- Changing the shared sign-up code is a separate one-line statement, kept out of the repo on purpose
  (see the comment in `migrations/20261026131000_accounts_and_signup.sql`).

## Checking the scripts

`npm run admin:check` (from the repo root, linked to DEV) runs every script inside a transaction that is always rolled
back, using made-up test users, and checks the result: it names the right people, refuses bad input, and the delete
script removes the athlete and their history but nothing else. Run it after changing a script.
