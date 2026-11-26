# Admin tasks

Things the club administrator does in the Supabase dashboard, not in the app (decision: pilot admin work is done in the
dashboard; assigning athletes can also be done on the administrator's **Assignments** screen in the app).

There are two kinds of tool here:

- **Functions** in the database's `admin` schema, for every task that changes data. You run one line in the SQL Editor and
  change the values in it. They check everything first and stop with a plain message, changing nothing, if something is wrong.
- **Read-only scripts** in this folder (`05`, `07`, `08`), for reports. You edit a value or two, run the whole script and read the result.

## How to run a function

1. Supabase dashboard → the right project (**DEV** while testing; PROD only after the pilot is approved) → **SQL Editor**.
2. Open `00_QUICK_CALLS.sql` from this folder and copy **one** call into a new query (or save the calls you use as named snippets).
3. Change the values in quotes: `COACH_EMAIL`, `FAMILY_EMAIL` and so on. Always use the names (`account_email =>`), as shown, so a value cannot land in the wrong place.
4. Run it. If it stops with a message, nothing has changed: read the message and fix the value. If it works, the result row shows the outcome; there is no separate check to run.

The `admin` schema is not exposed to the app or the API (and not to any signed-in person), so only the dashboard can run these.
In the dashboard, **Project Settings → Data API (older name: API) → Exposed schemas** must NOT list `admin`.

## The functions

| Call | What it does | Changes data? |
|---|---|---|
| `select * from admin.who_is_who` | Lists every account: role, status, athlete or staff name, team, coordinators, whether sign-in is blocked | No |
| `admin.create_team(team_name => …)` | Adds a team (optional: `grad_year`, `season`, `team_level`, `head_coach`) | Yes |
| `admin.promote_to_staff(account_email, given_name, family_name, team_name)` | Turns a sign-up into a coordinator (or administrator, `account_role => 'admin'`), on one team that **replaces** any earlier one. Refuses anyone with an athlete profile, a switched-off account, or the only administrator | Yes |
| `admin.convert_athlete_to_staff(account_email, given_name, family_name, team_name)` | For a login that already has an athlete profile: **preview** first (the default), then with `confirm_email` repeated and `confirm => true` it keeps the login and makes it staff (or admin) on one team, and **permanently deletes the athlete profile and everything attached** (list, log, notes, guardians, assignments, history). Sign out and in again afterwards | Yes |
| `admin.assign_athletes(coordinator_email, athlete_emails => array[…])` | Gives a coordinator access to athletes. New main coordinator moves the old one to extra. All or nothing | Yes |
| `admin.unassign_athlete(player_email, coordinator_email)` | Takes an athlete away from a coordinator | Yes |
| `admin.set_account_status(account_email, new_status)` | Switches an account off (bounced at once, data kept) or back on. Refuses to switch off the only administrator | Yes |
| `admin.delete_athlete(player_email)` | **Preview** of what would be deleted (the default). With `confirm_email` repeated and `confirm => true` it deletes the athlete, their login and their history. **Cannot be undone** | Yes |

## The scripts

| File | What it does | Changes data? |
|---|---|---|
| `00_QUICK_CALLS.sql` | One copy-and-paste line per function (above) | No (it is a menu) |
| `05_export_athlete.sql` | One athlete's whole record as JSON, for the family | No |
| `07_list_change_history.sql` | Who changed what: one athlete's history, and edits to shared college data | No |
| `08_pilot_measures.sql` | The pilot's success measures (activation, engagement, coordinator edits, safety checks) as one table, with no names. Run it at each weekly check-in | No |

For `05`, `07` and `08`: copy the script's text into a new query, edit the values in the first block (`'ATHLETE_EMAIL'` and so on), run it.
A script run unedited returns nothing useful rather than changing anything.

## Rules

- **Real families' data is in DEV once the pilot starts.** There are no resets of DEV after launch. Take an export (`05`)
  before any delete (`admin.delete_athlete`).
- Never paste an export, an email list or a result table into chat, a ticket or the repo. Send an export only to the
  athlete's parent or guardian, by a private channel. Never type real emails into the files in this folder; edit them in the SQL Editor.
- A person must sign up in the app first (with the shared sign-up code) before you can promote them or assign them. Tell staff to
  stop at the "create profile" screen: a login that has made an athlete profile cannot be promoted (use `admin.convert_athlete_to_staff` to keep the login and delete the student data, or sign up again with another email).
- A promoted person must sign out and in again.
- Changes made here are recorded in the change history as "Dashboard/system" (there is no signed-in person).
- Changing the shared sign-up code is a separate one-line statement, kept out of the repo on purpose
  (see the comment in `migrations/20261026131000_accounts_and_signup.sql`).

## Checking them

- The functions are tested by `supabase/tests/67_admin_functions.test.sql` (every task and every refusal) and
  `70_security_audit.test.sql` (no API role can use the `admin` schema). `npm run db:test` runs them, against DEV, inside a transaction that is rolled back.
- `npm run admin:check` runs the read-only scripts (`05`, `07`, `08`) the same way, using made-up test users.
  `node scripts/admin-scripts-check.mjs 08` runs only the cases whose name starts with 08.
- Change a function with a new migration (never edit an applied one), then run `npm run db:dryrun:tests`, `npm run db:push` and `npm run db:test`.
