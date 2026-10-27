/** Dates are plain YYYY-MM-DD text. "Today" is always the club's day (America/Chicago), never the browser's, so
 *  "overdue" means the same thing on every phone and in the database. */
export const CLUB_TIME_ZONE = 'America/Chicago'

export function clubToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The club-day (YYYY-MM-DD) on which a timestamp such as "2026-11-03T02:15:00Z" happened. */
export const clubDateOf = (timestamp: string): string => clubToday(new Date(timestamp))

const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from b to a (positive when a is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 3", or "Nov 3, 2027" when it is not this year. */
export function formatDate(date: string, today: string = clubToday()): string {
  const [y, m, d] = date.split('-').map(Number)
  const base = `${MONTHS[m - 1]} ${d}`
  return y === Number(today.slice(0, 4)) ? base : `${base}, ${y}`
}

export type DueTone = 'overdue' | 'soon' | 'later'

/** How a due date reads on a card: "Overdue by 3 days", "Due today", "Due in 5 days". */
export function dueLabel(due: string, today: string = clubToday()): { text: string; tone: DueTone } {
  const days = diffDays(due, today)
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'overdue' }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' }
  return { text: `Due in ${days} days`, tone: days <= 7 ? 'soon' : 'later' }
}
