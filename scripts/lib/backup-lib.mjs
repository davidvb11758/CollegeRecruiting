// Pure helpers for scripts/data-backup.mjs: which tables a backup holds, how a restore is written, and how people are
// matched between the old project and the new one. No database access here, so it can be unit tested.

/**
 * Every table whose contents are worth keeping, in the order a restore must fill them (parents before children).
 * Not backed up, because migrations or a script recreate them exactly: the lookup lists (division, state, ...) and the
 * ZIP table. College data IS backed up because staff edit it and the ids are referenced by athletes' lists.
 * pk = the primary key, used to order rows and to make a restore safe to repeat.
 */
export const TABLES = [
  { name: 'club', pk: ['id'] },
  { name: 'team', pk: ['id'] },
  { name: 'app_setting', pk: ['key'] },
  { name: 'conference', pk: ['id'], identity: true },
  { name: 'college', pk: ['unitid'] },
  { name: 'college_major', pk: ['unitid', 'major_code'] },
  { name: 'college_program', pk: ['id'], identity: true },
  { name: 'app_user', pk: ['user_id'] },
  { name: 'staff_profile', pk: ['user_id'] },
  { name: 'staff_team', pk: ['staff_user_id', 'team_id'] },
  { name: 'athlete', pk: ['id'] },
  { name: 'athlete_athletic', pk: ['athlete_id'] },
  { name: 'athlete_academic', pk: ['athlete_id'] },
  { name: 'athlete_preference', pk: ['athlete_id'] },
  { name: 'athlete_target_division', pk: ['athlete_id', 'division_code'] },
  { name: 'athlete_major', pk: ['athlete_id', 'major_code', 'kind'] },
  { name: 'athlete_guardian', pk: ['id'] },
  { name: 'athlete_video_link', pk: ['id'] },
  { name: 'athlete_staff_assignment', pk: ['id'] },
  { name: 'college_coach', pk: ['id'], identity: true },
  { name: 'athlete_college', pk: ['id'] },
  { name: 'activity_entry', pk: ['id'] },
  { name: 'next_step', pk: ['id'] },
  { name: 'athlete_note', pk: ['id'] },
  { name: 'athlete_note_dismissal', pk: ['note_id', 'user_id'] },
  { name: 'change_history', pk: ['id'], identity: true },
]

/** Columns that hold a login's id. A restore into a new project must translate these to the new ids. */
export const USER_COLUMNS = [
  'user_id', 'staff_user_id', 'created_by', 'updated_by', 'assigned_by', 'entered_by', 'deleted_by', 'completed_by', 'verified_by', 'changed_by', 'sender_user_id',
]

/** Columns that must not be empty, so a login that cannot be matched stops the restore instead of losing the row. */
const REQUIRED_USER_COLUMNS = new Set(['user_id', 'staff_user_id', 'sender_user_id'])

const q = (name) => `"${name.replaceAll('"', '""')}"`

/** SQL that returns one row, one column ("data"): the whole table as a JSON array in primary-key order. */
export function exportQuery(table) {
  const order = table.pk.map((c) => `t.${q(c)}`).join(', ')
  return `select coalesce(jsonb_agg(to_jsonb(t) order by ${order}), '[]'::jsonb) as data from public.${q(table.name)} t;`
}

/**
 * old login id -> new login id, matched by email address (case-insensitive).
 * accounts: [{ id, email }] from the backup; present: [{ id, email }] from the project being restored into.
 * Returns { map, missing } where missing lists the emails with no login in the new project.
 */
export function matchAccounts(accounts, present) {
  const byEmail = new Map(present.map((p) => [String(p.email).toLowerCase(), p.id]))
  const map = new Map()
  const missing = []
  for (const a of accounts) {
    const id = byEmail.get(String(a.email).toLowerCase())
    if (id) map.set(a.id, id)
    else missing.push(a.email)
  }
  return { map, missing }
}

/**
 * Rewrites the login ids in one table's rows. An id that cannot be translated becomes null in an optional column
 * ("created by"), and throws in a required one. Returns new rows; the input is not changed.
 */
export function remapRows(tableName, rows, map) {
  return rows.map((row) => {
    const out = { ...row }
    for (const col of USER_COLUMNS) {
      if (!(col in out) || out[col] == null) continue
      const next = map.get(out[col])
      if (next) out[col] = next
      else if (REQUIRED_USER_COLUMNS.has(col)) throw new Error(`${tableName}.${col} holds a login that is not in the new project`)
      else out[col] = null
    }
    return out
  })
}

/**
 * Brings rows from an older backup up to today's table shapes. An activity entry used to name one coach (coach_id);
 * it now names a list (coach_ids). Returns new rows; the input is not changed.
 */
export function upgradeLegacyRows(tableName, rows) {
  if (tableName !== 'activity_entry') return rows
  return rows.map((row) => {
    if ('coach_ids' in row || !('coach_id' in row)) return row
    const { coach_id: coachId, ...rest } = row
    return { ...rest, coach_ids: coachId == null ? [] : [coachId] }
  })
}

/** A dollar-quote tag that does not appear in the text. */
function tagFor(text) {
  let n = 0
  while (text.includes(`$bk${n}$`)) n++
  return `$bk${n}$`
}

/**
 * The statements that put one table's rows back. Safe to repeat: a row that already exists is updated to match.
 * columns = the table's real (non-generated) columns in the project being restored into.
 * Rows are split so that no statement carries more than maxBytes of data (the database API refuses requests over ~3 MB).
 * schema = where to write; "public" for a real restore, a scratch schema for a rehearsal.
 */
export function restoreStatements(table, rows, columns, { schema = 'public', maxBytes = 900_000 } = {}) {
  if (rows.length === 0) return []
  const present = columns.filter((c) => c in rows[0])
  const nonKey = present.filter((c) => !table.pk.includes(c))
  const list = present.map(q).join(', ')
  const conflict =
    nonKey.length === 0 ? 'do nothing' : `do update set ${nonKey.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`
  const statement = (batch) => {
    const json = JSON.stringify(batch)
    const tag = tagFor(json)
    return (
      `insert into ${q(schema)}.${q(table.name)} (${list}) overriding system value
` +
      `select ${list} from jsonb_populate_recordset(null::public.${q(table.name)}, ${tag}${json}${tag}::jsonb)
` +
      `on conflict (${table.pk.map(q).join(', ')}) ${conflict};`
    )
  }
  const out = []
  let batch = []
  let size = 0
  for (const row of rows) {
    const bytes = JSON.stringify(row).length + 1
    if (batch.length && size + bytes > maxBytes) {
      out.push(statement(batch))
      batch = []
      size = 0
    }
    batch.push(row)
    size += bytes
  }
  if (batch.length) out.push(statement(batch))
  return out
}

/** Groups statements into requests of at most maxBytes each (one statement is never split). */
export function packRequests(statements, maxBytes = 1_800_000) {
  const out = []
  let current = []
  let size = 0
  for (const s of statements) {
    if (current.length && size + s.length > maxBytes) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(s)
    size += s.length
  }
  if (current.length) out.push(current)
  return out
}

/** After rows were inserted with their old ids, the counters that hand out new ids must start after the largest one. */
export function sequenceStatements(tables) {
  return tables
    .filter((t) => t.identity)
    .map((t) => {
      const col = q(t.pk[0])
      const tbl = `public.${q(t.name)}`
      return `select setval(pg_get_serial_sequence('${tbl}', '${t.pk[0]}'), coalesce((select max(${col}) from ${tbl}), 1), (select count(*) > 0 from ${tbl}));`
    })
}

/** Switch the table's own triggers off for the restore (audit, stamping, age rule...), and back on afterwards. */
export const triggersOff = (tables) => tables.map((t) => `alter table public.${q(t.name)} disable trigger user;`)
export const triggersOn = (tables) => tables.map((t) => `alter table public.${q(t.name)} enable trigger user;`)

/** One fingerprint per table: row count and a hash of every row, so before and after can be compared without reading data. */
export function fingerprintSelect(tables, schema = 'public') {
  return tables
    .map((t) => {
      const order = t.pk.map((c) => `x.${q(c)}`).join(', ')
      return `select '${t.name}' as table_name, count(*) as n, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by ${order}), '')) as h from ${q(schema)}.${q(t.name)} x`
    })
    .join('\nunion all\n')
}
export const fingerprintSql = (tables, into, schema = 'public') => `create temp table ${into} as\n${fingerprintSelect(tables, schema)};`

/** Compares two schemas' fingerprints in one query: table, rows in each, identical or not. */
export const compareSql = (tables, schemaA, schemaB) =>
  `select a.table_name, a.n as rows_before, b.n as rows_after, (a.h = b.h) as identical\n` +
  `from (${fingerprintSelect(tables, schemaA)}) a join (${fingerprintSelect(tables, schemaB)}) b using (table_name) order by a.table_name;`

/** Tables a rehearsal restores inside one rolled-back transaction. The big college tables are rehearsed in a scratch copy instead. */
export const MASTER_BASE = ['conference', 'college', 'college_major', 'college_program']

/** A scratch copy of every backed-up table: same columns, defaults, identity, keys and checks; no foreign keys, no triggers. */
export const SCRATCH_SCHEMA = 'restore_rehearsal'
export const scratchCreateSql = (tables) => [
  `drop schema if exists ${SCRATCH_SCHEMA} cascade;`,
  `create schema ${SCRATCH_SCHEMA};`,
  ...tables.map((t) => `create table ${SCRATCH_SCHEMA}.${q(t.name)} (like public.${q(t.name)} including all);`),
]
export const scratchDropSql = `drop schema if exists ${SCRATCH_SCHEMA} cascade;`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A new project already contains its own club and team (created by the first migration, with new ids). After a restore
 * the people point at the backed-up ones, so the seeded pair would be a duplicate. This removes a seeded row only when
 * nothing refers to it, so it can never break a link or remove something in use.
 */
export function tidySeededRows(clubIds, teamIds) {
  for (const id of [...clubIds, ...teamIds]) if (!UUID.test(String(id))) throw new Error('The backup holds a club or team id that is not a valid id.')
  const list = (ids) => `array[${ids.map((id) => `'${id}'`).join(', ')}]::uuid[]`
  return [
    `delete from public.team t where t.id <> all(${list(teamIds)}) and not exists (select 1 from public.athlete a where a.team_id = t.id) and not exists (select 1 from public.staff_team s where s.team_id = t.id);`,
    `delete from public.club c where c.id <> all(${list(clubIds)}) and not exists (select 1 from public.team t where t.club_id = c.id) and not exists (select 1 from public.app_user u where u.club_id = c.id);`,
  ]
}
