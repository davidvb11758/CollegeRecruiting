import { client, ok, type Row } from './dbClient'

/** One row per athlete the signed-in coordinator may see (an administrator sees everyone). Row-level security does the limiting. */
export async function fetchRoster(): Promise<Row[]> {
  return ok<Row[]>(await client().from('staff_roster').select('*').order('last_name').order('first_name'))
}

export type HistoryItem = {
  id: number
  changedAt: string
  /** A person's name, "Athlete", "Staff" or "Automatic". */
  who: string
  byStaff: boolean
  area: string
  kind: string
  fields: string[]
}

const AREA: Record<string, string> = {
  athlete: 'Personal details',
  athlete_athletic: 'Athletic profile',
  athlete_academic: 'Academics',
  athlete_preference: 'College preferences',
  athlete_target_division: 'College preferences (divisions)',
  athlete_major: 'Majors',
  athlete_guardian: 'Parent or guardian',
  athlete_video_link: 'Video link',
  athlete_college: 'College on the list',
  activity_entry: 'Activity log',
  next_step: 'Next step',
  college_coach: 'Own coach contact',
  athlete_staff_assignment: 'Coordinator assignment',
}

const KIND: Record<string, string> = { created: 'Added', updated: 'Changed', deleted: 'Removed', restored: 'Restored' }

/** Fields that change on every write and say nothing to a reader. */
const NOISE = new Set(['id', 'athlete_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'user_id'])

export function describeChange(row: Row, staffNames: Record<string, string>): HistoryItem {
  const role = String(row.changed_by_role)
  const by = row.changed_by == null ? '' : String(row.changed_by)
  const byStaff = role === 'staff' || role === 'admin'
  const who = staffNames[by] || (role === 'athlete' ? 'Athlete' : byStaff ? 'Staff' : 'Automatic')
  const values = (row.new_values ?? row.old_values ?? {}) as Record<string, unknown>
  return {
    id: Number(row.id),
    changedAt: String(row.changed_at),
    who,
    byStaff,
    area: AREA[String(row.table_name)] ?? String(row.table_name).replaceAll('_', ' '),
    kind: KIND[String(row.change_type)] ?? String(row.change_type),
    fields: Object.keys(values)
      .filter((k) => !NOISE.has(k))
      .map((k) => k.replaceAll('_', ' ')),
  }
}

/** The most recent changes to one athlete's records, with who made them (coordinators by name). */
export async function fetchHistory(athleteId: string): Promise<HistoryItem[]> {
  const sb = client()
  const [history, staff] = await Promise.all([
    sb.from('change_history').select('*').eq('athlete_id', athleteId).order('changed_at', { ascending: false }).range(0, 199),
    sb.from('staff_profile').select('user_id, first_name, last_name'),
  ])
  const names: Record<string, string> = {}
  for (const s of ok<Row[]>(staff)) names[String(s.user_id)] = `${String(s.first_name)} ${String(s.last_name)}`.trim()
  return ok<Row[]>(history).map((r) => describeChange(r, names))
}
