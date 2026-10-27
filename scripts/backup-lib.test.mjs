import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABLES, exportQuery, matchAccounts, packRequests, remapRows, restoreStatements, sequenceStatements } from './lib/backup-lib.mjs'

const table = (name) => TABLES.find((t) => t.name === name)

test('the restore order puts every parent before its children', () => {
  const order = TABLES.map((t) => t.name)
  const before = (a, b) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} must come before ${b}`)
  before('college_program', 'college_coach')
  before('app_user', 'athlete')
  before('app_user', 'staff_profile')
  before('staff_profile', 'athlete_staff_assignment')
  before('athlete', 'college_coach') // an athlete's private contacts
  before('college_coach', 'athlete_college') // the main coach of a list entry
  before('athlete_college', 'activity_entry')
  before('athlete_college', 'next_step')
})

test('every table has a primary key and the identity tables are the four that hand out numbers', () => {
  assert.ok(TABLES.every((t) => t.pk.length > 0))
  assert.deepEqual(TABLES.filter((t) => t.identity).map((t) => t.name).sort(), ['change_history', 'college_coach', 'college_program', 'conference'])
})

test('logins are matched by email, ignoring case, and missing ones are listed', () => {
  const { map, missing } = matchAccounts(
    [{ id: 'old1', email: 'Pat@Example.com' }, { id: 'old2', email: 'gone@example.com' }],
    [{ id: 'new1', email: 'pat@example.com' }],
  )
  assert.equal(map.get('old1'), 'new1')
  assert.deepEqual(missing, ['gone@example.com'])
})

test('login ids are translated in every column that holds one', () => {
  const map = new Map([['old', 'new']])
  const [row] = remapRows('activity_entry', [{ id: 'a', entered_by: 'old', deleted_by: null, summary: 'old' }], map)
  assert.equal(row.entered_by, 'new')
  assert.equal(row.deleted_by, null)
  assert.equal(row.summary, 'old', 'text that happens to equal an id is left alone')
})

test('an unknown author is dropped from an optional column but stops the restore in a required one', () => {
  const map = new Map([['old', 'new']])
  assert.equal(remapRows('athlete', [{ id: 'a', created_by: 'stranger', user_id: 'old' }], map)[0].created_by, null)
  assert.throws(() => remapRows('athlete', [{ id: 'a', user_id: 'stranger' }], map), /not in the new project/)
  assert.throws(() => remapRows('staff_team', [{ staff_user_id: 'stranger', team_id: 't' }], map), /not in the new project/)
})

test('remapping does not change the rows it was given', () => {
  const rows = [{ id: 'a', user_id: 'old' }]
  remapRows('athlete', rows, new Map([['old', 'new']]))
  assert.equal(rows[0].user_id, 'old')
})

test('a restore statement updates rows that exist, keeps old ids and uses only columns that exist', () => {
  const [sql] = restoreStatements(table('college_program'), [{ id: 7, unitid: 1, program_name: 'A', removed_column: 'x' }], ['id', 'unitid', 'program_name', 'status'])
  assert.match(sql, /insert into "public"\."college_program" \("id", "unitid", "program_name"\) overriding system value/)
  assert.match(sql, /on conflict \("id"\) do update set "unitid" = excluded\."unitid", "program_name" = excluded\."program_name"/)
  assert.ok(!/\(.*"removed_column".*\) overriding/.test(sql))
})

test('a table of only key columns restores with do nothing', () => {
  const [sql] = restoreStatements(table('college_major'), [{ unitid: 1, major_code: 'BUSN' }], ['unitid', 'major_code'])
  assert.match(sql, /on conflict \("unitid", "major_code"\) do nothing/)
})

test('an empty table needs no statement', () => assert.deepEqual(restoreStatements(table('athlete'), [], ['id']), []))

test('rows are split so no statement carries too much, and every row is kept once, in order', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, unitid: i, program_name: 'x'.repeat(100) }))
  const statements = restoreStatements(table('college_program'), rows, ['id', 'unitid', 'program_name'], { maxBytes: 3000 })
  assert.ok(statements.length > 3)
  const ids = statements.flatMap((s) => [...s.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])))
  assert.deepEqual(ids, rows.map((r) => r.id))
  assert.ok(statements.every((s) => s.length < 3600))
})

test('text that looks like a quote tag cannot break out of the data', () => {
  const [sql] = restoreStatements(table('athlete_guardian'), [{ id: 'g', full_name: 'Evil $bk0$ ; drop table x; --' }], ['id', 'full_name'])
  const tag = sql.match(/recordset\(null::public\."athlete_guardian", (\$bk\d+\$)/)[1]
  assert.notEqual(tag, '$bk0$')
  assert.equal(sql.split(tag).length, 3, 'the tag opens and closes the data exactly once')
})

test('statements are grouped into requests under the size limit without splitting one', () => {
  const statements = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'.repeat(1500)]
  const packs = packRequests(statements, 1000)
  assert.deepEqual(packs.map((p) => p.length), [2, 1, 1])
  assert.deepEqual(packs.flat(), statements)
})

test('the id counters are reset for exactly the identity tables', () => {
  const sql = sequenceStatements(TABLES)
  assert.equal(sql.length, 4)
  assert.ok(sql.every((s) => s.includes('setval(pg_get_serial_sequence')))
})

test('the export query returns the whole table in primary key order', () => {
  assert.match(exportQuery(table('athlete_major')), /order by t\."athlete_id", t\."major_code", t\."kind"/)
})

test('after a restore, the new project own club and team are removed only when nothing uses them', async () => {
  const { tidySeededRows } = await import('./lib/backup-lib.mjs')
  const club = '11111111-1111-4111-8111-111111111111'
  const team = '22222222-2222-4222-8222-222222222222'
  const [teams, clubs] = tidySeededRows([club], [team])
  assert.ok(teams.includes(`delete from public.team t where t.id <> all(array['${team}']::uuid[])`))
  assert.ok(teams.includes('not exists (select 1 from public.athlete'))
  assert.ok(teams.includes('not exists (select 1 from public.staff_team'))
  assert.ok(clubs.includes('not exists (select 1 from public.team'))
  assert.ok(clubs.includes('not exists (select 1 from public.app_user'))
  assert.throws(() => tidySeededRows(["x'; drop table athlete; --"], [team]), /not a valid id/)
})

test('database replies are read in both shapes the Supabase CLI prints', async () => {
  const { queryRows } = await import('./lib/cli-json.mjs')
  const rows = [{ n: 1, t: 'a {b} [c]' }]
  assert.deepEqual(queryRows(`Initialising login role...\n${JSON.stringify(rows, null, 2)}`), rows, 'plain array in an ordinary terminal')
  assert.deepEqual(queryRows(JSON.stringify({ boundary: 'x', rows, warning: 'w' })), rows, 'object when run by an assistant')
  assert.deepEqual(queryRows('[]'), [])
  assert.throws(() => queryRows('┌───┐\n│ n │\n└───┘'), /no JSON in the reply/)
  assert.throws(() => queryRows(''), /nothing/)
})
