-- Baseline migration: intentionally does nothing.
-- It proves the migration pipeline (CLI -> DEV project) works before any real schema exists.
-- All schema changes after this go in new migration files; never edit a migration that has been applied.
select 1;
