// Dry run: runs every migration that is NOT yet on the linked project inside one transaction and rolls it back.
// Optionally also runs the test files (their begin/rollback lines are stripped and runtests() runs last).
// Nothing is left in the database. Usage: node scripts/db-dryrun.mjs [--tests]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const withTests = process.argv.includes('--tests')
const run = (args) => execFileSync('npx', ['supabase', ...args], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
const parse = (out) => JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))

const listed = parse(run(['migration', 'list', '--linked'])).migrations
const applied = new Set(listed.filter((m) => m.remote).map((m) => m.local ?? m.remote))
const pending = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && !applied.has(f.slice(0, 14)))
  .sort()
console.log('Pending migrations:', pending.length ? pending.join(', ') : '(none)')

let sql = 'begin;\n'
for (const f of pending) sql += `\n-- >>> ${f}\n` + readFileSync(join('supabase/migrations', f), 'utf8') + '\n'

if (withTests) {
  sql += 'create extension if not exists pgtap with schema extensions;\n'
  sql += readFileSync('supabase/tests/helpers.sql', 'utf8') + '\n'
  const tests = readdirSync('supabase/tests').filter((f) => f.endsWith('.test.sql')).sort()
  for (const f of tests) {
    const body = readFileSync(join('supabase/tests', f), 'utf8')
      .replace(/^begin;\s*$/gim, '')
      .replace(/^rollback;\s*$/gim, '')
      .replace(/^select \* from runtests\([^)]*\);\s*$/gim, '')
    sql += `\n-- >>> test ${f}\n` + body + '\n'
  }
  sql += "select * from runtests('tests'::name);\n"
} else {
  sql += "select 'dry run ok: ' || count(*) as result from pg_tables where schemaname = 'public';\n"
}
sql += 'rollback;\n'

const tmp = mkdtempSync(join(tmpdir(), 'dryrun-'))
const file = join(tmp, 'dryrun.sql')
writeFileSync(file, sql)
try {
  const out = run(['db', 'query', '--linked', '-f', file])
  const rows = (parse(out).rows ?? []).flatMap((r) => Object.values(r)).map(String)
  for (const r of rows) console.log(r)
  const bad = rows.filter((l) => /^\s*not ok/i.test(l) || /Looks like you failed/i.test(l))
  if (bad.length) process.exit(1)
} catch (e) {
  console.error([e.stdout, e.stderr, e.message].filter(Boolean).join('\n').slice(0, 4000))
  process.exit(1)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
