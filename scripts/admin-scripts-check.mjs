// Checks the admin SQL scripts in supabase/admin against the LINKED project (DEV) without leaving anything behind.
// Each case sends: begin; test helpers; a small world of test users; the script with its placeholders filled in;
// a check query; rollback. Real accounts are never named, and the transaction is always rolled back.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEV_REF = 'ewqocjaurrkamkhhwgll'
const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
if (ref !== DEV_REF) {
  console.error(`Linked project is ${ref}, not DEV (${DEV_REF}). Refusing to run.`)
  process.exit(1)
}

const helpers = readFileSync('supabase/tests/helpers.sql', 'utf8')
const script = (name) => readFileSync(`supabase/admin/${name}`, 'utf8')

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

// ---- 00 who is who
add({
  name: '00 who is who lists accounts, athletes and coordinators',
  sql: () => script('00_who_is_who.sql'),
  check(rows, t) {
    const a = rows.find((r) => r.email === EMAIL('a'))
    t(a?.athlete === 'Test Athlete' && a.role === 'athlete', 'athlete a@ is listed with their name')
    t(a?.coordinators === 'Coach s@example.com (primary)', 'and their coordinator')
    t(rows.find((r) => r.email === EMAIL('s'))?.role === 'staff', 'coordinator s@ is listed as staff')
  },
})

// ---- 01 promote
const promote = (extra = [], email = EMAIL('z')) => () =>
  fill(script('01_promote_user_to_staff.sql'), [
    ["'COORDINATOR_EMAIL'", `'${email}'`, true],
    ["'FIRST_NAME'", "'Zed'"],
    ["'LAST_NAME'", "'Zee'"],
    ...extra,
  ])
add({
  name: '01 promote makes a sign-up staff, with name and team',
  sql: promote(),
  check(rows, t) {
    t(rows.length === 1, 'one result row')
    t(rows[0]?.role === 'staff' && rows[0].name === 'Zed Zee', 'role and name')
    t(rows[0]?.title === 'Recruiting Coordinator' && rows[0].team === 'Iowa Rockets 16R', 'title and team')
  },
})
add({
  name: '01 promote can make an administrator, and can be run twice',
  sql: () => {
    const once = promote([["v_role  public.user_role := 'staff'", "v_role  public.user_role := 'admin'"]])()
    return once + '\n' + once
  },
  check(rows, t) {
    t(rows.length === 1 && rows[0].role === 'admin', 'one row, role admin')
  },
})
add({ name: '01 promote refuses an unknown email', sql: promote([], 'nobody@example.com'), error: /No account with the email "nobody@example.com"/ })
add({ name: '01 promote refuses a person who has an athlete profile', sql: promote([], EMAIL('a')), error: /has an athlete profile/ })
add({ name: '01 promote refuses an unknown team', sql: promote([["v_team  text := 'Iowa Rockets 16R'", "v_team  text := 'No Such Team'"]]), error: /No team named "No Such Team"/ })
add({ name: '01 promote as shipped (placeholders) fails safely', sql: () => script('01_promote_user_to_staff.sql'), error: /No account with the email "COORDINATOR_EMAIL"/ })

// ---- 02 create team
const team = () => fill(script('02_create_team.sql'), [["v_name   text := 'TEAM_NAME'", "v_name   text := 'Test Team 17R'"], ['v_level  text := null', "v_level  text := '17R'"]])
add({
  name: '02 create team adds the team',
  sql: team,
  check(rows, t) {
    t(rows.some((r) => r.name === 'Test Team 17R'), 'the new team is listed')
    t(rows.some((r) => r.name === 'Iowa Rockets 16R'), 'the existing team is still there')
  },
})
add({ name: '02 create team refuses a duplicate', sql: () => team() + '\n' + team(), error: /already exists/ })
add({ name: '02 create team as shipped fails safely', sql: () => script('02_create_team.sql'), error: /Edit the team name first/ })

// ---- 03 assign
const assign = (extra = [], coordinator = EMAIL('t'), athletes = `array['${EMAIL('a')}', '${EMAIL('b')}']`) => () =>
  fill(script('03_assign_athletes_to_coordinator.sql'), [
    ["'COORDINATOR_EMAIL'", `'${coordinator}'`],
    ["array['ATHLETE_EMAIL_1', 'ATHLETE_EMAIL_2']", athletes],
    ...extra,
  ])
const roles = (rows, athlete) =>
  JSON.stringify(rows.filter((r) => r.athlete_email === EMAIL(athlete)).map((r) => `${r.coordinator}: ${r.role_on_athlete}`).sort())
const rolesAre = (rows, athlete, expected) => roles(rows, athlete) === JSON.stringify(expected.sort())
add({
  name: '03 assign makes the coordinator primary and moves the old primary to secondary',
  sql: assign(),
  check(rows, t) {
    t(rolesAre(rows, 'a', ['Coach s@example.com: secondary', 'Coach t@example.com: primary']), `athlete a@: t@ primary, s@ secondary (got ${roles(rows, 'a')})`)
    t(rolesAre(rows, 'b', ['Coach t@example.com: primary']), `athlete b@: t@ primary (got ${roles(rows, 'b')})`)
  },
})
add({
  name: '03 assign as secondary keeps the existing primary, and can be run twice',
  sql: () => {
    const once = assign([["v_role public.assignment_role := 'primary'", "v_role public.assignment_role := 'secondary'"]])()
    return once + '\n' + once
  },
  check(rows, t) {
    t(rolesAre(rows, 'a', ['Coach s@example.com: primary', 'Coach t@example.com: secondary']), `athlete a@: s@ primary, t@ secondary (got ${roles(rows, 'a')})`)
  },
})
add({ name: '03 assign refuses someone who is not staff', sql: assign([], EMAIL('b')), error: /No active staff account/ })
add({ name: '03 assign refuses an unknown athlete', sql: assign([], EMAIL('t'), "array['nobody@example.com']"), error: /No athlete profile for the email "nobody@example.com"/ })

// ---- 04 disable / enable
const disable = (status, email = EMAIL('a')) => () =>
  fill(script('04_disable_or_enable_account.sql'), [
    ["'ACCOUNT_EMAIL'", `'${email}'`, true],
    ["v_status public.user_status := 'disabled'", `v_status public.user_status := '${status}'`],
  ])
add({
  name: '04 disable switches the account off in the app and at sign-in, and enable switches it back on',
  sql: () => disable('disabled')() + '\n' + `select tests.q_count(tests.gid('user_a'), 'select count(*) from public.athlete') as visible_when_off;\n` + disable('active')(),
  check(rows, t) {
    t(rows.length === 1 && rows[0].status === 'active' && rows[0].banned_until === null, 'active again with no sign-in ban')
  },
})
add({
  name: '04 disable: the account sees nothing and is banned',
  sql: () => disable('disabled')(),
  verify: `select au.status::text as status, u.banned_until::text as banned, tests.q_count(tests.gid('user_a'), 'select count(*) from public.athlete') as visible
           from public.app_user au join auth.users u on u.id = au.user_id where u.email = '${EMAIL('a')}'`,
  check(rows, t) {
    t(rows[0]?.status === 'disabled', 'status is disabled')
    t(rows[0]?.banned === 'infinity', 'banned at the sign-in service')
    t(Number(rows[0]?.visible) === 0, 'the person can read no athlete rows')
  },
})
add({
  name: '04 disable refuses to switch off the only active administrator',
  setup: `update public.app_user set status = 'disabled' where role = 'admin' and user_id <> tests.gid('admin_x');`,
  sql: disable('disabled', EMAIL('x')),
  error: /only active administrator/,
})
add({ name: '04 disable refuses an unknown email', sql: disable('disabled', 'nobody@example.com'), error: /No account with the email/ })

// ---- 05 export
add({
  name: '05 export returns the whole athlete record as one JSON cell',
  sql: () => fill(script('05_export_athlete.sql'), [["'ATHLETE_EMAIL'", `'${EMAIL('a')}'`]]),
  check(rows, t) {
    t(rows.length === 1, 'one row')
    const x = JSON.parse(rows[0]?.export ?? '{}')
    t(x.athlete?.first_name === 'Test', 'athlete')
    t(x.guardians?.[0]?.full_name === 'Mom A', 'guardians')
    t(x.college_list?.length === 1 && x.college_list[0].college === 'Test College 1', 'college list with the college name')
    t(x.activity_log?.length >= 1, 'activity log')
    t(x.next_steps?.length === 1, 'next steps')
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

// ---- 06 delete
const DELETE_MARK = '-- DELETE (run this block'
const del = (email = EMAIL('a'), confirm = 'DELETE') => () =>
  fill(part(script('06_delete_athlete.sql'), DELETE_MARK), [["v_email   text := 'ATHLETE_EMAIL'", `v_email   text := '${email}'`], ["'type DELETE here'", `'${confirm}'`]])
add({
  name: '06 delete preview counts what would go',
  sql: () => fill(part(script('06_delete_athlete.sql'), null, DELETE_MARK), [["'ATHLETE_EMAIL'", `'${EMAIL('a')}'`]]),
  check(rows, t) {
    t(rows.length === 1 && Number(rows[0].colleges) === 1 && Number(rows[0].next_steps) === 1, 'counts for athlete a@')
    t(Number(rows[0]?.history_rows) > 0, 'history rows are counted')
  },
})
add({
  name: '06 delete removes the athlete, the login and their history, and nothing else',
  sql: del(),
  verify: `select
      not exists (select 1 from public.athlete where id = tests.gid('athlete_a')) as athlete_gone,
      not exists (select 1 from auth.users where email = '${EMAIL('a')}') as login_gone,
      not exists (select 1 from public.app_user where user_id = tests.gid('user_a')) as app_user_gone,
      not exists (select 1 from public.activity_entry where athlete_id = tests.gid('athlete_a')) as log_gone,
      not exists (select 1 from public.athlete_college where athlete_id = tests.gid('athlete_a')) as list_gone,
      not exists (select 1 from public.athlete_staff_assignment where athlete_id = tests.gid('athlete_a')) as assignment_gone,
      not exists (select 1 from public.college_coach where owner_athlete_id = tests.gid('athlete_a')) as private_coach_gone,
      not exists (select 1 from public.change_history where athlete_id = tests.gid('athlete_a')) as history_gone,
      not exists (select 1 from public.change_history where table_name = 'app_user' and record_id = tests.gid('user_a')::text) as account_history_gone,
      exists (select 1 from public.athlete where id = tests.gid('athlete_b')) as b_athlete_kept,
      exists (select 1 from public.athlete_college where athlete_id = tests.gid('athlete_b')) as b_list_kept,
      exists (select 1 from public.change_history where athlete_id = tests.gid('athlete_b')) as b_history_kept,
      exists (select 1 from public.college_program where id = tests.bid('program_1')) as college_kept,
      exists (select 1 from public.college_coach where id = tests.bid('coach_master')) as shared_coach_kept,
      exists (select 1 from auth.users where id = tests.gid('staff_s')) as coordinator_kept`,
  check(rows, t) {
    for (const [key, value] of Object.entries(rows[0] ?? {})) t(value === true, key)
  },
})
add({ name: '06 delete does nothing without the confirmation word', sql: del(EMAIL('a'), 'type DELETE here'), error: /Nothing deleted/ })
add({ name: '06 delete refuses an unknown email', sql: del('nobody@example.com'), error: /No athlete profile for the email "nobody@example.com"/ })

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

// ---------------------------------------------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'admincheck-'))
let failed = 0
try {
  for (const c of cases) {
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
      const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
      if (c.error) problems.push(`expected an error matching ${c.error}, but it ran`)
      const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
      rows = json.rows ?? []
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
console.log(`\n${cases.length} cases, ${failed} failed`)
process.exit(failed ? 1 : 0)
