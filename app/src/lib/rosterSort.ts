import type { Row } from './dbClient'

export const ROSTER_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'overdue', label: 'Most overdue next steps' },
  { value: 'quiet', label: 'Longest without activity' },
  { value: 'profile', label: 'Least complete profile' },
] as const

export type RosterSort = (typeof ROSTER_SORTS)[number]['value']

const fullName = (r: Row) => `${String(r.last_name)} ${String(r.first_name)}`.toLowerCase()

/** An athlete with no activity yet counts as the quietest. */
const lastActivity = (r: Row) => (r.last_activity_date == null ? '' : String(r.last_activity_date))

/** Sorts a copy of the roster. Ties fall back to the name so the order never jumps around. */
export function sortRoster(rows: Row[], sort: RosterSort): Row[] {
  const byName = (a: Row, b: Row) => fullName(a).localeCompare(fullName(b))
  const compare: Record<RosterSort, (a: Row, b: Row) => number> = {
    name: byName,
    overdue: (a, b) => Number(b.overdue_count) - Number(a.overdue_count) || byName(a, b),
    quiet: (a, b) => lastActivity(a).localeCompare(lastActivity(b)) || byName(a, b),
    profile: (a, b) => Number(a.profile_pct) - Number(b.profile_pct) || byName(a, b),
  }
  return [...rows].sort(compare[sort])
}

/** Name search: every typed word must start a word in the athlete's name. */
export function matchesName(row: Row, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const name = `${String(row.first_name)} ${String(row.last_name)}`.toLowerCase().split(/\s+/)
  return words.every((w) => name.some((n) => n.startsWith(w)))
}
