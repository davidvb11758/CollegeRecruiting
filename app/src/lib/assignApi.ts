import { client, ok, type Row } from './dbClient'

export type AssignRole = 'primary' | 'secondary'

export type Coordinator = {
  userId: string
  name: string
  /** False for a coordinator whose account or profile is switched off: shown by name where already assigned, never offered. */
  available: boolean
}

export type Assignment = { id: string; athleteId: string; staffUserId: string; role: AssignRole }

export type AssignmentData = { athletes: Row[]; coordinators: Coordinator[]; assignments: Assignment[] }

/** Everything the assignments screen shows. Only an administrator sees all athletes and all assignments; row-level security does that. */
export async function fetchAssignmentData(): Promise<AssignmentData> {
  const sb = client()
  const [roster, staff, accounts, assignments] = await Promise.all([
    sb.from('staff_roster').select('athlete_id, first_name, last_name, team_name, graduation_year').order('last_name').order('first_name'),
    sb.from('staff_profile').select('user_id, first_name, last_name, active'),
    sb.from('app_user').select('user_id, role, status').in('role', ['staff', 'admin']),
    sb.from('athlete_staff_assignment').select('id, athlete_id, staff_user_id, role_on_athlete'),
  ])
  const usable = new Set(ok<Row[]>(accounts).filter((a) => a.status === 'active').map((a) => String(a.user_id)))
  const coordinators = ok<Row[]>(staff)
    .map((s) => ({
      userId: String(s.user_id),
      name: `${String(s.first_name)} ${String(s.last_name)}`.trim(),
      available: s.active !== false && usable.has(String(s.user_id)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    athletes: ok<Row[]>(roster),
    coordinators,
    assignments: ok<Row[]>(assignments).map((a) => ({
      id: String(a.id),
      athleteId: String(a.athlete_id),
      staffUserId: String(a.staff_user_id),
      role: a.role_on_athlete === 'primary' ? 'primary' : 'secondary',
    })),
  }
}

const table = () => client().from('athlete_staff_assignment')

/** Adding a main coordinator moves the previous main one to extra; the database does that in the same statement. */
export async function assignAthlete(v: { athleteId: string; staffUserId: string; role: AssignRole }): Promise<void> {
  ok(await table().insert({ athlete_id: v.athleteId, staff_user_id: v.staffUserId, role_on_athlete: v.role }))
}

export async function setAssignmentRole(v: { id: string; role: AssignRole }): Promise<void> {
  ok(await table().update({ role_on_athlete: v.role }).eq('id', v.id))
}

export async function removeAssignment(id: string): Promise<void> {
  ok(await table().delete().eq('id', id))
}
