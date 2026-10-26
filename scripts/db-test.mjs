// Runs the pgTAP files in supabase/tests against the LINKED project without Docker.
// Each file is sent through `supabase db query --linked` (Management API). pgTAP is created inside the
// file's own transaction, which every test file rolls back, so nothing is left behind in the database.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testDir = 'supabase/tests'
const files = readdirSync(testDir).filter((f) => f.endsWith('.test.sql')).sort()
if (files.length === 0) {
  console.error('No test files found in ' + testDir)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'dbtest-'))
let failed = 0
let total = 0

try {
  for (const file of files) {
    const sql = readFileSync(join(testDir, file), 'utf8')
    if (!/^begin;\s*$/im.test(sql) || !/^rollback;\s*$/im.test(sql)) {
      console.error(`${file}: must start with "begin;" and end with "rollback;"`)
      failed++
      continue
    }
    const prepared = sql.replace(/^begin;\s*$/im, 'begin;\ncreate extension if not exists pgtap with schema extensions;')
    const path = join(tmp, file)
    writeFileSync(path, prepared)

    let out
    try {
      out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], {
        encoding: 'utf8',
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      console.error(`${file}: query failed\n${e.stderr || e.message}`)
      failed++
      continue
    }

    const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    const lines = (json.rows ?? []).flatMap((row) => Object.values(row)).map(String)
    const bad = lines.filter((l) => /^not ok/i.test(l) || /^# Looks like/i.test(l))
    total += lines.filter((l) => /^(not )?ok/i.test(l)).length
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${file}`)
    for (const l of lines) console.log('   ' + l)
    if (bad.length) failed++
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${total} checks, ${failed} file(s) failed`)
process.exit(failed ? 1 : 0)
