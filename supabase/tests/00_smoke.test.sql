-- pgTAP smoke test. Run with: npm run db:test (runs against the linked project; pgTAP is enabled inside the test transaction).
--
-- House style for ALL test files: xUnit style. Put each check in a function in schema "tests" named test_*, returning setof text,
-- and finish with one runtests() call. The Management API only returns the last result set of a file, and runtests() returns
-- every result in that one set. Every file begins with "begin;" and ends with "rollback;" so nothing is left in the database.
begin;

create schema tests;

create function tests.test_pipeline_works() returns setof text language plpgsql as $$
begin
  return next ok(true, 'database test pipeline works');
end;
$$;

select * from runtests('tests'::name);

rollback;
