import type { Row } from './dbClient'

export const SORTS = [
  { value: 'priority', label: 'Priority' },
  { value: 'silent', label: 'Longest without activity' },
  { value: 'due', label: 'Next step due' },
  { value: 'name', label: 'Name' },
] as const
export type SortKey = (typeof SORTS)[number]['value']

const text = (v: unknown) => (v == null ? '' : String(v))
const byName = (a: Row, b: Row) => text(a.college_name).localeCompare(text(b.college_name))

/** Orders the list. Ties always fall back to the college name so the order is stable. */
export function sortList(rows: Row[], sort: SortKey): Row[] {
  const compare: Record<SortKey, (a: Row, b: Row) => number> = {
    priority: (a, b) => Number(a.priority) - Number(b.priority),
    silent: (a, b) => Number(b.days_silent) - Number(a.days_silent),
    due: (a, b) => {
      const x = a.next_step_due_date
      const y = b.next_step_due_date
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return text(x).localeCompare(text(y))
    },
    name: () => 0,
  }
  return [...rows].sort((a, b) => compare[sort](a, b) || byName(a, b))
}

