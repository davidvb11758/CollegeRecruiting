// One-time load of the college master data from CollegeInfo\ into the LINKED Supabase project (DEV).
//
//   node scripts/load-colleges.mjs --verify   check what is already loaded against the CSVs; change nothing
//   node scripts/load-colleges.mjs --dry      read, clean and validate the CSVs; write the report; touch nothing
//   node scripts/load-colleges.mjs            load into EMPTY college tables, then verify
//   node scripts/load-colleges.mjs --reset    first delete the master college data (refused once any athlete has a list)
//
// Loads: conference, college, college_program, college_coach (master rows), college_major, zip_location.
// Lookups (division, major_category, state) already come from migrations. Audit rows are skipped for the bulk load
// (app.skip_audit); the load is described in CollegeInfo\LOAD-REPORT.md instead.
// Nothing here uses the secret key: SQL goes through `supabase db query --linked` as the project owner.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEV_REF = 'ewqocjaurrkamkhhwgll'
const DIR = 'CollegeInfo'
const SOURCE = 'Provided CSV (Oct 2026)'
const RANK_SEASON = 'Massey CSV, Oct 2026'
const FILES = [
  { file: 'ncaa_d1_vb_colleges_with_unitid.csv', division: 'NCAA_D1' },
  { file: 'ncaa_d2_vb_colleges_with_unitid.csv', division: 'NCAA_D2' },
  { file: 'ncaa_d3_vb_colleges_with_unitid.csv', division: 'NCAA_D3' },
  { file: 'NAIA_vb_colleges_with_unitid.csv', division: 'NAIA' },
  { file: 'njcaa_vb_colleges_with_unitid.csv', division: 'NJCAA' },
]
const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const VERIFY_ONLY = args.has('--verify')
const RESET = args.has('--reset')
const today = new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'collegeload-'))
let fileNo = 0
function runSql(sql) {
  const path = join(tmp, `q${++fileNo}.sql`)
  writeFileSync(path, sql)
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], {
    encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  })
  const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
  return json.rows ?? []
}

// ---------------------------------------------------------------------------------------------
// CSV reading (RFC 4180: quoted fields, doubled quotes, CRLF)
// ---------------------------------------------------------------------------------------------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}
const readCsv = (name) => parseCsv(readFileSync(join(DIR, name), 'utf8'))

// ---------------------------------------------------------------------------------------------
// SQL literals
// ---------------------------------------------------------------------------------------------

const lit = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`)
const num = (v) => {
  if (v === null || v === undefined || v === '') return 'null'
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${v}`)
  return String(n)
}

// ---------------------------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------------------------

const report = { cleaned: [], warnings: [] }
const note = (kind, msg) => { const line = `${kind}: ${msg}`; if (!report.cleaned.includes(line)) report.cleaned.push(line) }
const warn = (msg) => report.warnings.push(msg)

function cleanName(raw, where) {
  let v = raw.replace(/\s+/g, ' ').trim()
  const before = v
  v = v.replace(/(?:[\s,]*['‘’�]\d{2})+[\s,]*$/, '')                    // an alumni class-year suffix such as "'15"
  v = v.replace(/\s*Æ’\?\?\s*/g, ' - ')                           // a garbled dash ("Æ’??") in a campus name
  v = v.replace(/\s+/g, ' ').trim()
  if (v !== before) note('name', `${where}: "${before}" -> "${v}"`)
  return v
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
function cleanEmail(raw, where) {
  if (!raw) return null
  const parts = raw.split(/\s*(?:\/|\||;|,)\s*/).map((p) => p.trim()).filter(Boolean)
  let chosen = parts[0] ?? ''
  if (parts.length > 1) note('email', `${where}: several addresses "${raw}" -> kept the first (${chosen.toLowerCase()})`)
  if (/\s/.test(chosen)) { const fixed = chosen.replace(/\s+/g, ''); note('email', `${where}: removed spaces "${chosen}" -> "${fixed.toLowerCase()}"`); chosen = fixed }
  chosen = chosen.toLowerCase()
  if (!EMAIL.test(chosen)) { warn(`${where}: email "${raw}" is not usable; stored without an email`); return null }
  return chosen
}

const SELECTIVITY = { 'Highly selective': 'highly_selective', Selective: 'selective', 'Moderately selective': 'moderately_selective', Open: 'open' }
const CONTROL = { Public: 'public', 'Private nonprofit': 'private_nonprofit', 'Private for-profit': 'private_for_profit' }
const SETTING = { Urban: 'urban', Suburban: 'suburban', Rural: 'rural' }

// ---------------------------------------------------------------------------------------------
// Build the data set
// ---------------------------------------------------------------------------------------------

function build(stateCodes, majorCodes) {
  const colleges = [], programs = [], coaches = []
  const confVariants = new Map()                       // division|key -> Map(spelling -> count)
  const seenUnitid = new Set()
  let controlMismatch = 0

  for (const { file, division } of FILES) {
    for (const r of readCsv(file)) {
      const where = `${division} ${r.College_Name}`
      const unitid = Number(r.UNITID)
      if (!Number.isInteger(unitid) || unitid <= 0) { warn(`${where}: bad UNITID "${r.UNITID}"`); continue }
      if (seenUnitid.has(unitid)) { warn(`${where}: UNITID ${unitid} appears twice`); continue }
      seenUnitid.add(unitid)

      const state = stateCodes.get(r.State.toLowerCase())
      if (!state) warn(`${where}: unknown state "${r.State}"`)
      if (!/^\d{5}$/.test(r.zip)) warn(`${where}: ZIP "${r.zip}" is not 5 digits`)

      let control = CONTROL[r.ipeds_control] ?? null
      if (!control) { control = r.Type === 'Public' ? 'public' : 'private_nonprofit'; warn(`${where}: no IPEDS control; used the file's Type "${r.Type}"`) }
      if ((r.Type === 'Public') !== (control === 'public')) controlMismatch++

      colleges.push({
        unitid, name: cleanName(r.College_Name, where), city: r.City, state, zip: r.zip, latitude: r.latitude, longitude: r.longitude,
        website_url: r.website_url, cost_url: r.net_price_url, control, enrollment: r.undergrad_enrollment,
        enrollment_term: r.enrollment_term, campus_setting: SETTING[r.campus_setting] ?? null, locale_code: r.locale_code,
        selectivity: SELECTIVITY[r.selectivity] ?? null, admit_rate: r.admit_rate,
        tuition_in_state: r.tuition_in_state, tuition_out_state: r.tuition_out_of_state, tuition_year: r.tuition_year,
      })

      const rank = Number(r.MASSEY_Rank)
      if (!Number.isInteger(rank) || rank <= 0) warn(`${where}: missing or bad Massey rank "${r.MASSEY_Rank}"`)
      const confName = r.Conference.replace(/\s+/g, ' ').trim()
      if (confName) {
        const key = `${division}|${confName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        if (!confVariants.has(key)) confVariants.set(key, new Map())
        confVariants.get(key).set(confName, (confVariants.get(key).get(confName) ?? 0) + 1)
      }
      programs.push({
        unitid, division, confKey: confName ? `${division}|${confName.toLowerCase().replace(/[^a-z0-9]/g, '')}` : null,
        program_name: cleanName(r.College_Name, where), rank: Number.isInteger(rank) && rank > 0 ? rank : null, rating: r.MASSY_Rating,
      })

      // Coaches: head, assistant, recruiting coordinator. The same person in two slots becomes one row.
      const slots = [
        { title: 'head', name: cleanName(r.Head_Coach, where), email: cleanEmail(r.Head_coach_email, where) },
        { title: 'assistant', name: cleanName(r.Ast_coach_name, where), email: cleanEmail(r.Ast_coach_email, where) },
        { title: 'recruiting_coordinator', name: cleanName(r.Recruit_coach_name, where), email: cleanEmail(r.Recruit_coach_email, where) },
      ].filter((s) => s.name)
      const people = []
      for (const s of slots) {
        const same = people.find((p) => p.name.toLowerCase() === s.name.toLowerCase())
        if (same) {
          if (!same.email && s.email) same.email = s.email
          same.slots.push(s.title)
          if (s.title === 'recruiting_coordinator' && same.title !== 'head') same.title = 'recruiting_coordinator'
        } else people.push({ ...s, slots: [s.title] })
      }
      const merged = people.filter((p) => p.slots.length > 1).length
      if (merged) note('coach', `${where}: one person listed in several coach slots was loaded once (${people.filter((p) => p.slots.length > 1).map((p) => `${p.name}: ${p.slots.join('+')}`).join('; ')})`)
      const primary = people.find((p) => p.title === 'recruiting_coordinator') ?? people.find((p) => p.title === 'head') ?? people[0]
      for (const p of people) coaches.push({ unitid, division, full_name: p.name, title: p.title, email: p.email, primary: p === primary })
    }
  }

  // Conferences: one spelling per division (the most common one wins).
  const conferences = new Map(), confName = new Map()
  for (const [key, variants] of confVariants) {
    const [division] = key.split('|')
    const best = [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    if (variants.size > 1) note('conference', `${division}: spellings ${[...variants.keys()].map((v) => `"${v}"`).join(', ')} merged into "${best}"`)
    conferences.set(key, { division, name: best })
    confName.set(key, best)
  }
  for (const p of programs) p.conference = p.confKey ? confName.get(p.confKey) : null

  const majors = readCsv('college_major.csv').map((r) => ({ unitid: Number(r.unitid), code: r.category_code }))
  for (const m of majors) {
    if (!seenUnitid.has(m.unitid)) warn(`college_major: UNITID ${m.unitid} is not in the college files`)
    if (!majorCodes.has(m.code)) warn(`college_major: unknown category "${m.code}"`)
  }
  const zips = readCsv('zip_location.csv')
  for (const z of zips) if (!/^\d{5}$/.test(z.zip)) warn(`zip_location: bad ZIP "${z.zip}"`)

  if (controlMismatch) note('control', `${controlMismatch} rows where the file's Public/Private label disagrees with IPEDS; IPEDS value stored`)
  return { colleges, programs, coaches, conferences: [...conferences.values()], majors, zips }
}

// ---------------------------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------------------------

const PRE = "select set_config('app.skip_audit', '1', true);\n"
function chunks(items, size) { const out = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out }

function sqlBatches(d) {
  const b = []
  b.push(PRE + `insert into public.conference (division_code, name) values\n` +
    d.conferences.map((c) => `(${lit(c.division)}, ${lit(c.name)})`).join(',\n') + ';')
  for (const part of chunks(d.colleges, 400)) {
    b.push(PRE + `insert into public.college (unitid, name, city, state, zip, latitude, longitude, website_url, cost_url, control,
  enrollment, enrollment_term, campus_setting, locale_code, selectivity, admit_rate, tuition_in_state, tuition_out_state, tuition_year) values\n` +
      part.map((c) => `(${num(c.unitid)}, ${lit(c.name)}, ${lit(c.city)}, ${lit(c.state)}, ${lit(c.zip)}, ${num(c.latitude)}, ${num(c.longitude)}, ${lit(c.website_url)}, ${lit(c.cost_url)}, ${lit(c.control)},
  ${num(c.enrollment)}, ${lit(c.enrollment_term)}, ${lit(c.campus_setting)}, ${lit(c.locale_code)}, ${lit(c.selectivity)}, ${num(c.admit_rate)}, ${num(c.tuition_in_state)}, ${num(c.tuition_out_state)}, ${lit(c.tuition_year)})`).join(',\n') + ';')
  }
  for (const part of chunks(d.programs, 400)) {
    b.push(PRE + `insert into public.college_program (unitid, sport_code, program_type, division_code, conference_id, program_name, division_rank,
  division_rank_season, rating, last_verified_on, data_source)
select v.unitid::integer, 'volleyball', 'womens', v.division_code, cf.id, v.program_name, v.division_rank::integer,
  case when v.division_rank is null then null else ${lit(RANK_SEASON)} end, v.rating::numeric, date ${lit(today)}, ${lit(SOURCE)}
from (values\n` +
      part.map((p) => `(${num(p.unitid)}, ${lit(p.division)}, ${lit(p.conference)}, ${lit(p.program_name)}, ${num(p.rank)}, ${num(p.rating)})`).join(',\n') +
      `\n) as v(unitid, division_code, conference_name, program_name, division_rank, rating)
left join public.conference cf on cf.division_code = v.division_code and cf.name = v.conference_name;`)
  }
  for (const part of chunks(d.coaches, 500)) {
    b.push(PRE + `insert into public.college_coach (program_id, full_name, title, email, is_primary_recruiting_contact, employment_status, last_verified_on, source)
select p.id, v.full_name, v.title::public.coach_title, v.email, v.is_primary::boolean, 'current', date ${lit(today)}, ${lit(SOURCE)}
from (values\n` +
      part.map((c) => `(${num(c.unitid)}, ${lit(c.division)}, ${lit(c.full_name)}, ${lit(c.title)}, ${lit(c.email)}, ${c.primary ? "'true'" : "'false'"})`).join(',\n') +
      `\n) as v(unitid, division_code, full_name, title, email, is_primary)
join public.college_program p on p.unitid = v.unitid::integer and p.division_code = v.division_code;`)
  }
  for (const part of chunks(d.majors, 5000)) {
    b.push(PRE + `insert into public.college_major (unitid, major_code) values\n` + part.map((m) => `(${num(m.unitid)}, ${lit(m.code)})`).join(',\n') + ';')
  }
  for (const part of chunks(d.zips, 5000)) {
    b.push(PRE + `insert into public.zip_location (zip, latitude, longitude) values\n` + part.map((z) => `(${lit(z.zip)}, ${num(z.latitude)}, ${num(z.longitude)})`).join(',\n') + ';')
  }
  return b
}

// ---------------------------------------------------------------------------------------------
// Verification (runs after a load)
// ---------------------------------------------------------------------------------------------

function seededRandom(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }

function verify(d) {
  const results = []
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' (' + detail + ')' : ''}`) }
  const one = (sql) => Object.values(runSql(sql)[0] ?? {})[0]

  const expect = {
    college: d.colleges.length, college_program: d.programs.length, conference: d.conferences.length,
    college_coach: d.coaches.length, college_major: d.majors.length, zip_location: d.zips.length,
  }
  for (const [t, n] of Object.entries(expect)) {
    const got = Number(one(`select count(*) from public.${t}${t === 'college_coach' ? ' where owner_athlete_id is null' : ''}`))
    check(`row count ${t}`, got === n, `${got} loaded, ${n} expected`)
  }
  check('every program has a college and a division',
    Number(one(`select count(*) from public.college_program p left join public.college c on c.unitid = p.unitid where c.unitid is null`)) === 0)
  check('no program without a conference except where the file had none',
    Number(one(`select count(*) from public.college_program where conference_id is null`)) === d.programs.filter((p) => !p.conference).length)
  check('no coach listed twice in a program',
    Number(one(`select count(*) from (select program_id, lower(full_name) from public.college_coach group by 1, 2 having count(*) > 1) x`)) === 0)
  const shared = Number(one(`select count(*) from (select program_id, email from public.college_coach where email is not null group by 1, 2 having count(*) > 1) x`))
  check('programs whose coaches share one team inbox (expected, informational)', true, `${shared} programs; email is deliberately not unique`)
  check('at most one primary recruiting contact per program',
    Number(one(`select count(*) from (select program_id from public.college_coach where is_primary_recruiting_contact group by 1 having count(*) > 1) x`)) === 0)
  check('every program with a coach has a primary contact',
    Number(one(`select count(*) from public.college_program p where exists (select 1 from public.college_coach k where k.program_id = p.id)
                and not exists (select 1 from public.college_coach k where k.program_id = p.id and k.is_primary_recruiting_contact)`)) === 0)
  check('no audit rows were written by the bulk load',
    Number(one(`select count(*) from public.change_history where table_name in ('college','college_program','college_coach','college_major') and changed_at > now() - interval '1 hour'`)) === 0)

  // Bands: all ranked, six bands present in every division, and each band holds roughly its share.
  const bands = runSql(`select division_code, band, count(*) as n from public.program_competitiveness group by 1, 2 order by 1, 2`)
  const byDiv = {}
  for (const r of bands) (byDiv[r.division_code] ??= {})[r.band] = Number(r.n)
  for (const [div, m] of Object.entries(byDiv)) {
    const total = Object.values(m).reduce((a, b) => a + b, 0)
    const dist = [1, 2, 3, 4, 5, 6].map((k) => m[k] ?? 0)
    check(`bands ${div}`, !m.null && dist.every((n) => n > 0) && dist[0] <= Math.ceil(total * 0.1) + 1, `${dist.join('/')} of ${total}`)
  }

  // Spot check 20 random colleges field by field against the CSV.
  const rnd = seededRandom(20261026)
  const picks = [...d.colleges].sort(() => rnd() - 0.5).slice(0, 20)
  const ids = picks.map((c) => c.unitid).join(',')
  const rows = runSql(`select c.unitid, c.name, c.city, c.state, c.zip, c.latitude::text, c.longitude::text, c.enrollment, c.control::text,
      p.division_code, p.division_rank, cf.name as conference,
      (select k.full_name from public.college_coach k where k.program_id = p.id and k.title = 'head' limit 1) as head
    from public.college c join public.college_program p on p.unitid = c.unitid left join public.conference cf on cf.id = p.conference_id
    where c.unitid in (${ids})`)
  let bad = 0
  for (const c of picks) {
    const db = rows.find((r) => Number(r.unitid) === c.unitid)
    const prog = d.programs.find((p) => p.unitid === c.unitid)
    const head = d.coaches.find((k) => k.unitid === c.unitid && k.title === 'head')
    const problems = []
    if (!db) problems.push('missing')
    else {
      if (db.name !== c.name) problems.push('name')
      if (db.city !== c.city) problems.push('city')
      if (db.state !== c.state) problems.push('state')
      if (db.zip !== c.zip) problems.push('zip')
      if (Number(db.latitude) !== Number(c.latitude) || Number(db.longitude) !== Number(c.longitude)) problems.push('lat/long')
      if (Number(db.enrollment) !== Number(c.enrollment)) problems.push('enrollment')
      if (db.control !== c.control) problems.push('control')
      if (db.division_code !== prog.division) problems.push('division')
      if (Number(db.division_rank) !== prog.rank) problems.push('rank')
      if ((db.conference ?? null) !== (prog.conference ?? null)) problems.push('conference')
      if ((db.head ?? null) !== (head?.full_name ?? null)) problems.push('head coach')
    }
    if (problems.length) { bad++; console.log(`      ${c.unitid} ${c.name}: ${problems.join(', ')}`) }
  }
  check('spot check of 20 random colleges against the CSV', bad === 0, `${20 - bad}/20 match`)

  // Search speed over the full set.
  const plan = runSql(`explain (analyze, timing off) select * from public.program_search`)
  const ms = Number((plan.map((r) => Object.values(r)[0]).find((l) => /Execution Time/.test(String(l))) ?? '').match(/([\d.]+) ms/)?.[1] ?? NaN)
  check('program_search over all programs runs in under 2 seconds', ms < 2000, `${ms} ms`)
  return results
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function writeReport(d, results, mode) {
  const byDiv = {}
  for (const p of d.programs) byDiv[p.division] = (byDiv[p.division] ?? 0) + 1
  const lines = [
    '# College data load report', '',
    `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`scripts/load-colleges.mjs\` (${mode}).`, '',
    '## What was loaded', '',
    '| Table | Rows |', '|---|---|',
    `| conference | ${d.conferences.length} |`, `| college | ${d.colleges.length} |`, `| college_program | ${d.programs.length} (${Object.entries(byDiv).map(([k, v]) => `${k} ${v}`).join(', ')}) |`,
    `| college_coach (shared) | ${d.coaches.length} |`, `| college_major | ${d.majors.length} |`, `| zip_location | ${d.zips.length} |`, '',
    'Every program is a women\'s volleyball program with `last_verified_on` = load date and source "' + SOURCE + '". Massey rank goes to `division_rank` (season label "' + RANK_SEASON + '"); the Massey rating goes to `rating`; the Tier column is not imported. The primary recruiting contact is the recruiting coordinator if there is one, otherwise the head coach.', '',
    '## Cleaning applied (' + report.cleaned.length + ')', '', ...report.cleaned.map((c) => `- ${c}`), '',
    '## Warnings (' + report.warnings.length + ')', '', ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ['None.']), '',
  ]
  if (results) lines.push('## Checks after the load', '', ...results.map((r) => `- ${r.ok ? 'PASS' : '**FAIL**'}: ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`), '')
  writeFileSync(join(DIR, 'LOAD-REPORT.md'), lines.join('\r\n'))
}

try {
  const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
  if (ref !== DEV_REF) throw new Error(`Linked project is ${ref}, not DEV (${DEV_REF}). Refusing to load.`)
  console.log(`Linked project: ${ref} (DEV)`)

  const stateCodes = new Map(runSql('select code, name from public.state').map((r) => [r.name.toLowerCase(), r.code]))
  const majorCodes = new Set(runSql('select code from public.major_category').map((r) => r.code))
  const d = build(stateCodes, majorCodes)
  console.log(`Read: ${d.colleges.length} colleges, ${d.programs.length} programs, ${d.coaches.length} coaches, ${d.conferences.length} conferences, ${d.majors.length} college-major links, ${d.zips.length} ZIPs`)
  console.log(`Cleaning actions: ${report.cleaned.length}; warnings: ${report.warnings.length}`)
  for (const w of report.warnings) console.log('  WARNING: ' + w)
  if (report.warnings.length) throw new Error('Fix the warnings above (or the CSVs) before loading.')
  if (d.colleges.length !== 1662) throw new Error(`Expected 1,662 colleges, found ${d.colleges.length}`)

  if (DRY) { writeReport(d, null, 'dry run, nothing loaded'); console.log('Dry run complete. Report written to CollegeInfo\\LOAD-REPORT.md'); process.exit(0) }

  if (VERIFY_ONLY) {
    const results = verify(d)
    writeReport(d, results, 'verify only')
    if (results.some((r) => !r.ok)) process.exitCode = 1
    process.exit(process.exitCode ?? 0)
  }

  const existing = Number(Object.values(runSql('select count(*) from public.college')[0])[0])
  if (existing > 0) {
    if (!RESET) throw new Error(`The college table already has ${existing} rows. Use --reset to replace the master college data (only possible before athletes have lists).`)
    const lists = Number(Object.values(runSql('select count(*) from public.athlete_college')[0])[0])
    if (lists > 0) throw new Error(`Refusing --reset: ${lists} list entries already point at programs.`)
    console.log('Resetting master college data ...')
    runSql(PRE + `delete from public.college_coach; delete from public.college_major; delete from public.college_program;
      delete from public.college; delete from public.conference; delete from public.zip_location;`)
  }

  const batches = sqlBatches(d)
  console.log(`Loading in ${batches.length} batches ...`)
  batches.forEach((sql, i) => { runSql(sql); process.stdout.write(`  ${i + 1}/${batches.length}\r`) })
  console.log('\nLoaded. Verifying ...')
  const results = verify(d)
  writeReport(d, results, 'loaded')
  if (results.some((r) => !r.ok)) { console.error('Some checks failed. See CollegeInfo\\LOAD-REPORT.md'); process.exitCode = 1 }
  else console.log('All checks passed. Report written to CollegeInfo\\LOAD-REPORT.md')
} catch (e) {
  console.error(String(e.stdout ? e.stdout + '\n' + (e.stderr ?? '') : e.message ?? e).slice(0, 3000))
  process.exitCode = 1
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
