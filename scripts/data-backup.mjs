// Manual data backups (decision P4: no automatic backups on the free plan, so the administrator takes exports).
//
//   npm run backup:data                          export every table of the LINKED project to backups/<time>-<project>/
//   npm run backup:check -- backups/<folder>     REHEARSE a restore on DEV and compare every table with what is live.
//                                                Nothing is changed: part 1 is rolled back, part 2 uses a scratch copy
//   npm run backup:restore -- backups/<folder> --project <ref> [--yes]
//                                                restore into an empty, migrated project (disaster recovery). Without --yes
//                                                it only reports what it would do. Safe to run again if it stops half way.
//
// The files hold real data about minors. backups/ is git-ignored. Keep copies only on encrypted or access-controlled
// storage, and never send them through chat, email or the repo. Login passwords are NOT in a backup: after a restore
// into a new project each person signs up again with the same email (or uses "Forgot password") and is matched by email.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  MASTER_BASE,
  SCRATCH_SCHEMA,
  TABLES,
  compareSql,
  exportQuery,
  fingerprintSql,
  matchAccounts,
  packRequests,
  remapRows,
  restoreStatements,
  scratchCreateSql,
  scratchDropSql,
  sequenceStatements,
  tidySeededRows,
  triggersOff,
  triggersOn,
} from './lib/backup-lib.mjs'

const DEV_REF = 'ewqocjaurrkamkhhwgll'
const linkedRef = () => readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const tmp = mkdtempSync(join(tmpdir(), 'backup-'))
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }))

/** Runs SQL on the linked project and returns the rows of the last statement. */
function query(sql) {
  const path = join(tmp, 'q.sql')
  writeFileSync(path, sql)
  let out
  try {
    out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30 })
  } catch (e) {
    const text = `${e.stderr ?? ''}${e.stdout ?? ''}`.replace(/\\+"/g, '"')
    const line = text.split('\n').find((l) => /ERROR|error/.test(l)) ?? text.slice(0, 300)
    throw new Error(`The database refused the request: ${line.slice(0, 400)}`)
  }
  return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows ?? []
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function loadBackup(dir) {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error(`${dir} is not a backup folder (no manifest.json)`)
  const manifest = readJson(manifestPath)
  const data = {}
  for (const t of TABLES) {
    const file = join(dir, `${t.name}.json`)
    if (!existsSync(file)) throw new Error(`The backup is missing ${t.name}.json`)
    data[t.name] = readJson(file)
    const expected = manifest.tables?.[t.name]
    if (expected !== data[t.name].length) throw new Error(`${t.name}.json has ${data[t.name].length} rows but the manifest says ${expected}. The backup is damaged.`)
  }
  return { manifest, data }
}

function presentAccounts() {
  return query('select u.id::text as id, u.email from auth.users u join public.app_user a on a.user_id = u.id')
}

function columnsByTable() {
  const rows = query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' and is_generated = 'NEVER' order by table_name, ordinal_position",
  )
  const out = {}
  for (const r of rows) (out[r.table_name] ??= []).push(r.column_name)
  return out
}

/** Translates login ids to the ones in this project. Stops, listing the emails, when someone has not signed up here yet. */
function prepareRows({ manifest, data }) {
  const { map, missing } = matchAccounts(manifest.accounts, presentAccounts())
  if (missing.length) {
    throw new Error(`${missing.length} login(s) in the backup do not exist in this project yet. They must sign up first (same email):\n  ${missing.join('\n  ')}`)
  }
  return Object.fromEntries(TABLES.map((t) => [t.name, remapRows(t.name, data[t.name], map)]))
}

/** One request that writes some tables with their own triggers switched off, all or nothing. */
const guarded = (tables, statements) =>
  ['begin;', "select set_config('app.skip_audit', '1', true);", ...triggersOff(tables), ...statements, ...triggersOn(tables), 'commit;'].join('\n')

function exportAll() {
  const ref = linkedRef()
  const dir = resolve('backups', `${stamp()}-${ref}`)
  mkdirSync(dir, { recursive: true })
  const manifest = { createdAt: new Date().toISOString(), project: ref, tables: {}, accounts: [] }
  console.log(`Exporting project ${ref}${ref === DEV_REF ? ' (DEV)' : ''} to ${dir}`)
  for (const t of TABLES) {
    const rows = query(exportQuery(t))
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    writeFileSync(join(dir, `${t.name}.json`), JSON.stringify(data))
    manifest.tables[t.name] = data.length
    console.log(`  ${t.name.padEnd(26)} ${String(data.length).padStart(6)} rows`)
  }
  manifest.accounts = presentAccounts()
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nDone. ${manifest.accounts.length} accounts listed by email (no passwords are saved).`)
  console.log('This folder holds real data about minors: keep it on encrypted storage and never share it.')
  console.log(`Prove it can be restored with:  npm run backup:check -- ${dir.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')}`)
}

function check(dir) {
  const ref = linkedRef()
  if (ref !== DEV_REF) throw new Error(`The rehearsal runs only on DEV (${DEV_REF}); the linked project is ${ref}.`)
  const backup = loadBackup(dir)
  const rows = prepareRows(backup)
  const columns = columnsByTable()
  const results = []

  // Part 1: the athlete, staff and coach data, restored into the real tables inside one transaction that is rolled back.
  const part1 = TABLES.filter((t) => !MASTER_BASE.includes(t.name))
  const emptied = [...part1].reverse().filter((t) => !['club', 'team', 'app_setting'].includes(t.name))
  const statements = part1.flatMap((t) => restoreStatements(t, rows[t.name], columns[t.name] ?? []))
  const sql = [
    'begin;',
    "select set_config('app.skip_audit', '1', true);",
    fingerprintSql(part1, '_before'),
    ...triggersOff(part1),
    ...emptied.map((t) => `delete from public."${t.name}";`),
    ...statements,
    ...sequenceStatements(part1),
    ...triggersOn(part1),
    fingerprintSql(part1, '_after'),
    'select b.table_name, b.n as rows_before, a.n as rows_after, (b.h = a.h) as identical from _before b join _after a using (table_name) order by b.table_name;',
    'rollback;',
  ].join('\n')
  if (sql.length > 2_400_000) throw new Error('The rehearsal request is too large for the database API.')
  console.log('Part 1 of 2: restoring athlete, staff and coach data into the real tables (rolled back at the end)...')
  results.push(...query(sql))

  // Part 2: every table, including the college data, restored into a scratch copy in several requests, then compared.
  console.log('Part 2 of 2: restoring every table into a scratch copy and comparing...')
  try {
    query(scratchCreateSql(TABLES).join('\n'))
    for (const t of TABLES) {
      const requests = packRequests(restoreStatements(t, rows[t.name], columns[t.name] ?? [], { schema: SCRATCH_SCHEMA }))
      for (const request of requests) query(request.join('\n'))
    }
    results.push(...query(compareSql(TABLES, 'public', SCRATCH_SCHEMA)).filter((r) => MASTER_BASE.includes(r.table_name)))
  } finally {
    try {
      query(scratchDropSql)
    } catch {
      console.error(`Could not remove the scratch schema "${SCRATCH_SCHEMA}". It is harmless; the next run removes it.`)
    }
  }

  let bad = 0
  for (const r of results) {
    const ok = r.identical === true
    if (!ok) bad++
    console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${String(r.table_name).padEnd(26)} live ${String(r.rows_before).padStart(6)}  restored ${String(r.rows_after).padStart(6)}`)
  }
  console.log(bad ? `\nFAILED: ${bad} table(s) differ after the restore.` : `\nPASSED: all ${results.length} tables come back identical. Nothing was changed in DEV.`)
  process.exit(bad ? 1 : 0)
}

function restore(dir, args) {
  const ref = linkedRef()
  const wanted = args[args.indexOf('--project') + 1]
  if (!args.includes('--project') || wanted !== ref) {
    throw new Error(`Add "--project ${ref}" to confirm you mean the linked project (${ref}).`)
  }
  const backup = loadBackup(dir)
  const existing = Number(query('select count(*) as n from public.athlete')[0].n)
  if (existing > 0) throw new Error(`This project already has ${existing} athlete(s). A restore goes into an empty, freshly migrated project only.`)
  const rows = prepareRows(backup)
  const columns = columnsByTable()
  console.log(`Backup from ${backup.manifest.createdAt} (project ${backup.manifest.project}) into ${ref}:`)
  for (const t of TABLES) console.log(`  ${t.name.padEnd(26)} ${String(backup.manifest.tables[t.name]).padStart(6)} rows`)
  if (!args.includes('--yes')) {
    console.log('\nNothing changed. Add --yes to restore.')
    return
  }
  // One request per table chunk, each all-or-nothing. A stop half way is safe: fix the cause and run the same command again.
  let current = ''
  try {
    for (const t of TABLES) {
      current = t.name
      for (const request of packRequests(restoreStatements(t, rows[t.name], columns[t.name] ?? []))) query(guarded([t], request))
      console.log(`  restored ${t.name}`)
    }
    current = 'the id counters'
    query(sequenceStatements(TABLES).join('\n'))
    current = 'the duplicate club and team of the new project'
    query(tidySeededRows(rows.club.map((c) => c.id), rows.team.map((t) => t.id)).join('\n'))
  } catch (e) {
    throw new Error(`The restore stopped at ${current}. Nothing is half-written inside a table; fix the problem and run the same command again.\n${e.message}`)
  }
  console.log('\nRestored. Check the app, then see guides/RUNBOOK.md for the follow-up steps.')
}

const [command = 'export', ...rest] = process.argv.slice(2)
try {
  if (command === 'export') exportAll()
  else if (command === 'check') check(resolve(rest[0] ?? ''))
  else if (command === 'restore') restore(resolve(rest[0] ?? ''), rest)
  else throw new Error(`Unknown command "${command}". Use export, check or restore.`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
