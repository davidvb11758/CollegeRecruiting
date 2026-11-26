// Checks the READ-ONLY admin SQL scripts that remain in supabase/admin (05 export, 07 history, 08 pilot measures) against the
// LINKED project (DEV) without leaving anything behind. The tasks that change data (create team, promote, assign, switch an
// account off, delete) are functions in the `admin` schema, tested by supabase/tests/67_admin_functions.test.sql (npm run db:test).
// Each case sends: begin; test helpers; a small world of test users; the script with its placeholders filled in;
// a check query; rollback. Real accounts are never named, and the transaction is always rolled back.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { queryRows } from './lib/cli-json.mjs'

const DEV_REF = 'ewqocjaurrkamkhhwgll'
const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
if (ref !== DEV_REF) {
  console.error(`Linked project is ${ref}, not DEV (${DEV_REF}). Refusing to run.`)
  process.exit(1)
}

const helpers = readFileSync('supabase/tests/helpers.sql', 'utf8')
// ADMIN_SCRIPTS_DIR lets the check run on a copy of the scripts (for example the committed versions) while the working copies
// hold real emails you have typed in.
const adminDir = process.env.ADMIN_SCRIPTS_DIR ?? 'supabase/admin'
const script = (name) => readFileSync(`${adminDir}/${name}`, 'utf8')

/** Part of a script: from one marker line to another (either may be omitted). */
function part(text, from, to) {
  let out = text
  if (from) out = out.slice(out.indexOf(from))
  if (to) out = out.slice(0, out.indexOf(to))
  return out
}

/** Fill placeholders: [search, replacement, all?]. A search that is not found is a mistake in the case. */
function fill(text, replacements) {
  let out = text
  for (const [search, replacement, all] of replacements) {
    if (!out.includes(search)) throw new Error(`placeholder not found: ${search}`)
    out = all ? out.split(search).join(replacement) : out.replace(search, () => replacement)
  }
  return out
}

// users made by tests.world(): athletes a@ and b@, coordinator s@ (assigned to a@), coordinator t@, admin x@, plain user z@
const EMAIL = (name) => `${name}@example.com`

const cases = []
const add = (c) => cases.push(c)

// ---- 05 export
add({
  name: '05 export returns the whole athlete record as one JSON cell',
  setup: `select tests.q_affected(tests.gid('user_a'), format($q$insert into public.athlete_note (athlete_id, kind, body) values (%L, 'question', 'Which camps?')$q$, tests.gid('athlete_a')));`,
  sql: () => fill(script('05_export_athlete.sql'), [["'ATHLETE_EMAIL'", `'${EMAIL('a')}'`]]),
  check(rows, t) {
    t(rows.length === 1, 'one row')
    const x = JSON.parse(rows[0]?.export ?? '{}')
    t(x.athlete?.first_name === 'Test', 'athlete')
    t(x.guardians?.[0]?.full_name === 'Mom A', 'guardians')
    t(x.college_list?.length === 1 && x.college_list[0].college === 'Test College 1', 'college list with the college name')
    t(x.activity_log?.length >= 1, 'activity log')
    t(x.next_steps?.length === 1, 'next steps')
    t(x.notes?.length === 1 && x.notes[0].body === 'Which camps?' && x.notes[0].kind === 'question', 'notes')
    t(x.notes?.[0] && !('sender_user_id' in x.notes[0]), 'without the login id of the author')
    t(x.own_coach_contacts?.length === 1 && x.own_coach_contacts[0].full_name === 'Private Coach of A', 'own coach contacts')
    t(JSON.stringify(x.assigned_coordinators) === JSON.stringify(['Coach s@example.com']), 'assigned coordinators')
    t(!JSON.stringify(x).includes('Mom B'), 'nothing about the other athlete')
  },
})
add({
  name: '05 export of an unknown email returns nothing',
  sql: () => fill(script('05_export_athlete.sql'), [["'ATHLETE_EMAIL'", "'nobody@example.com'"]]),
  check: (rows, t) => t(rows.filter((r) => 'export' in r).length === 0, 'no export row'),
})

// ---- 07 history
const HISTORY_B = '-- B. Edits to the SHARED'
add({
  name: '07 history of one athlete names the coordinator and shows system changes',
  setup: `select tests.q_affected(tests.gid('staff_s'), format($q$update public.athlete set jersey_number = '7' where id = %L$q$, tests.gid('athlete_a')));`,
  sql: () => fill(part(script('07_list_change_history.sql'), null, HISTORY_B), [["'ATHLETE_EMAIL'", `'${EMAIL('a')}'`]]),
  check(rows, t) {
    t(rows.some((r) => r.who === 'Coach s@example.com' && r.table_name === 'athlete' && r.new_values?.jersey_number === '7'), 'the coordinator edit, by name')
    t(rows.some((r) => r.who === 'Dashboard/system'), 'changes made outside the app')
    t(rows[0]?.table_name === 'athlete', 'newest first')
  },
})
add({
  name: '07 history of shared college edits shows who edited which college',
  setup: `select tests.q_affected(tests.gid('staff_s'), $q$update public.college set website_url = 'https://x.example.edu' where unitid = 900001$q$);`,
  sql: () => part(script('07_list_change_history.sql'), HISTORY_B),
  check(rows, t) {
    t(rows.some((r) => r.who === 'Coach s@example.com' && r.table_name === 'college' && r.record === 'Test College 1'), 'the college edit with the coordinator and college name')
  },
})

// ---- 08 pilot measures
// Real accounts are left out through the script's own leave_out list, so only the made-up test users are counted.
const LEAVE_OUT_TEST_ONLY = "array(select email::text from auth.users where email not like '%@example.com') as leave_out"
const measures = (extra = []) => () => fill(script('08_pilot_measures.sql'), [['array[]::text[] as leave_out', LEAVE_OUT_TEST_ONLY], ...extra])
const measure = (rows, item) => rows.find((r) => r.item.startsWith(item))
// a@ has a full list, was started 5 minutes before it was filled, and was active in two weeks; b@ has a full list started 3 hours before
const PILOT_WORLD = `
do $w$
declare
  a uuid := tests.gid('athlete_a'); b uuid := tests.gid('athlete_b'); la uuid := tests.gid('list_a'); n integer;
begin
  insert into public.athlete_preference (athlete_id, competitiveness_bands) values (a, array[3]), (b, array[3]);
  for n in 3..6 loop perform tests.mk_list_entry(a, tests.mk_program(n)); end loop;
  for n in 7..10 loop perform tests.mk_list_entry(b, tests.mk_program(n)); end loop;
  update public.athlete set created_at = now() - interval '5 minutes' where id = a;
  update public.athlete set created_at = now() - interval '3 hours' where id = b;
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, created_at)
  values (a, la, 'other_note', 'Older note', now() - interval '8 days');
  insert into public.activity_entry (athlete_id, athlete_college_id, activity_type_code, summary, direction)
  values (a, la, 'other_note', 'They wrote', 'they_contacted');
  update public.next_step set status = 'done' where athlete_id = a;
end $w$;
select tests.q_affected(tests.gid('staff_s'), format($q$update public.athlete set jersey_number = '7' where id = %L$q$, tests.gid('athlete_a')));
select tests.q_affected(tests.gid('staff_s'), $q$update public.college set website_url = 'https://x.example.edu' where unitid = 900001$q$);
`
add({
  name: '08 measures count activation, engagement and coordinator edits from the data',
  setup: PILOT_WORLD,
  sql: measures([['60              as min_profile_pct', '0 as min_profile_pct']]),
  check(rows, t) {
    t(measure(rows, 'Athletes signed up')?.result === '2', 'two test athletes')
    t(measure(rows, 'Finished profile')?.result === '2', 'both finished (profile, preferences and 5 colleges)')
    t(measure(rows, 'Of those, the list was full within 10')?.result === '1', 'only a@ filled the list within 10 minutes')
    t(measure(rows, 'Of those, the list was full within 7')?.result === '2', 'both within 7 days')
    t(['92', '93'].includes(measure(rows, 'Median minutes')?.result), `median of 5 and 180 minutes (got ${measure(rows, 'Median minutes')?.result})`)
    t(measure(rows, 'Active in two or more')?.result === '1', 'only a@ was active in two different weeks')
    t(measure(rows, 'Active in two or more')?.met === 'not yet', 'the target of 6 is not met')
    t(measure(rows, 'Active in the last 7 days')?.result === '2', 'both active this week')
    t(measure(rows, 'Activities logged')?.result === '4', 'four activities')
    t(measure(rows, 'Coach replies')?.result === '1', 'one reply')
    t(measure(rows, 'Next steps completed')?.result === '1', 'one next step done')
    const s = rows.find((r) => r.section === '3 Coordinators' && r.item === 'Coach s@example.com')
    t(s?.result === '1 athlete edit(s), 1 college edit(s)' && s.met === 'yes', `coordinator s@ made one athlete edit and one college edit (got ${s?.result})`)
    const tt = rows.find((r) => r.section === '3 Coordinators' && r.item === 'Coach t@example.com')
    t(tt?.result === '0 athlete edit(s), 0 college edit(s)' && tt.met === 'not yet', 'coordinator t@ has made none')
    t(rows.filter((r) => r.met === 'CHECK').length === 0, 'the safety rows are clean')
    t(measure(rows, 'Edits by a coordinator')?.result === '0' && measure(rows, 'Athlete-made edits')?.result === '0', 'both safety counts are 0')
    const people = rows.filter((r) => r.section === '5 Per athlete')
    t(people.length === 2 && people.every((r) => /^Athlete \d$/.test(r.item) && r.met === 'finished'), 'one anonymous line per athlete')
    t(!JSON.stringify(rows).includes('Test Athlete') && !JSON.stringify(rows).includes('a@example.com'), 'no athlete names or emails in the result')
  },
})
add({
  name: '08 measures honour the profile threshold',
  setup: PILOT_WORLD,
  sql: measures([['60              as min_profile_pct', '101 as min_profile_pct']]),
  check(rows, t) {
    t(measure(rows, 'Finished profile')?.result === '0' && measure(rows, 'Finished profile')?.met === 'not yet', 'nobody finishes above 100 percent')
    t(measure(rows, 'Median minutes')?.result === '-', 'no median without finished athletes')
  },
})
add({
  name: '08 measures leave out the accounts named in leave_out',
  sql: measures([[LEAVE_OUT_TEST_ONLY, "array(select email::text from auth.users where email not like '%@example.com' or email = 'b@example.com') as leave_out"]]),
  check: (rows, t) => t(measure(rows, 'Athletes signed up')?.result === '1', 'b@ is left out'),
})
add({
  name: '08 measures flag edits that break the access rules',
  setup: `insert into public.change_history (athlete_id, table_name, record_id, change_type, changed_by, changed_by_role)
          values (tests.gid('athlete_a'), 'athlete', 'x', 'updated', tests.gid('staff_t'), 'staff'),
                 (tests.gid('athlete_a'), 'athlete', 'x', 'updated', tests.gid('user_b'), 'athlete');`,
  sql: measures(),
  check(rows, t) {
    const a = measure(rows, 'Edits by a coordinator')
    const b = measure(rows, 'Athlete-made edits')
    t(a?.result === '1' && a.met === 'CHECK', 'a coordinator edit on an unassigned athlete is flagged')
    t(b?.result === '1' && b.met === 'CHECK', 'an athlete edit by someone else is flagged')
  },
})
add({
  name: '08 measures run as shipped',
  sql: () => script('08_pilot_measures.sql'),
  check: (rows, t) => t(measure(rows, 'Athletes signed up') !== undefined && rows.every((r) => r.section && r.item), 'a result with every row labelled'),
})

// ---------------------------------------------------------------------------------------------

// Optional filter: `node scripts/admin-scripts-check.mjs 08` runs only the cases whose name starts with 08.
const only = process.argv[2]
const selected = cases.filter((c) => !only || c.name.startsWith(only))
const tmp = mkdtempSync(join(tmpdir(), 'admincheck-'))
let failed = 0
try {
  for (const c of selected) {
    let body
    try {
      body = c.sql()
    } catch (e) {
      console.log(`FAIL  ${c.name}\n   case is broken: ${e.message}`)
      failed++
      continue
    }
    const sql = ['begin;', helpers, 'select tests.world();', c.setup ?? '', body, c.verify ? c.verify.replace(/;?\s*$/, ';') : '', 'rollback;'].join('\n')
    const path = join(tmp, 'case.sql')
    writeFileSync(path, sql)
    const problems = []
    let rows = []
    try {
      const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', '-f', path], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
      if (c.error) problems.push(`expected an error matching ${c.error}, but it ran`)
      rows = queryRows(out)
    } catch (e) {
      // the service wraps the database message in JSON, so quotes arrive backslash-escaped
      const text = `${e.stderr ?? ''}${e.stdout ?? ''}${e.message ?? ''}`.replace(/\\+"/g, '"')
      if (!c.error) problems.push(`query failed: ${text.split('\n').find((l) => /ERROR|error/.test(l)) ?? text.slice(0, 300)}`)
      else if (!c.error.test(text)) problems.push(`error did not match ${c.error}: ${text.split('\n').find((l) => /ERROR|error/.test(l)) ?? text.slice(0, 300)}`)
    }
    if (c.check && !problems.length) c.check(rows, (ok, what) => ok || problems.push(`not ok: ${what}`))
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${c.name}`)
    for (const p of problems) console.log('   ' + p)
    if (problems.length) failed++
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`\n${selected.length} cases, ${failed} failed`)
process.exit(failed ? 1 : 0)
