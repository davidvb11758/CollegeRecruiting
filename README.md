# Rockets College Recruiting

College recruiting tracker for Iowa Rockets volleyball athletes and club coordinators. Planning documents are in the repo root; the build plan is `CollegeRecruiting-app-IMPLEMENTATION-PLAN.md`.

## Layout

| Path | What it is |
|---|---|
| `app/` | Web app: React + TypeScript + Vite, Tailwind, React Router, TanStack Query, react-hook-form + zod, `supabase-js`. Hosted as static files on Cloudflare (Workers static assets; see `app/wrangler.jsonc`). |
| `supabase/migrations/` | **The only way the database schema changes.** One file per change. |
| `supabase/tests/` | SQL tests (pgTAP), including the row-level security tests. |
| `guides/` | Family guide, coordinator guide, runbook and launch checklist. |
| `supabase/admin/` | Admin SQL scripts run in the dashboard (promote staff, assign athletes, disable, export, delete, history). See its README. |
| `supabase/auth-settings.md` | Auth settings that live in the dashboard (sign-in, redirect URLs, Resend SMTP, email wording). |
| `CollegeInfo/` | Enriched college data files and notes (loaded into the database in WP4). |
| `.github/workflows/ci.yml` | CI: type-check, lint, tests and build for the app, plus guardrail checks. |

## Environments

| | Supabase project | URL |
|---|---|---|
| DEV (the pilot runs here) | RocketsDev (`ewqocjaurrkamkhhwgll`) | https://ewqocjaurrkamkhhwgll.supabase.co |
| PROD (empty until the pilot is judged a success) | Rockets College Recruiting (`ivpewjtiwslpjlkfawlt`) | https://ivpewjtiwslpjlkfawlt.supabase.co |

There is no local database (no Docker). DEV is scratch until the freeze in WP10; from then on, no resets.

## Rules

1. **Schema changes only through migration files** in `supabase/migrations/` (`npm run db:new -- <name>`). Never edit a migration that has been applied; add a new one.
2. **The Supabase service key never goes in the app or the repo.** The app uses only the public (publishable) key. `.env` files are git-ignored; `app/.env.example` shows the names.
3. **No real athlete or roster data in git.**
4. Every new table or view comes with a row-level security test before it merges.

## Commands

From the repo root (database):

```
npx supabase login                 # once, opens a browser
npm run db:link:dev                # once, links the CLI to DEV (asks for the DEV database password)
npm run db:diff                    # dry run: what would be applied
npm run db:push                    # apply migrations to the linked project
npm run db:test                    # run supabase/tests against the linked project (no Docker; see below)
npm run admin:check                # run the admin SQL scripts (supabase/admin) on test users in a rolled-back transaction
npm run backup:data                # export every table to backups/ (git-ignored); backup:check rehearses a restore on DEV
npm run load:colleges:verify        # check the loaded college data against the CSVs (load itself: npm run load:colleges)
npm run db:dryrun                  # run unapplied migrations in a transaction and roll back (nothing changes)
npm run db:dryrun:tests            # same, then run all tests against them
```

**Database tests.** `npm run db:test` sends each file in `supabase/tests/` to the linked project through the Management API and rolls it back, so nothing is left behind. House style (see `00_smoke.test.sql`): checks are functions `tests.test_*` and each file ends with one `runtests()` call, because the API returns only the last result set. `npm run db:test:docker` is the stock `supabase test db` for use if Docker is ever installed.

From `app/` (web app):

```
npm install
cp .env.example .env.local         # then fill in the DEV URL and publishable key
npm run dev                        # http://localhost:5173
npm run typecheck && npm run lint && npm test && npm run build
```
